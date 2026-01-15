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

// Utilities
export { isLazyProxy, getOriginalInstance } from './core/proxy-factory.js';

// Types
export type {
  Constructor,
  LazyQLMetadata,
  FieldOptions,
  DTOFieldInfo,
} from './types.js';

// Errors
export {
  LazyQLError,
  MissingGetterError,
  ValidationError,
  InvalidDTOError,
} from './errors.js';
