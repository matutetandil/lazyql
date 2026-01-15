import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLazyProxy,
  isLazyProxy,
} from '../../src/core/proxy-factory.js';
import { registerClass, clearRegistry } from '../../src/core/registry.js';
import type { LazyQLMetadata } from '../../src/types.js';

/**
 * These tests demonstrate how LazyQL integrates naturally with DataLoader.
 *
 * DataLoader is a utility for batching and caching to solve the N+1 problem.
 * LazyQL's lazy field execution complements DataLoader perfectly:
 * - Only requested fields have their getters executed
 * - DataLoader batches the database calls within those getters
 *
 * The pattern:
 * 1. Create request-scoped DataLoaders in your GraphQL context
 * 2. Pass loaders to LazyQL model constructors
 * 3. Use loaders in getter methods
 * 4. DataLoader handles batching automatically
 */

// Mock DataLoader for testing (simulates real DataLoader behavior)
class MockDataLoader<K, V> {
  private batchFn: (keys: K[]) => Promise<V[]>;
  private pendingKeys: K[] = [];
  private pendingPromise: Promise<Map<K, V>> | null = null;
  private cache = new Map<K, V>();
  public batchCallCount = 0;

  constructor(batchFn: (keys: K[]) => Promise<V[]>) {
    this.batchFn = batchFn;
  }

  async load(key: K): Promise<V> {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Add to pending batch
    this.pendingKeys.push(key);

    // Schedule batch execution
    if (!this.pendingPromise) {
      this.pendingPromise = this.executeBatch();
    }

    const results = await this.pendingPromise;
    return results.get(key)!;
  }

  private async executeBatch(): Promise<Map<K, V>> {
    // Wait for next tick to collect all keys
    await new Promise(resolve => setImmediate(resolve));

    const keys = [...this.pendingKeys];
    this.pendingKeys = [];
    this.pendingPromise = null;
    this.batchCallCount++;

    const values = await this.batchFn(keys);
    const resultMap = new Map<K, V>();

    keys.forEach((key, index) => {
      resultMap.set(key, values[index]);
      this.cache.set(key, values[index]);
    });

    return resultMap;
  }

  clear() {
    this.cache.clear();
  }
}

// Simulated database
interface Customer {
  id: number;
  name: string;
  email: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
}

// Mock database calls
const mockDb = {
  getCustomers: vi.fn(async (ids: number[]): Promise<Customer[]> => {
    // Simulate DB latency
    await new Promise(resolve => setTimeout(resolve, 1));
    return ids.map(id => ({
      id,
      name: `Customer ${id}`,
      email: `customer${id}@example.com`,
    }));
  }),
  getProducts: vi.fn(async (ids: number[]): Promise<Product[]> => {
    await new Promise(resolve => setTimeout(resolve, 1));
    return ids.map(id => ({
      id,
      name: `Product ${id}`,
      price: id * 10,
    }));
  }),
};

// DataLoaders factory (typically created per-request in GraphQL context)
function createLoaders() {
  return {
    customer: new MockDataLoader<number, Customer>((ids) => mockDb.getCustomers(ids)),
    product: new MockDataLoader<number, Product>((ids) => mockDb.getProducts(ids)),
  };
}

type Loaders = ReturnType<typeof createLoaders>;

