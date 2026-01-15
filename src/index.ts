/**
 * LazyQL - A lightweight library that makes GraphQL resolvers truly lazy by default
 *
 * @packageDocumentation
 */

// Main decorator
export { LazyQL } from './decorators/lazyql.decorator.js';

// Method decorators
export { Shared } from './decorators/shared.decorator.js';
export { Field } from './decorators/field.decorator.js';

// Configuration
export { configure, getConfig, resetConfig } from './core/config.js';

// Utilities
export { isLazyProxy, getOriginalInstance } from './core/proxy-factory.js';

// Registry (useful for testing)
export { clearRegistry, isRegisteredClass, getClassMetadata } from './core/registry.js';

// Types
export type {
  Constructor,
  LazyQLMetadata,
  LazyQLConfig,
  LazyQLOptions,
  FieldOptions,
  DTOFieldInfo,
  LogLevel,
  LoggerFn,
  ErrorContext,
  ErrorHandler,
} from './types.js';

// Errors
export {
  LazyQLError,
  MissingGetterError,
  ValidationError,
  InvalidDTOError,
} from './errors.js';
