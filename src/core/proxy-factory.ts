import type { LazyQLMetadata } from '../types.js';
import { fieldToGetterName } from './getter-mapper.js';

/**
 * Symbol used to access the original instance from a proxy
 */
export const LAZY_INSTANCE = Symbol('lazyql:instance');

/**
 * Symbol used to check if an object is a LazyQL proxy
 */
export const IS_LAZY_PROXY = Symbol('lazyql:isProxy');

/**
 * Creates a Proxy that intercepts property access and calls the appropriate getter.
 *
 * When GraphQL/Apollo accesses a field like `proxy.status`, the proxy:
 * 1. Looks up the getter method for that field
 * 2. Calls the getter on the original instance
 * 3. Returns the result
 *
 * This ensures only requested fields have their getters executed.
 */
export function createLazyProxy<T extends object>(
  instance: T,
  metadata: LazyQLMetadata
): T {
  const sharedCache = new Map<string, unknown>();
  const pendingShared = new Map<string, Promise<unknown>>();

  return new Proxy(instance, {
    get(target, prop, receiver) {
      // Allow access to special symbols
      if (prop === LAZY_INSTANCE) {
        return target;
      }

      if (prop === IS_LAZY_PROXY) {
        return true;
      }

      // Handle symbol properties and internal methods
      if (typeof prop === 'symbol') {
        return Reflect.get(target, prop, receiver);
      }

      // Handle standard object methods
      if (prop === 'constructor' || prop === 'toString' || prop === 'valueOf') {
        return Reflect.get(target, prop, receiver);
      }

      // Check if this is a field access (not a method call)
      const fieldName = prop as string;

      // First, check explicit field mappings
      let getterName = metadata.fieldMappings.get(fieldName);

      // If no explicit mapping, try convention
      if (!getterName) {
        getterName = fieldToGetterName(fieldName);
      }

      // Check if the getter exists on the target
      const getter = (target as Record<string, unknown>)[getterName];

      if (typeof getter === 'function') {
        // Check if this is a @Shared method
        if (metadata.sharedMethods.has(getterName)) {
          return executeSharedMethod(target, getterName, getter, sharedCache, pendingShared);
        }

        // Execute the getter
        return getter.call(target);
      }

      // If no getter found, check if it's an optional field
      if (metadata.optionalFields.has(fieldName)) {
        return null;
      }

      // Check if accessing a direct property or method on the instance
      const directValue = Reflect.get(target, prop, receiver);
      if (directValue !== undefined) {
        return directValue;
      }

      // Field not found - return undefined (GraphQL will handle as null)
      return undefined;
    },

    // Support for 'in' operator (GraphQL might use this)
    has(target, prop) {
      if (typeof prop === 'string') {
        // Check if we have a getter for this field
        const getterName = metadata.fieldMappings.get(prop) || fieldToGetterName(prop);
        if (typeof (target as Record<string, unknown>)[getterName] === 'function') {
          return true;
        }
      }
      return Reflect.has(target, prop);
    },

    // Support for Object.keys() and similar
    ownKeys(target) {
      const keys = new Set<string | symbol>();

      // Add all mapped fields
      for (const fieldName of metadata.fieldMappings.keys()) {
        keys.add(fieldName);
      }

      // Add all optional fields
      for (const fieldName of metadata.optionalFields) {
        keys.add(fieldName);
      }

      // Add original keys
      for (const key of Reflect.ownKeys(target)) {
        keys.add(key);
      }

      return Array.from(keys);
    },

    getOwnPropertyDescriptor(target, prop) {
      // Make mapped fields appear as enumerable properties
      if (typeof prop === 'string') {
        if (metadata.fieldMappings.has(prop) || metadata.optionalFields.has(prop)) {
          return {
            enumerable: true,
            configurable: true,
            value: undefined, // Value is computed on access
          };
        }
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });
}

/**
 * Executes a @Shared method with caching.
 * Handles both sync and async methods.
 */
function executeSharedMethod(
  target: object,
  methodName: string,
  method: Function,
  cache: Map<string, unknown>,
  pendingPromises: Map<string, Promise<unknown>>
): unknown {
  // Check if already cached
  if (cache.has(methodName)) {
    return cache.get(methodName);
  }

  // Check if there's a pending promise (for async methods called multiple times)
  if (pendingPromises.has(methodName)) {
    return pendingPromises.get(methodName);
  }

  // Execute the method
  const result = method.call(target);

  // Handle promises
  if (result instanceof Promise) {
    const promise = result.then(value => {
      cache.set(methodName, value);
      pendingPromises.delete(methodName);
      return value;
    });

    pendingPromises.set(methodName, promise);
    return promise;
  }

  // Sync result - cache directly
  cache.set(methodName, result);
  return result;
}

/**
 * Checks if an object is a LazyQL proxy
 */
export function isLazyProxy(obj: unknown): boolean {
  return typeof obj === 'object' && obj !== null && (obj as Record<symbol, boolean>)[IS_LAZY_PROXY] === true;
}

/**
 * Gets the original instance from a LazyQL proxy
 */
export function getOriginalInstance<T>(proxy: T): T {
  if (isLazyProxy(proxy)) {
    return (proxy as Record<symbol, T>)[LAZY_INSTANCE];
  }
  return proxy;
}
