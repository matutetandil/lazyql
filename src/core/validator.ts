import 'reflect-metadata';
import type { Constructor, DTOFieldInfo, LazyQLMetadata } from '../types.js';
import { MissingGetterError } from '../errors.js';
import { fieldToGetterName, getGetterMethods, getterToFieldName } from './getter-mapper.js';

// NestJS GraphQL metadata keys
const GRAPHQL_METADATA_KEY = 'design:type';

/**
 * Try to get NestJS GraphQL fields by intercepting field registration.
 * This approach temporarily patches TypeMetadataStorage to capture fields
 * when lazy metadata functions are executed.
 */
function tryGetNestJSFields(dtoClass: Constructor): DTOFieldInfo[] | null {
  try {
    // Dynamic imports to avoid hard dependency on @nestjs/graphql
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nestGraphql = require('@nestjs/graphql');

    const { TypeMetadataStorage } = nestGraphql;
    if (!TypeMetadataStorage) return null;

    // First, check if fields are already registered (happens after GraphQL module init)
    const existingFields = TypeMetadataStorage.getClassFieldsByPredicate(
      (f: { target: Constructor }) => f.target === dtoClass
    );

    if (existingFields && existingFields.length > 0) {
      return existingFields.map(
        (f: { name: string; schemaName?: string; options?: { nullable?: boolean } }) => ({
          name: f.schemaName || f.name,
          isRequired: !f.options?.nullable,
          type: undefined,
        })
      );
    }

    // Fields not registered yet - try to trigger lazy metadata loading
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lazyStorage = require('@nestjs/graphql/dist/schema-builder/storages/lazy-metadata.storage');
    const { LazyMetadataStorage } = lazyStorage;

    if (!LazyMetadataStorage) return null;

    // Capture fields by intercepting addClassFieldMetadata
    const capturedFields: DTOFieldInfo[] = [];
    const originalAddField = TypeMetadataStorage.addClassFieldMetadata;

    // Patch the method to capture field registrations for our DTO
    TypeMetadataStorage.addClassFieldMetadata = function (
      metadata: { target: Constructor; name: string; schemaName?: string; options?: { nullable?: boolean } }
    ) {
      if (metadata.target === dtoClass) {
        capturedFields.push({
          name: metadata.schemaName || metadata.name,
          isRequired: !metadata.options?.nullable,
          type: undefined,
        });
      }
      // Call original method
      return originalAddField.call(this, metadata);
    };

    try {
      // Try to load lazy metadata for this specific class
      const storage = LazyMetadataStorage.lazyMetadataByTarget;
      if (storage) {
        // Execute lazy functions for the DTO class
        for (const [key, functions] of storage.entries()) {
          if (key === dtoClass) {
            if (Array.isArray(functions)) {
              functions.forEach((fn: () => void) => {
                try {
                  fn();
                } catch {
                  // Function may have already been called
                }
              });
            }
          }
        }

        // Also execute field-specific lazy metadata (Symbol key)
        for (const [key, functions] of storage.entries()) {
          if (typeof key === 'symbol' && key.toString().includes('FIELD_LAZY_METADATA')) {
            if (Array.isArray(functions)) {
              functions.forEach((fn: () => void) => {
                try {
                  fn();
                } catch {
                  // Function may have already been called
                }
              });
            }
          }
        }
      }
    } finally {
      // Always restore the original method
      TypeMetadataStorage.addClassFieldMetadata = originalAddField;
    }

    if (capturedFields.length > 0) {
      return capturedFields;
    }

    // Final attempt: check storage again after triggering lazy functions
    const fieldsAfterLoad = TypeMetadataStorage.getClassFieldsByPredicate(
      (f: { target: Constructor }) => f.target === dtoClass
    );

    if (fieldsAfterLoad && fieldsAfterLoad.length > 0) {
      return fieldsAfterLoad.map(
        (f: { name: string; schemaName?: string; options?: { nullable?: boolean } }) => ({
          name: f.schemaName || f.name,
          isRequired: !f.options?.nullable,
          type: undefined,
        })
      );
    }

    return null;
  } catch {
    // NestJS GraphQL not available or different version
    return null;
  }
}

