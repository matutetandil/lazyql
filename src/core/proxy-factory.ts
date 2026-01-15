import type { Constructor, LazyQLMetadata } from '../types.js';
import { fieldToGetterName } from './getter-mapper.js';
import { log, handleError, isDebugEnabled, getConfig } from './config.js';
import { getClassMetadata } from './registry.js';

/**
 * Symbol used to access the original instance from a proxy
 */
export const LAZY_INSTANCE = Symbol('lazyql:instance');

/**
 * Symbol used to check if an object is a LazyQL proxy
 */
export const IS_LAZY_PROXY = Symbol('lazyql:isProxy');

/**
 * Symbol used to store the shared cache on the instance
 */
const SHARED_CACHE = Symbol('lazyql:sharedCache');

/**
 * Symbol used to store pending promises for async shared methods
 */
const PENDING_SHARED = Symbol('lazyql:pendingShared');

/**
 * Wraps @Shared methods on the instance to enable caching.
 * This must be done on the actual instance so that internal calls
 * (e.g., this.getTotalsData() from within getGrandTotal()) also use the cache.
 */
function wrapSharedMethods<T extends object>(
  instance: T,
  sharedMethods: Set<string>,
  className: string,
  debug: boolean
): void {
  // Initialize cache storage on the instance
  const cache = new Map<string, unknown>();
  const pending = new Map<string, Promise<unknown>>();

  (instance as Record<symbol, unknown>)[SHARED_CACHE] = cache;
  (instance as Record<symbol, unknown>)[PENDING_SHARED] = pending;

  // Wrap each @Shared method
  for (const methodName of sharedMethods) {
    const original = (instance as Record<string, unknown>)[methodName];

    if (typeof original !== 'function') {
      continue;
    }

    // Replace with wrapped version
    (instance as Record<string, unknown>)[methodName] = function (this: T, ...args: unknown[]) {
      // Check if already cached
      if (cache.has(methodName)) {
        if (debug) {
          log('debug', `@Shared cache hit: ${className}.${methodName}()`);
        }
        return cache.get(methodName);
      }

      // Check if there's a pending promise
      if (pending.has(methodName)) {
        if (debug) {
          log('debug', `@Shared pending hit: ${className}.${methodName}()`);
        }
        return pending.get(methodName);
      }

      if (debug) {
        log('debug', `@Shared executing: ${className}.${methodName}()`);
      }

      const startTime = getConfig().timing ? performance.now() : 0;

      // Execute the original method
      const result = original.apply(this, args);

      // Handle promises
      if (result instanceof Promise) {
        const promise = result
          .then(value => {
            cache.set(methodName, value);
            pending.delete(methodName);

            if (getConfig().timing) {
              const duration = performance.now() - startTime;
              log('debug', `@Shared completed: ${className}.${methodName}()`, { duration: `${duration.toFixed(2)}ms` });
            }

            return value;
          })
          .catch(error => {
            pending.delete(methodName);
            throw error; // Re-throw to propagate the error
          });

        pending.set(methodName, promise);
        return promise;
      }

      // Sync result - cache directly
      cache.set(methodName, result);

      if (getConfig().timing) {
        const duration = performance.now() - startTime;
        log('debug', `@Shared completed: ${className}.${methodName}()`, { duration: `${duration.toFixed(2)}ms` });
      }

      return result;
    };
  }
}

/**
 * Wraps a value in a LazyQL proxy if it's an instance of a registered class.
 * Handles arrays by mapping through elements.
 *
 * @param value - The value to potentially wrap
 * @param nestedProxy - Whether nested proxy wrapping is enabled
 * @param debug - Whether debug mode is enabled
 * @returns The original value or a proxied version
 */
function maybeWrapNested(value: unknown, nestedProxy: boolean, debug: boolean): unknown {
  if (!nestedProxy) return value;

  // Already a proxy - return as is
  if (isLazyProxy(value)) return value;

  // Null/undefined - return as is
  if (value == null) return value;

  // Array - map through elements
  if (Array.isArray(value)) {
    return value.map(item => maybeWrapNested(item, true, debug));
  }

  // Object instance - check if it's a registered class
  if (typeof value === 'object') {
    const constructor = value.constructor as Constructor;

    // Skip plain objects (Object constructor) and built-in types
    if (constructor === Object || constructor.name === 'Object') {
      return value;
    }

    const metadata = getClassMetadata(constructor);

    if (metadata) {
      // It's an instance of a registered LazyQL class but not proxied
      // This can happen if the instance was created before decoration was applied
      if (debug) {
        log('debug', `Wrapping nested object: ${constructor.name}`);
      }
      return createLazyProxy(value as object, metadata, constructor.name);
    }
  }

  return value;
}

/**
 * Checks if an object is a LazyQL proxy
 */
export function isLazyProxy(obj: unknown): boolean {
  return typeof obj === 'object' && obj !== null && (obj as Record<symbol, boolean>)[IS_LAZY_PROXY] === true;
}

/**
 * Creates a Proxy that intercepts property access and calls the appropriate getter.
 *
 * When GraphQL/Apollo accesses a field like `proxy.status`, the proxy:
 * 1. Looks up the getter method for that field
 * 2. Calls the getter on the original instance
 * 3. Returns the result (with error handling)
 *
 * This ensures only requested fields have their getters executed.
 */
export function createLazyProxy<T extends object>(
  instance: T,
  metadata: LazyQLMetadata,
  className: string
): T {
  const debug = isDebugEnabled(metadata.options.debug);
  const nestedProxy = metadata.options.nestedProxy ?? false;

  // Wrap @Shared methods on the instance for caching
  wrapSharedMethods(instance, metadata.sharedMethods, className, debug);

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
        if (debug) {
          log('debug', `Executing getter: ${className}.${getterName}() for field "${fieldName}"`);
        }

        const startTime = getConfig().timing ? performance.now() : 0;

        try {
          // Execute the getter (if it's @Shared, it's already wrapped)
          const result = getter.call(target);

          // Handle async results for timing and error handling
          if (result instanceof Promise) {
            return result
              .then(value => {
                if (getConfig().timing) {
                  const duration = performance.now() - startTime;
                  log('debug', `Getter completed: ${className}.${getterName}()`, { duration: `${duration.toFixed(2)}ms` });
                }
                // Wrap nested objects if enabled
                return maybeWrapNested(value, nestedProxy, debug);
              })
              .catch(error => {
                const handledError = handleError(className, fieldName, getterName, error as Error);
                if (handledError) {
                  throw handledError;
                }
                return null; // Error was suppressed
              });
          }

          if (getConfig().timing) {
            const duration = performance.now() - startTime;
            log('debug', `Getter completed: ${className}.${getterName}()`, { duration: `${duration.toFixed(2)}ms` });
          }

          // Wrap nested objects if enabled
          return maybeWrapNested(result, nestedProxy, debug);
        } catch (error) {
          const handledError = handleError(className, fieldName, getterName, error as Error);
          if (handledError) {
            throw handledError;
          }
          return null; // Error was suppressed
        }
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
 * Gets the original instance from a LazyQL proxy
 */
export function getOriginalInstance<T>(proxy: T): T {
  if (isLazyProxy(proxy)) {
    return (proxy as Record<symbol, T>)[LAZY_INSTANCE];
  }
  return proxy;
}