describe('DataLoader integration pattern', () => {
  beforeEach(() => {
    mockDb.getCustomers.mockClear();
    mockDb.getProducts.mockClear();
  });

  afterEach(() => {
    clearRegistry();
  });

  it('should batch database calls when using DataLoader in getters', async () => {
    // Define DTO and Model
    class OrderDTO {
      entity_id: number;
      customer_name: string;
      customer_email: string;
    }

    class OrderModel {
      constructor(
        private orderId: number,
        private customerId: number,
        private loaders: Loaders
      ) {}

      getEntityId() {
        return this.orderId;
      }

      async getCustomerName() {
        const customer = await this.loaders.customer.load(this.customerId);
        return customer.name;
      }

      async getCustomerEmail() {
        const customer = await this.loaders.customer.load(this.customerId);
        return customer.email;
      }
    }

    // Register the class
    const metadata: LazyQLMetadata = {
      dtoClass: OrderDTO,
      fieldMappings: new Map([
        ['entity_id', 'getEntityId'],
        ['customer_name', 'getCustomerName'],
        ['customer_email', 'getCustomerEmail'],
      ]),
      requiredFields: new Set(['entity_id', 'customer_name', 'customer_email']),
      optionalFields: new Set(),
      sharedMethods: new Set(),
      options: {},
    };

    // Create request-scoped loaders
    const loaders = createLoaders();

    // Create multiple order proxies (simulating a list query)
    const orders = [
      createLazyProxy(new OrderModel(1, 100, loaders), metadata, 'OrderModel'),
      createLazyProxy(new OrderModel(2, 100, loaders), metadata, 'OrderModel'), // Same customer
      createLazyProxy(new OrderModel(3, 200, loaders), metadata, 'OrderModel'), // Different customer
    ];

    // Access customer_name on all orders (triggers batching)
    const names = await Promise.all(
      orders.map(order => (order as unknown as { customer_name: Promise<string> }).customer_name)
    );

    expect(names).toEqual(['Customer 100', 'Customer 100', 'Customer 200']);

    // DataLoader should have batched the calls
    // Only 2 unique customer IDs (100 and 200), but DataLoader batches by timing
    // Customer 100 is loaded twice but cached, so only one batch call
    expect(loaders.customer.batchCallCount).toBe(1);

    // The batch function should have been called with both customer IDs
    expect(mockDb.getCustomers).toHaveBeenCalledTimes(1);
    expect(mockDb.getCustomers).toHaveBeenCalledWith([100, 100, 200]);
  });

  it('should not load data if field is not requested (lazy execution)', async () => {
    class ProductDTO {
      entity_id: number;
      name: string;
      price: number;
    }

    class ProductModel {
      constructor(
        private productId: number,
        private loaders: Loaders
      ) {}

      getEntityId() {
        return this.productId;
      }

      async getName() {
        const product = await this.loaders.product.load(this.productId);
        return product.name;
      }

      async getPrice() {
        const product = await this.loaders.product.load(this.productId);
        return product.price;
      }
    }

    const metadata: LazyQLMetadata = {
      dtoClass: ProductDTO,
      fieldMappings: new Map([
        ['entity_id', 'getEntityId'],
        ['name', 'getName'],
        ['price', 'getPrice'],
      ]),
      requiredFields: new Set(['entity_id', 'name', 'price']),
      optionalFields: new Set(),
      sharedMethods: new Set(),
      options: {},
    };

    const loaders = createLoaders();

    const products = [
      createLazyProxy(new ProductModel(1, loaders), metadata, 'ProductModel'),
      createLazyProxy(new ProductModel(2, loaders), metadata, 'ProductModel'),
      createLazyProxy(new ProductModel(3, loaders), metadata, 'ProductModel'),
    ];

    // Only access entity_id (sync, no loader needed)
    const ids = products.map(p => (p as unknown as { entity_id: number }).entity_id);

    expect(ids).toEqual([1, 2, 3]);

    // DataLoader should NOT have been called because we didn't access name or price
    expect(mockDb.getProducts).not.toHaveBeenCalled();
    expect(loaders.product.batchCallCount).toBe(0);
  });

  it('should work with @Shared to prevent duplicate loader calls within same instance', async () => {
    let sharedCallCount = 0;

    class OrderDetailDTO {
      entity_id: number;
      customer_name: string;
      customer_email: string;
    }

    class OrderDetailModel {
      constructor(
        private orderId: number,
        private customerId: number,
        private loaders: Loaders
      ) {}

      getEntityId() {
        return this.orderId;
      }

      // Simulates @Shared decorator behavior
      private customerCache: Customer | null = null;
      async getCustomerData(): Promise<Customer> {
        sharedCallCount++;
        if (this.customerCache) return this.customerCache;
        this.customerCache = await this.loaders.customer.load(this.customerId);
        return this.customerCache;
      }

      async getCustomerName() {
        const customer = await this.getCustomerData();
        return customer.name;
      }

      async getCustomerEmail() {
        const customer = await this.getCustomerData();
        return customer.email;
      }
    }

    const metadata: LazyQLMetadata = {
      dtoClass: OrderDetailDTO,
      fieldMappings: new Map([
        ['entity_id', 'getEntityId'],
        ['customer_name', 'getCustomerName'],
        ['customer_email', 'getCustomerEmail'],
      ]),
      requiredFields: new Set(['entity_id', 'customer_name', 'customer_email']),
      optionalFields: new Set(),
      sharedMethods: new Set(['getCustomerData']),
      options: {},
    };

    const loaders = createLoaders();
    const order = createLazyProxy(
      new OrderDetailModel(1, 100, loaders),
      metadata,
      'OrderDetailModel'
    );

    // Access both customer_name and customer_email
    const [name, email] = await Promise.all([
      (order as unknown as { customer_name: Promise<string> }).customer_name,
      (order as unknown as { customer_email: Promise<string> }).customer_email,
    ]);

    expect(name).toBe('Customer 100');
    expect(email).toBe('customer100@example.com');

    // With @Shared-like pattern, getCustomerData is called multiple times
    // but the loader.load is only executed once due to caching
    // sharedCallCount may vary based on timing, but loader batch should be 1
    expect(sharedCallCount).toBeGreaterThanOrEqual(1);
    expect(loaders.customer.batchCallCount).toBe(1);
  });

  it('should demonstrate the N+1 prevention pattern', async () => {
    /**
     * Scenario: List query returning 100 orders, each with customer data
     *
     * WITHOUT LazyQL + DataLoader:
     * - 1 query to get 100 orders
     * - 100 queries to get customer for each order (N+1 problem!)
     *
     * WITH LazyQL + DataLoader:
     * - 1 query to get 100 orders
     * - 1 batched query to get all unique customers
     * - Plus: if some fields aren't requested, those queries don't run at all
     */

    class OrderListDTO {
      entity_id: number;
      customer_name: string;
    }

    class OrderListModel {
      constructor(
        private orderId: number,
        private customerId: number,
        private loaders: Loaders
      ) {}

      getEntityId() {
        return this.orderId;
      }

      async getCustomerName() {
        const customer = await this.loaders.customer.load(this.customerId);
        return customer.name;
      }
    }

    const metadata: LazyQLMetadata = {
      dtoClass: OrderListDTO,
      fieldMappings: new Map([
        ['entity_id', 'getEntityId'],
        ['customer_name', 'getCustomerName'],
      ]),
      requiredFields: new Set(['entity_id', 'customer_name']),
      optionalFields: new Set(),
      sharedMethods: new Set(),
      options: {},
    };

    const loaders = createLoaders();

    // Simulate 10 orders with 5 unique customers
    const orders = Array.from({ length: 10 }, (_, i) =>
      createLazyProxy(
        new OrderListModel(i + 1, (i % 5) + 100, loaders), // Customer IDs: 100-104
        metadata,
        'OrderListModel'
      )
    );

    // Access customer_name on all orders
    const names = await Promise.all(
      orders.map(o => (o as unknown as { customer_name: Promise<string> }).customer_name)
    );

    expect(names.length).toBe(10);
    expect(names[0]).toBe('Customer 100');
    expect(names[5]).toBe('Customer 100'); // Same customer as order 0

    // CRITICAL: Only 1 batch call despite 10 orders
    // This is the N+1 prevention in action
    expect(loaders.customer.batchCallCount).toBe(1);
    expect(mockDb.getCustomers).toHaveBeenCalledTimes(1);
  });
});
