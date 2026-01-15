import 'reflect-metadata';
import type { Constructor, LazyQLMetadata } from '../types.js';
import { createLazyProxy } from '../core/proxy-factory.js';
import { registerClass } from '../core/registry.js';
import { validateClass } from '../core/validator.js';
import { getFieldMappings } from './field.decorator.js';
import { getSharedMethods } from './shared.decorator.js';

/**
 * Class decorator that enables lazy field resolution for GraphQL responses.
 *
 * When a class is decorated with @LazyQL(DTO), instances of that class
 * become proxies that only execute getters for fields requested by GraphQL.
 *
 * @param dtoClass - The GraphQL DTO class that defines the output schema
 *
 * @example
 * ```typescript
 * @LazyQL(OrderSummaryDTO)
 * class OrderSummary {
 *   constructor(private id: number, private db: DatabaseService) {}
 *
 *   getEntityId() { return this.id; }
 *   getStatus() { return this.db.getOrderStatus(this.id); }
 *   async getCustomerEmail() {
 *     return await this.db.getCustomerEmail(this.id);
 *   }
 * }
 *
 * // In resolver:
 * return new OrderSummary(orderId, db);
 * ```
 */
export function LazyQL<T extends Constructor>(dtoClass: T): ClassDecorator {
  return function <TFunction extends Function>(target: TFunction): TFunction {
    const lazyClass = target as unknown as Constructor;

    // Collect metadata from decorators
    const fieldMappings = getFieldMappings(lazyClass.prototype);
    const sharedMethods = getSharedMethods(lazyClass.prototype);

    // Create metadata object
    const metadata: LazyQLMetadata = {
      dtoClass,
      fieldMappings: new Map(fieldMappings),
      sharedMethods: new Set(sharedMethods),
      requiredFields: new Set(),
      optionalFields: new Set(),
    };

    // Validate the class (throws on missing required getters)
    const warnings = validateClass(lazyClass, metadata);

    // Log warnings for optional fields without getters
    for (const warning of warnings) {
      console.warn(`[LazyQL] ${warning}`);
    }

    // Register the class
    registerClass(lazyClass, metadata);

    // Create a new class that wraps instantiation with a Proxy
    const ProxyClass = function (this: unknown, ...args: unknown[]) {
      // Create the original instance
      const instance = new (lazyClass as new (...args: unknown[]) => object)(...args);

      // Wrap it in a lazy proxy
      return createLazyProxy(instance, metadata);
    } as unknown as TFunction;

    // Copy static properties and prototype
    Object.setPrototypeOf(ProxyClass, target);
    ProxyClass.prototype = target.prototype;

    // Preserve the class name for debugging
    Object.defineProperty(ProxyClass, 'name', {
      value: target.name,
      writable: false,
    });

    return ProxyClass;
  };
}
