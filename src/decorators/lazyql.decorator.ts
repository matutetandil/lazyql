import 'reflect-metadata';
import type { Constructor, LazyQLMetadata, LazyQLOptions } from '../types.js';
import { createLazyProxy } from '../core/proxy-factory.js';
import { registerClass } from '../core/registry.js';
import { validateClass } from '../core/validator.js';
import { getFieldMappings } from './field.decorator.js';
import { getSharedMethods } from './shared.decorator.js';
import { log } from '../core/config.js';

/**
 * Class decorator that enables lazy field resolution for GraphQL responses.
 *
 * When a class is decorated with @LazyQL(DTO), instances of that class
 * become proxies that only execute getters for fields requested by GraphQL.
 *
 * @param dtoClass - The GraphQL DTO class that defines the output schema
 * @param options - Optional configuration for this class
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
 * // With options:
 * @LazyQL(OrderSummaryDTO, { debug: true })
 * class DebugOrder { ... }
 *
 * // In resolver:
 * return new OrderSummary(orderId, db);
 * ```
 */
export function LazyQL<T extends Constructor>(
  dtoClass: T,
  options: LazyQLOptions = {}
): ClassDecorator {
  return function <TFunction extends Function>(target: TFunction): TFunction {
    const lazyClass = target as unknown as Constructor;
    const className = target.name;

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
      options,
    };

    // Validate the class (throws on missing required getters)
    const warnings = validateClass(lazyClass, metadata);

    // Log warnings for optional fields without getters
    for (const warning of warnings) {
      log('warn', warning);
    }

    // Register the class
    registerClass(lazyClass, metadata);

    // Create a new class that wraps instantiation with a Proxy
    const ProxyClass = function (this: unknown, ...args: unknown[]) {
      // Create the original instance
      const instance = new (lazyClass as new (...args: unknown[]) => object)(...args);

      // Wrap it in a lazy proxy
      return createLazyProxy(instance, metadata, className);
    } as unknown as TFunction;

    // Copy static properties and prototype
    Object.setPrototypeOf(ProxyClass, target);
    ProxyClass.prototype = target.prototype;

    // Preserve the class name for debugging
    Object.defineProperty(ProxyClass, 'name', {
      value: className,
      writable: false,
    });

    return ProxyClass;
  };
}
