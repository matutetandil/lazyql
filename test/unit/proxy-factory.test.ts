import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLazyProxy,
  isLazyProxy,
  getOriginalInstance,
  LAZY_INSTANCE,
  IS_LAZY_PROXY,
} from '../../src/core/proxy-factory.js';
import { registerClass, clearRegistry } from '../../src/core/registry.js';
import type { LazyQLMetadata } from '../../src/types.js';

// Mock DTO class
class TestDTO {
  status: string;
  entity_id: number;
  optional_field?: string;
}

// Helper to create basic metadata
function createMetadata(
  overrides: Partial<LazyQLMetadata> = {}
): LazyQLMetadata {
  return {
    dtoClass: TestDTO,
    fieldMappings: new Map([
      ['status', 'getStatus'],
      ['entity_id', 'getEntityId'],
    ]),
    requiredFields: new Set(['status', 'entity_id']),
    optionalFields: new Set(['optional_field']),
    sharedMethods: new Set(),
    options: {},
    ...overrides,
  };
}

describe('proxy-factory', () => {
  describe('createLazyProxy', () => {
    it('should intercept field access and call corresponding getter', () => {
      class TestModel {
        getStatus() {
          return 'active';
        }
        getEntityId() {
          return 42;
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      // Access fields through proxy
      expect((proxy as unknown as { status: string }).status).toBe('active');
      expect((proxy as unknown as { entity_id: number }).entity_id).toBe(42);
    });

    it('should only call getters for accessed fields', () => {
      const statusGetter = vi.fn().mockReturnValue('pending');
      const entityIdGetter = vi.fn().mockReturnValue(123);

      class TestModel {
        getStatus = statusGetter;
        getEntityId = entityIdGetter;
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      // Only access status
      (proxy as unknown as { status: string }).status;

      expect(statusGetter).toHaveBeenCalledTimes(1);
      expect(entityIdGetter).not.toHaveBeenCalled();
    });

    it('should return null for optional fields without getters', () => {
      class TestModel {
        getStatus() {
          return 'active';
        }
        getEntityId() {
          return 1;
        }
        // No getter for optional_field
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      expect((proxy as unknown as { optional_field: string | null }).optional_field).toBeNull();
    });

    it('should use naming convention when no explicit mapping exists', () => {
      class TestModel {
        getUnmappedField() {
          return 'works';
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata({
        fieldMappings: new Map(), // Empty mappings
      });
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      // Should use convention: unmapped_field -> getUnmappedField
      expect((proxy as unknown as { unmapped_field: string }).unmapped_field).toBe('works');
    });

    it('should allow access to special symbols', () => {
      class TestModel {
        getStatus() {
          return 'active';
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      expect((proxy as unknown as Record<symbol, unknown>)[LAZY_INSTANCE]).toBe(instance);
      expect((proxy as unknown as Record<symbol, unknown>)[IS_LAZY_PROXY]).toBe(true);
    });

    it('should pass through non-field property access', () => {
      class TestModel {
        someMethod() {
          return 'method result';
        }
        getStatus() {
          return 'active';
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      expect((proxy as TestModel).someMethod()).toBe('method result');
    });

    it('should handle async getters', async () => {
      class TestModel {
        async getStatus() {
          return Promise.resolve('async-status');
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      const result = await (proxy as unknown as { status: Promise<string> }).status;
      expect(result).toBe('async-status');
    });
  });

  describe('@Shared method caching', () => {
    it('should cache sync @Shared method results', () => {
      let callCount = 0;

      class TestModel {
        getSharedData() {
          callCount++;
          return { data: 'shared' };
        }

        getStatus() {
          return this.getSharedData().data;
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata({
        sharedMethods: new Set(['getSharedData']),
      });
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      // Access multiple times
      (proxy as TestModel).getSharedData();
      (proxy as TestModel).getSharedData();
      (proxy as TestModel).getSharedData();

      // Should only be called once due to caching
      expect(callCount).toBe(1);
    });

    it('should cache async @Shared method results', async () => {
      let callCount = 0;

      class TestModel {
        async getSharedDataAsync() {
          callCount++;
          return Promise.resolve({ data: 'async-shared' });
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata({
        sharedMethods: new Set(['getSharedDataAsync']),
      });
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      // Call multiple times concurrently
      const results = await Promise.all([
        (proxy as TestModel).getSharedDataAsync(),
        (proxy as TestModel).getSharedDataAsync(),
        (proxy as TestModel).getSharedDataAsync(),
      ]);

      // All should get the same cached result
      expect(results[0]).toEqual({ data: 'async-shared' });
      expect(results[1]).toEqual({ data: 'async-shared' });
      expect(results[2]).toEqual({ data: 'async-shared' });

      // Should only be called once
      expect(callCount).toBe(1);
    });

    it('should allow internal methods to use cached @Shared methods', () => {
      let sharedCallCount = 0;

      class TestModel {
        getSharedData() {
          sharedCallCount++;
          return { total: 100, currency: 'USD' };
        }

        getGrandTotal() {
          return this.getSharedData().total;
        }

        getCurrency() {
          return this.getSharedData().currency;
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata({
        sharedMethods: new Set(['getSharedData']),
        fieldMappings: new Map([
          ['grand_total', 'getGrandTotal'],
          ['currency', 'getCurrency'],
        ]),
      });
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      // Access both fields which use getSharedData internally
      const total = (proxy as unknown as { grand_total: number }).grand_total;
      const currency = (proxy as unknown as { currency: string }).currency;

      expect(total).toBe(100);
      expect(currency).toBe('USD');

      // getSharedData should only be called once thanks to caching
      expect(sharedCallCount).toBe(1);
    });

    it('should maintain separate caches per proxy instance', () => {
      let instanceACallCount = 0;
      let instanceBCallCount = 0;

      class TestModel {
        constructor(private name: string) {}

        getSharedData() {
          if (this.name === 'A') instanceACallCount++;
          else instanceBCallCount++;
          return { name: this.name };
        }
      }

      const metadata = createMetadata({
        sharedMethods: new Set(['getSharedData']),
      });

      const instanceA = new TestModel('A');
      const instanceB = new TestModel('B');

      const proxyA = createLazyProxy(instanceA, metadata, 'TestModel');
      const proxyB = createLazyProxy(instanceB, metadata, 'TestModel');

      // Call on both proxies
      (proxyA as TestModel).getSharedData();
      (proxyA as TestModel).getSharedData();
      (proxyB as TestModel).getSharedData();
      (proxyB as TestModel).getSharedData();

      // Each should only be called once per instance
      expect(instanceACallCount).toBe(1);
      expect(instanceBCallCount).toBe(1);
    });
  });

  describe('isLazyProxy', () => {
    it('should return true for LazyQL proxies', () => {
      class TestModel {
        getStatus() {
          return 'active';
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      expect(isLazyProxy(proxy)).toBe(true);
    });

    it('should return false for regular objects', () => {
      expect(isLazyProxy({})).toBe(false);
      expect(isLazyProxy([])).toBe(false);
      expect(isLazyProxy(new Date())).toBe(false);
    });

    it('should return false for primitives and null', () => {
      expect(isLazyProxy(null)).toBe(false);
      expect(isLazyProxy(undefined)).toBe(false);
      expect(isLazyProxy(42)).toBe(false);
      expect(isLazyProxy('string')).toBe(false);
    });
  });

  describe('getOriginalInstance', () => {
    it('should return the original instance from a proxy', () => {
      class TestModel {
        getStatus() {
          return 'active';
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      expect(getOriginalInstance(proxy)).toBe(instance);
    });

    it('should return the same object if not a proxy', () => {
      const obj = { foo: 'bar' };
      expect(getOriginalInstance(obj)).toBe(obj);
    });
  });

  describe('Proxy behavior', () => {
    it('should support Object.keys on proxy', () => {
      class TestModel {
        getStatus() {
          return 'active';
        }
        getEntityId() {
          return 1;
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      const keys = Object.keys(proxy);

      expect(keys).toContain('status');
      expect(keys).toContain('entity_id');
      expect(keys).toContain('optional_field');
    });

    it('should support "in" operator', () => {
      class TestModel {
        getStatus() {
          return 'active';
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      expect('status' in proxy).toBe(true);
      expect('nonexistent' in proxy).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should propagate sync errors from getters', () => {
      class TestModel {
        getStatus() {
          throw new Error('Sync getter error');
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      expect(() => (proxy as unknown as { status: string }).status).toThrow('Sync getter error');
    });

    it('should propagate async errors from getters', async () => {
      class TestModel {
        async getStatus() {
          throw new Error('Async getter error');
        }
      }

      const instance = new TestModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'TestModel');

      await expect((proxy as unknown as { status: Promise<string> }).status).rejects.toThrow(
        'Async getter error'
      );
    });

    it('should call custom error handler when configured', async () => {
      const { configure, resetConfig } = await import('../../src/core/config.js');

      const errorHandler = vi.fn().mockImplementation((ctx) => {
        return new Error(`Transformed: ${ctx.error.message}`);
      });

      configure({ onError: errorHandler });

      try {
        class TestModel {
          getStatus() {
            throw new Error('Original error');
          }
        }

        const instance = new TestModel();
        const metadata = createMetadata();
        const proxy = createLazyProxy(instance, metadata, 'TestModel');

        expect(() => (proxy as unknown as { status: string }).status).toThrow('Transformed: Original error');
        expect(errorHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            className: 'TestModel',
            fieldName: 'status',
            getterName: 'getStatus',
          })
        );
      } finally {
        resetConfig();
      }
    });

    it('should suppress error when handler returns null', async () => {
      const { configure, resetConfig } = await import('../../src/core/config.js');

      configure({ onError: () => null });

      try {
        class TestModel {
          getStatus() {
            throw new Error('Suppressed error');
          }
        }

        const instance = new TestModel();
        const metadata = createMetadata();
        const proxy = createLazyProxy(instance, metadata, 'TestModel');

        const result = (proxy as unknown as { status: string | null }).status;
        expect(result).toBeNull();
      } finally {
        resetConfig();
      }
    });
  });

  describe('Debug mode', () => {
    it('should log getter execution when debug is enabled per-class', async () => {
      const { resetConfig } = await import('../../src/core/config.js');
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      try {
        class TestModel {
          getStatus() {
            return 'active';
          }
        }

        const instance = new TestModel();
        const metadata = createMetadata({ options: { debug: true } });
        const proxy = createLazyProxy(instance, metadata, 'TestModel');

        (proxy as unknown as { status: string }).status;

        // Logger combines prefix and message into a single string
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\[LazyQL\].*getStatus/)
        );
      } finally {
        consoleSpy.mockRestore();
        resetConfig();
      }
    });

    it('should log getter execution when debug is enabled globally', async () => {
      const { configure, resetConfig } = await import('../../src/core/config.js');
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      configure({ debug: true });

      try {
        class TestModel {
          getStatus() {
            return 'active';
          }
        }

        const instance = new TestModel();
        const metadata = createMetadata();
        const proxy = createLazyProxy(instance, metadata, 'TestModel');

        (proxy as unknown as { status: string }).status;

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\[LazyQL\].*getStatus/)
        );
      } finally {
        consoleSpy.mockRestore();
        resetConfig();
      }
    });

    it('should use custom logger when configured', async () => {
      const { configure, resetConfig } = await import('../../src/core/config.js');

      const customLogger = vi.fn();
      configure({ debug: true, logger: customLogger });

      try {
        class TestModel {
          getStatus() {
            return 'active';
          }
        }

        const instance = new TestModel();
        const metadata = createMetadata();
        const proxy = createLazyProxy(instance, metadata, 'TestModel');

        (proxy as unknown as { status: string }).status;

        expect(customLogger).toHaveBeenCalledWith(
          'debug',
          expect.stringContaining('getStatus'),
          undefined // No metadata passed for basic debug logs
        );
      } finally {
        resetConfig();
      }
    });
  });

  describe('Class inheritance', () => {
    it('should work with inherited getter methods', () => {
      class BaseModel {
        getStatus() {
          return 'base-status';
        }
      }

      class DerivedModel extends BaseModel {
        getEntityId() {
          return 42;
        }
      }

      const instance = new DerivedModel();
      const metadata = createMetadata({
        fieldMappings: new Map([
          ['status', 'getStatus'],
          ['entity_id', 'getEntityId'],
        ]),
      });
      const proxy = createLazyProxy(instance, metadata, 'DerivedModel');

      // Should access both inherited and own getters
      expect((proxy as unknown as { status: string }).status).toBe('base-status');
      expect((proxy as unknown as { entity_id: number }).entity_id).toBe(42);
    });

    it('should allow derived class to override parent getter', () => {
      class BaseModel {
        getStatus() {
          return 'base-status';
        }
      }

      class DerivedModel extends BaseModel {
        getStatus() {
          return 'derived-status';
        }
      }

      const instance = new DerivedModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'DerivedModel');

      // Should use the overridden getter
      expect((proxy as unknown as { status: string }).status).toBe('derived-status');
    });

    it('should allow derived class to call super getter', () => {
      class BaseModel {
        protected baseValue = 'base';

        getStatus() {
          return this.baseValue;
        }
      }

      class DerivedModel extends BaseModel {
        private derivedValue = '-derived';

        getStatus() {
          return super.getStatus() + this.derivedValue;
        }
      }

      const instance = new DerivedModel();
      const metadata = createMetadata();
      const proxy = createLazyProxy(instance, metadata, 'DerivedModel');

      expect((proxy as unknown as { status: string }).status).toBe('base-derived');
    });

    it('should cache @Shared methods from parent class', () => {
      let parentSharedCallCount = 0;

      class BaseModel {
        getSharedData() {
          parentSharedCallCount++;
          return { value: 'shared' };
        }
      }

      class DerivedModel extends BaseModel {
        getStatus() {
          return this.getSharedData().value;
        }

        getEntityId() {
          return this.getSharedData().value.length;
        }
      }

      const instance = new DerivedModel();
      const metadata = createMetadata({
        sharedMethods: new Set(['getSharedData']),
        fieldMappings: new Map([
          ['status', 'getStatus'],
          ['entity_id', 'getEntityId'],
        ]),
      });
      const proxy = createLazyProxy(instance, metadata, 'DerivedModel');

      // Access both fields which use the inherited @Shared method
      (proxy as unknown as { status: string }).status;
      (proxy as unknown as { entity_id: number }).entity_id;

      // Parent's @Shared method should only be called once
      expect(parentSharedCallCount).toBe(1);
    });
  });

  describe('Nested proxy support', () => {
    afterEach(() => {
      clearRegistry();
    });

    it('should not wrap nested objects when nestedProxy is disabled (default)', () => {
      // Create a nested class
      class NestedDTO {}
      class NestedModel {
        getValue() {
          return 'nested-value';
        }
      }

      // Register the nested class
      const nestedMetadata: LazyQLMetadata = {
        dtoClass: NestedDTO,
        fieldMappings: new Map([['value', 'getValue']]),
        requiredFields: new Set(['value']),
        optionalFields: new Set(),
        sharedMethods: new Set(),
        options: {},
      };
      registerClass(NestedModel, nestedMetadata);

      // Create parent model that returns nested instance
      class ParentModel {
        getNested() {
          // Return plain instance, not a proxy
          const nested = Object.create(NestedModel.prototype);
          nested.getValue = () => 'nested-value';
          Object.setPrototypeOf(nested, NestedModel.prototype);
          return nested;
        }
      }

      const instance = new ParentModel();
      const metadata = createMetadata({
        fieldMappings: new Map([['nested', 'getNested']]),
        options: { nestedProxy: false }, // Explicitly disabled
      });
      const proxy = createLazyProxy(instance, metadata, 'ParentModel');

      const nested = (proxy as unknown as { nested: object }).nested;

      // Should NOT be a proxy since nestedProxy is disabled
      expect(isLazyProxy(nested)).toBe(false);
    });

    it('should wrap nested objects when nestedProxy is enabled', () => {
      // Create a nested class
      class NestedDTO {}
      class NestedModel {
        getValue() {
          return 'nested-value';
        }
      }

      // Register the nested class
      const nestedMetadata: LazyQLMetadata = {
        dtoClass: NestedDTO,
        fieldMappings: new Map([['value', 'getValue']]),
        requiredFields: new Set(['value']),
        optionalFields: new Set(),
        sharedMethods: new Set(),
        options: {},
      };
      registerClass(NestedModel, nestedMetadata);

      // Create parent model that returns nested instance
      class ParentModel {
        getNested() {
          // Return plain instance, not a proxy
          const nested = Object.create(NestedModel.prototype);
          nested.getValue = () => 'nested-value';
          return nested;
        }
      }

      const instance = new ParentModel();
      const metadata = createMetadata({
        fieldMappings: new Map([['nested', 'getNested']]),
        options: { nestedProxy: true }, // Enabled
      });
      const proxy = createLazyProxy(instance, metadata, 'ParentModel');

      const nested = (proxy as unknown as { nested: object }).nested;

      // Should be a proxy since nestedProxy is enabled
      expect(isLazyProxy(nested)).toBe(true);

      // Should be able to access fields through the proxy
      expect((nested as unknown as { value: string }).value).toBe('nested-value');
    });

    it('should wrap arrays of nested objects when nestedProxy is enabled', () => {
      // Create a nested class
      class ItemDTO {}
      class ItemModel {
        constructor(private id: number) {}
        getId() {
          return this.id;
        }
      }

      // Register the nested class
      const itemMetadata: LazyQLMetadata = {
        dtoClass: ItemDTO,
        fieldMappings: new Map([['id', 'getId']]),
        requiredFields: new Set(['id']),
        optionalFields: new Set(),
        sharedMethods: new Set(),
        options: {},
      };
      registerClass(ItemModel, itemMetadata);

      // Create parent model that returns array of nested instances
      class ParentModel {
        getItems() {
          // Return plain instances, not proxies
          return [1, 2, 3].map(id => {
            const item = Object.create(ItemModel.prototype);
            item.getId = () => id;
            return item;
          });
        }
      }

      const instance = new ParentModel();
      const metadata = createMetadata({
        fieldMappings: new Map([['items', 'getItems']]),
        options: { nestedProxy: true },
      });
      const proxy = createLazyProxy(instance, metadata, 'ParentModel');

      const items = (proxy as unknown as { items: object[] }).items;

      // Should be an array
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(3);

      // Each item should be a proxy
      for (const item of items) {
        expect(isLazyProxy(item)).toBe(true);
      }

      // Should be able to access fields through each proxy
      expect((items[0] as unknown as { id: number }).id).toBe(1);
      expect((items[1] as unknown as { id: number }).id).toBe(2);
      expect((items[2] as unknown as { id: number }).id).toBe(3);
    });

    it('should not double-wrap objects that are already proxies', () => {
      // Create a nested class
      class NestedDTO {}
      class NestedModel {
        getValue() {
          return 'nested-value';
        }
      }

      // Register the nested class
      const nestedMetadata: LazyQLMetadata = {
        dtoClass: NestedDTO,
        fieldMappings: new Map([['value', 'getValue']]),
        requiredFields: new Set(['value']),
        optionalFields: new Set(),
        sharedMethods: new Set(),
        options: {},
      };
      registerClass(NestedModel, nestedMetadata);

      // Create a proxy of nested model
      const nestedInstance = new NestedModel();
      const nestedProxy = createLazyProxy(nestedInstance, nestedMetadata, 'NestedModel');

      // Create parent model that returns an already-proxied instance
      class ParentModel {
        getNested() {
          return nestedProxy; // Already a proxy
        }
      }

      const instance = new ParentModel();
      const metadata = createMetadata({
        fieldMappings: new Map([['nested', 'getNested']]),
        options: { nestedProxy: true },
      });
      const proxy = createLazyProxy(instance, metadata, 'ParentModel');

      const nested = (proxy as unknown as { nested: object }).nested;

      // Should still be a proxy
      expect(isLazyProxy(nested)).toBe(true);

      // Should be the same proxy (not double-wrapped)
      expect(nested).toBe(nestedProxy);

      // Should work correctly
      expect((nested as unknown as { value: string }).value).toBe('nested-value');
    });

    it('should handle async getters returning nested objects', async () => {
      // Create a nested class
      class NestedDTO {}
      class NestedModel {
        getValue() {
          return 'async-nested-value';
        }
      }

      // Register the nested class
      const nestedMetadata: LazyQLMetadata = {
        dtoClass: NestedDTO,
        fieldMappings: new Map([['value', 'getValue']]),
        requiredFields: new Set(['value']),
        optionalFields: new Set(),
        sharedMethods: new Set(),
        options: {},
      };
      registerClass(NestedModel, nestedMetadata);

      // Create parent model with async getter
      class ParentModel {
        async getNested() {
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 1));
          const nested = Object.create(NestedModel.prototype);
          nested.getValue = () => 'async-nested-value';
          return nested;
        }
      }

      const instance = new ParentModel();
      const metadata = createMetadata({
        fieldMappings: new Map([['nested', 'getNested']]),
        options: { nestedProxy: true },
      });
      const proxy = createLazyProxy(instance, metadata, 'ParentModel');

      const nested = await (proxy as unknown as { nested: Promise<object> }).nested;

      // Should be a proxy
      expect(isLazyProxy(nested)).toBe(true);

      // Should be able to access fields
      expect((nested as unknown as { value: string }).value).toBe('async-nested-value');
    });

    it('should not wrap plain objects without registered class', () => {
      class ParentModel {
        getPlainObject() {
          return { foo: 'bar', baz: 123 };
        }
      }

      const instance = new ParentModel();
      const metadata = createMetadata({
        fieldMappings: new Map([['plain_object', 'getPlainObject']]),
        options: { nestedProxy: true },
      });
      const proxy = createLazyProxy(instance, metadata, 'ParentModel');

      const plain = (proxy as unknown as { plain_object: object }).plain_object;

      // Should NOT be a proxy (plain object, not registered class)
      expect(isLazyProxy(plain)).toBe(false);

      // Should still be accessible
      expect((plain as { foo: string }).foo).toBe('bar');
    });
  });
});