/**
 * Try to enumerate fields by scanning for design:type metadata.
 * This works when TypeScript's emitDecoratorMetadata is enabled.
 * Uses multiple strategies to discover property names.
 */
function scanForDecoratedFields(dtoClass: Constructor): DTOFieldInfo[] {
  const fields: DTOFieldInfo[] = [];
  const prototype = dtoClass.prototype;

  // Collect potential property names from various sources
  const potentialNames = new Set<string>();

  // Strategy 1: Try to get names from an instance
  try {
    const instance = new (dtoClass as new () => object)();
    Object.keys(instance).forEach(k => potentialNames.add(k));
    Object.getOwnPropertyNames(instance).forEach(k => potentialNames.add(k));
  } catch {
    // Constructor requires arguments, can't create instance
  }

  // Strategy 2: Get names from prototype
  Object.getOwnPropertyNames(prototype)
    .filter(p => p !== 'constructor')
    .forEach(p => potentialNames.add(p));

  // Strategy 3: Parse the class source code for property declarations
  // This extracts property names from TypeScript compiled output
  try {
    const classSource = dtoClass.toString();
    // Look for patterns like: this.propertyName or "propertyName":
    const patterns = [
      /this\.(\w+)\s*=/g,                    // this.prop =
      /"(\w+)":/g,                            // "prop":
      /__decorate\([^)]+,\s*\w+\.prototype,\s*"(\w+)"/g, // __decorate(..., Class.prototype, "prop"
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(classSource)) !== null) {
        if (match[1] && match[1] !== 'constructor') {
          potentialNames.add(match[1]);
        }
      }
    }
  } catch {
    // Source parsing failed
  }

  // Strategy 4: Check Reflect metadata for common GraphQL field patterns
  // Common patterns in snake_case and camelCase
  const commonSuffixes = ['id', 'name', 'email', 'status', 'type', 'date', 'time', 'count', 'total', 'code'];
  const commonPrefixes = ['is_', 'has_', 'can_', 'should_', 'created_', 'updated_', 'entity_', 'customer_'];

  for (const suffix of commonSuffixes) {
    potentialNames.add(suffix);
    potentialNames.add(`${suffix}_id`);
    for (const prefix of commonPrefixes) {
      potentialNames.add(`${prefix}${suffix}`);
    }
  }

  // Add common GraphQL scalar field names
  const commonFields = [
    // Identity fields
    'id', 'entity_id', 'increment_id', 'uuid', 'sku', 'code', 'slug',
    // Basic info
    'name', 'title', 'description', 'label', 'value', 'content',
    // Status fields
    'status', 'state', 'type', 'kind', 'category', 'group',
    // Contact info
    'email', 'phone', 'address', 'url', 'website',
    // Timestamps
    'created_at', 'updated_at', 'deleted_at', 'published_at',
    // Money/pricing
    'price', 'cost', 'amount', 'grand_total', 'subtotal', 'tax', 'discount',
    'currency_code', 'currency',
    // Customer fields
    'customer_email', 'customer_name', 'customer_id',
    // Order/shipping
    'shipping_method', 'payment_method',
    'estimated_delivery', 'fraud_score',
    // Product fields
    'inventory', 'stock', 'quantity', 'weight', 'dimensions',
    'image', 'thumbnail', 'images', 'media',
    'recommendation_score', 'rating', 'reviews',
    'warehouse_location', 'restock_date', 'product_count',
    // Collections
    'items', 'total_count', 'page_info', 'edges', 'nodes',
    // Meta
    'meta', 'metadata', 'attributes', 'options', 'settings',
  ];

  commonFields.forEach(f => potentialNames.add(f));

  // Check each potential name for design:type metadata
  for (const name of potentialNames) {
    const designType = Reflect.getMetadata(GRAPHQL_METADATA_KEY, prototype, name);
    if (designType) {
      // Found a field with metadata!
      fields.push({
        name,
        isRequired: true, // Can't determine nullability from design:type alone
        type: designType,
      });
    }
  }

  return fields;
}

