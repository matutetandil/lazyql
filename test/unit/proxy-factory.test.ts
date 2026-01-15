import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLazyProxy,
  isLazyProxy,
  getOriginalInstance,
  LAZY_INSTANCE,
  IS_LAZY_PROXY,
} from '../../src/core/proxy-factory.js';
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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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

      const proxyA = createLazyProxy(instanceA, metadata);
      const proxyB = createLazyProxy(instanceB, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

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
      const proxy = createLazyProxy(instance, metadata);

      expect('status' in proxy).toBe(true);
      expect('nonexistent' in proxy).toBe(false);
    });
  });
});
