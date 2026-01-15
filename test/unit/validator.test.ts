import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { analyzeDTOClass, validateClass } from '../../src/core/validator.js';
import { MissingGetterError } from '../../src/errors.js';
import type { Constructor, LazyQLMetadata } from '../../src/types.js';

// Test DTO with design:type metadata manually applied
// (simulates TypeScript's emitDecoratorMetadata)
function createDecoratedDTO(): Constructor {
  class TestDTO {}

  // Simulate TypeScript decorator metadata
  // Use field names that are in the common GraphQL field patterns
  Reflect.defineMetadata('design:type', String, TestDTO.prototype, 'status');
  Reflect.defineMetadata('design:type', Number, TestDTO.prototype, 'entity_id');
  Reflect.defineMetadata('design:type', String, TestDTO.prototype, 'description'); // Common field

  return TestDTO;
}

// Create metadata helper
function createMetadata(
  dtoClass: Constructor,
  overrides: Partial<LazyQLMetadata> = {}
): LazyQLMetadata {
  return {
    dtoClass,
    fieldMappings: new Map(),
    requiredFields: new Set(),
    optionalFields: new Set(),
    sharedMethods: new Set(),
    options: {},
    ...overrides,
  };
}

describe('validator', () => {
  describe('analyzeDTOClass', () => {
    it('should detect fields with design:type metadata', () => {
      const DTO = createDecoratedDTO();
      const fields = analyzeDTOClass(DTO);

      // Should find the decorated fields
      const fieldNames = fields.map(f => f.name);
      expect(fieldNames).toContain('status');
      expect(fieldNames).toContain('entity_id');
      expect(fieldNames).toContain('description');
    });

    it('should return empty array for undecorated classes', () => {
      class PlainDTO {}
      const fields = analyzeDTOClass(PlainDTO);
      expect(fields).toEqual([]);
    });

    it('should include type information when available', () => {
      const DTO = createDecoratedDTO();
      const fields = analyzeDTOClass(DTO);

      const statusField = fields.find(f => f.name === 'status');
      const entityIdField = fields.find(f => f.name === 'entity_id');

      expect(statusField?.type).toBe(String);
      expect(entityIdField?.type).toBe(Number);
    });
  });

  describe('validateClass', () => {
    it('should pass validation when all required fields have getters', () => {
      const DTO = createDecoratedDTO();

      class TestModel {
        getStatus() {
          return 'ok';
        }
        getEntityId() {
          return 1;
        }
        getDescription() {
          return 'optional';
        }
      }

      const metadata = createMetadata(DTO);
      const warnings = validateClass(TestModel, metadata);

      // No errors, possibly warnings
      expect(warnings).toBeDefined();
    });

    it('should register field mappings during validation', () => {
      const DTO = createDecoratedDTO();

      class TestModel {
        getStatus() {
          return 'ok';
        }
        getEntityId() {
          return 1;
        }
        getDescription() {
          return 'opt';
        }
      }

      const metadata = createMetadata(DTO);
      validateClass(TestModel, metadata);

      // Mappings should be registered
      expect(metadata.fieldMappings.get('status')).toBe('getStatus');
      expect(metadata.fieldMappings.get('entity_id')).toBe('getEntityId');
    });

    it('should not throw for optional fields without getters', () => {
      // Create DTO where all fields are detected as required (design:type only)
      class DTO {}
      // Mark only status as having metadata (it will be detected as required)
      Reflect.defineMetadata('design:type', String, DTO.prototype, 'status');

      class TestModel {
        getStatus() {
          return 'ok';
        }
        // No getter for entity_id
      }

      const metadata = createMetadata(DTO);

      // Should not throw since only status is detected
      expect(() => validateClass(TestModel, metadata)).not.toThrow();
    });

    it('should skip validation when DTO fields cannot be detected', () => {
      // Plain DTO with no metadata
      class PlainDTO {}

      class TestModel {
        getStatus() {
          return 'ok';
        }
        getAnything() {
          return 'any';
        }
      }

      const metadata = createMetadata(PlainDTO);
      const warnings = validateClass(TestModel, metadata);

      // Should have a warning about skipped validation
      expect(warnings.some(w => w.includes('Could not detect fields'))).toBe(true);

      // All getters should be registered as field mappings
      expect(metadata.fieldMappings.has('status')).toBe(true);
      expect(metadata.fieldMappings.has('anything')).toBe(true);
    });

    it('should use explicit field mappings when provided', () => {
      const DTO = createDecoratedDTO();

      class TestModel {
        getStatusValue() {
          return 'using custom name';
        }
        getEntityId() {
          return 1;
        }
        getDescription() {
          return 'opt';
        }
      }

      const metadata = createMetadata(DTO, {
        // Map 'status' field to 'getStatusValue' instead of default 'getStatus'
        fieldMappings: new Map([['status', 'getStatusValue']]),
      });

      // Should not throw because explicit mapping exists
      const warnings = validateClass(TestModel, metadata);
      expect(metadata.fieldMappings.get('status')).toBe('getStatusValue');
    });

    it('should exclude @Shared methods from getter warnings', () => {
      class DTO {}
      // No fields detected, validation will be skipped

      class TestModel {
        getStatus() {
          return 'ok';
        }
        getSharedData() {
          return { shared: true };
        }
      }

      const metadata = createMetadata(DTO, {
        sharedMethods: new Set(['getSharedData']),
      });

      const warnings = validateClass(TestModel, metadata);

      // getSharedData should not be mapped as a field getter
      expect(metadata.fieldMappings.has('shared_data')).toBe(false);
    });
  });

  describe('nullability detection', () => {
    it('should include detectionMethod in analyzed fields', () => {
      const DTO = createDecoratedDTO();
      const fields = analyzeDTOClass(DTO);

      // All fields should have design-type detection method
      for (const field of fields) {
        expect(field.detectionMethod).toBe('design-type');
      }
    });

    it('should warn instead of throwing for design-type detected fields without getters', () => {
      class DTO {}
      // These fields are detected via design:type - low confidence
      // Use field names that are in the common fields list in scanForDecoratedFields
      Reflect.defineMetadata('design:type', String, DTO.prototype, 'status');
      Reflect.defineMetadata('design:type', String, DTO.prototype, 'email'); // Common field name

      class TestModel {
        getStatus() {
          return 'ok';
        }
        // No getter for email
      }

      const metadata = createMetadata(DTO);

      // Should NOT throw because design:type fields have low confidence
      expect(() => validateClass(TestModel, metadata)).not.toThrow();

      const warnings = validateClass(TestModel, metadata);

      // Should have a warning about the missing getter
      expect(warnings.some(w => w.includes('email') && w.includes('design:type'))).toBe(true);

      // Field should be marked as optional since we can't determine nullability
      expect(metadata.optionalFields.has('email')).toBe(true);
    });

    it('should register missing design-type fields as optional', () => {
      class DTO {}
      // Use common field names that will be detected
      Reflect.defineMetadata('design:type', String, DTO.prototype, 'name');
      Reflect.defineMetadata('design:type', String, DTO.prototype, 'title');

      class TestModel {
        getName() {
          return 'value';
        }
        // No getter for title
      }

      const metadata = createMetadata(DTO);
      validateClass(TestModel, metadata);

      // Missing fields from design:type should be in optionalFields, not requiredFields
      expect(metadata.optionalFields.has('title')).toBe(true);
      expect(metadata.requiredFields.has('title')).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle camelCase to snake_case conversion', () => {
      class DTO {}
      Reflect.defineMetadata('design:type', String, DTO.prototype, 'customer_email');
      Reflect.defineMetadata('design:type', String, DTO.prototype, 'grand_total');

      class TestModel {
        getCustomerEmail() {
          return 'test@example.com';
        }
        getGrandTotal() {
          return '99.99';
        }
      }

      const metadata = createMetadata(DTO);
      const warnings = validateClass(TestModel, metadata);

      expect(metadata.fieldMappings.get('customer_email')).toBe('getCustomerEmail');
      expect(metadata.fieldMappings.get('grand_total')).toBe('getGrandTotal');
    });

    it('should work with inherited getter methods', () => {
      class DTO {}
      Reflect.defineMetadata('design:type', String, DTO.prototype, 'base_field');
      Reflect.defineMetadata('design:type', String, DTO.prototype, 'derived_field');

      class BaseModel {
        getBaseField() {
          return 'base';
        }
      }

      class DerivedModel extends BaseModel {
        getDerivedField() {
          return 'derived';
        }
      }

      const metadata = createMetadata(DTO);
      const warnings = validateClass(DerivedModel, metadata);

      expect(metadata.fieldMappings.get('base_field')).toBe('getBaseField');
      expect(metadata.fieldMappings.get('derived_field')).toBe('getDerivedField');
    });
  });
});
