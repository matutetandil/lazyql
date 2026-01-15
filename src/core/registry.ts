import type { Constructor, LazyQLMetadata, LazyQLRegistry } from '../types.js';

/**
 * Global registry for all LazyQL classes
 */
const registry: LazyQLRegistry = {
  classes: new Map(),
};

/**
 * Registers a LazyQL class with its metadata
 */
export function registerClass(lazyClass: Constructor, metadata: LazyQLMetadata): void {
  registry.classes.set(lazyClass, metadata);
}

/**
 * Gets metadata for a LazyQL class
 */
export function getClassMetadata(lazyClass: Constructor): LazyQLMetadata | undefined {
  return registry.classes.get(lazyClass);
}

/**
 * Checks if a class is registered with LazyQL
 */
export function isRegisteredClass(lazyClass: Constructor): boolean {
  return registry.classes.has(lazyClass);
}

/**
 * Gets all registered LazyQL classes
 */
export function getAllRegisteredClasses(): Map<Constructor, LazyQLMetadata> {
  return new Map(registry.classes);
}

/**
 * Clears the registry (useful for testing)
 */
export function clearRegistry(): void {
  registry.classes.clear();
}
