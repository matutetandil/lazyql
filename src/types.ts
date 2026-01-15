/**
 * Constructor type for classes
 */
export type Constructor<T = object> = new (...args: unknown[]) => T;

/**
 * Log levels for debug output
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger function signature
 */
export type LoggerFn = (level: LogLevel, message: string, metadata?: Record<string, unknown>) => void;

/**
 * Error context passed to error handlers
 */
export interface ErrorContext {
  className: string;
  fieldName: string;
  getterName: string;
  error: Error;
}

/**
 * Error handler function signature
 */
export type ErrorHandler = (context: ErrorContext) => Error | null;

/**
 * Global LazyQL configuration options
 */
export interface LazyQLConfig {
  /** Enable debug logging */
  debug: boolean;
  /** Custom logger function */
  logger: LoggerFn;
  /** Custom error handler - return modified error or null to suppress */
  onError: ErrorHandler | null;
  /** Log timing information for getters */
  timing: boolean;
}

/**
 * Per-class configuration options for @LazyQL decorator
 */
export interface LazyQLOptions {
  /** Enable debug logging for this class */
  debug?: boolean;
  /** Whether to wrap nested objects in LazyQL proxies */
  nestedProxy?: boolean;
}

/**
 * Metadata stored for each LazyQL-decorated class
 */
export interface LazyQLMetadata {
  dtoClass: Constructor;
  fieldMappings: Map<string, string>; // fieldName -> getterName
  sharedMethods: Set<string>;
  requiredFields: Set<string>;
  optionalFields: Set<string>;
  options: LazyQLOptions;
}

/**
 * Internal registry for all LazyQL classes
 */
export interface LazyQLRegistry {
  classes: Map<Constructor, LazyQLMetadata>;
}

/**
 * Options for the @Field decorator
 */
export interface FieldOptions {
  name: string;
}

/**
 * Getter method signature
 */
export type GetterMethod = () => unknown | Promise<unknown>;

/**
 * Detection method used for DTO field analysis
 */
export type FieldDetectionMethod = 'nestjs-graphql' | 'design-type' | 'manual';

/**
 * Result of DTO field analysis
 */
export interface DTOFieldInfo {
  name: string;
  isRequired: boolean;
  type: unknown;
  /** How this field was detected */
  detectionMethod?: FieldDetectionMethod;
}