/**
 * Analyzes a NestJS GraphQL DTO class to extract field information.
 * Tries multiple strategies:
 * 1. NestJS GraphQL TypeMetadataStorage (triggers lazy loading)
 * 2. Scanning for design:type metadata
 * 3. Returns empty array if fields cannot be determined
 */
export function analyzeDTOClass(dtoClass: Constructor): DTOFieldInfo[] {
  // Try NestJS GraphQL TypeMetadataStorage first (with lazy loading)
  const nestJSFields = tryGetNestJSFields(dtoClass);
  if (nestJSFields && nestJSFields.length > 0) {
    return nestJSFields;
  }

  // Fall back to scanning for decorated fields
  const scannedFields = scanForDecoratedFields(dtoClass);
  if (scannedFields.length > 0) {
    return scannedFields;
  }

  // Could not determine fields - return empty array
  return [];
}

/**
 * Validates that a LazyQL class has all required getters for its DTO.
 * Throws MissingGetterError if a required field is missing.
 * Returns warnings for optional fields without getters.
 *
 * If DTO fields cannot be detected, validation is skipped and all getters
 * are registered as field mappings.
 */
export function validateClass(
  lazyClass: Constructor,
  metadata: LazyQLMetadata
): string[] {
  const warnings: string[] = [];
  const className = lazyClass.name;
  const prototype = lazyClass.prototype;

  // Get all getter methods in the class
  const getterMethods = getGetterMethods(prototype);

  // Get explicit field mappings from @Field decorators
  const explicitMappings = metadata.fieldMappings;

  // Analyze the DTO to get required and optional fields
  const dtoFields = analyzeDTOClass(metadata.dtoClass);

  // If no fields detected, skip strict validation and register all getters
  if (dtoFields.length === 0) {
    warnings.push(
      `Could not detect fields in DTO "${metadata.dtoClass.name}". ` +
      `Validation skipped - all getters will be registered.`
    );

    // Register all getters as field mappings
    for (const getterName of getterMethods) {
      if (!metadata.sharedMethods.has(getterName)) {
        const fieldName = getterToFieldName(getterName);
        metadata.fieldMappings.set(fieldName, getterName);
      }
    }

    return warnings;
  }

  // Log successful detection
  console.log(`[LazyQL] Detected ${dtoFields.length} fields in DTO "${metadata.dtoClass.name}": ${dtoFields.map(f => f.name).join(', ')}`);

  // Strict validation when fields are detected
  for (const field of dtoFields) {
    // Check if there's an explicit mapping
    if (explicitMappings.has(field.name)) {
      const getterName = explicitMappings.get(field.name)!;
      if (!getterMethods.includes(getterName)) {
        if (field.isRequired) {
          throw new MissingGetterError(className, field.name);
        } else {
          warnings.push(
            `Optional field "${field.name}" has explicit mapping to "${getterName}" but method not found`
          );
        }
      }
      continue;
    }

    // Check using naming convention
    const expectedGetter = fieldToGetterName(field.name);
    const hasGetter = getterMethods.includes(expectedGetter);

    if (!hasGetter) {
      if (field.isRequired) {
        throw new MissingGetterError(className, field.name);
      } else {
        warnings.push(
          `Optional field "${field.name}" has no getter. Expected: ${expectedGetter}(). Will return null.`
        );
        metadata.optionalFields.add(field.name);
      }
    } else {
      // Store the mapping
      metadata.fieldMappings.set(field.name, expectedGetter);
      if (field.isRequired) {
        metadata.requiredFields.add(field.name);
      } else {
        metadata.optionalFields.add(field.name);
      }
    }
  }

  // Warn about getters that don't match any DTO field
  for (const getterName of getterMethods) {
    const fieldName = getterToFieldName(getterName);
    const hasExplicitMapping = Array.from(explicitMappings.values()).includes(getterName);
    const hasConventionMapping = metadata.fieldMappings.has(fieldName);

    if (!hasExplicitMapping && !hasConventionMapping) {
      const matchesAnyField = dtoFields.some(f => f.name === fieldName);
      if (!matchesAnyField && !metadata.sharedMethods.has(getterName)) {
        warnings.push(
          `Getter "${getterName}" does not match any field in DTO "${metadata.dtoClass.name}"`
        );
      }
    }
  }

  return warnings;
}
