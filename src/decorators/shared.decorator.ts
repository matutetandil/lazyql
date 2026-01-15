import 'reflect-metadata';

const SHARED_METHODS_KEY = 'lazyql:sharedMethods';

/**
 * Decorator to mark a method as shared/cached within the instance lifecycle.
 *
 * When multiple getters call a @Shared method, it executes only once
 * and the result is cached for subsequent calls within the same instance.
 *
 * @example
 * ```typescript
 * @LazyQL(OrderDTO)
 * class Order {
 *   async getGrandTotal() {
 *     const details = await this.getOrderDetails();
 *     return details.grand_total;
 *   }
 *
 *   async getCurrencyCode() {
 *     const details = await this.getOrderDetails();
 *     return details.currency_code;
 *   }
 *
 *   @Shared()
 *   async getOrderDetails() {
 *     // This only executes once, even if called by multiple getters
 *     return await this.db.getFullOrder(this.id);
 *   }
 * }
 * ```
 */
export function Shared(): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor
  ) {
    const methodName = String(propertyKey);

    // Store the shared method name on the class prototype
    const existingShared = Reflect.getMetadata(SHARED_METHODS_KEY, target) || new Set<string>();
    existingShared.add(methodName);
    Reflect.defineMetadata(SHARED_METHODS_KEY, existingShared, target);
  };
}

/**
 * Gets all @Shared method names from a class prototype
 */
export function getSharedMethods(prototype: object): Set<string> {
  return Reflect.getMetadata(SHARED_METHODS_KEY, prototype) || new Set<string>();
}
