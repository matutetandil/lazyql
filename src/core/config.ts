import type { LazyQLConfig, LoggerFn, LogLevel } from '../types.js';

/**
 * Default logger that outputs to console
 */
const defaultLogger: LoggerFn = (level: LogLevel, message: string, metadata?: Record<string, unknown>) => {
  const prefix = `[LazyQL]`;
  const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';

  switch (level) {
    case 'debug':
      console.debug(`${prefix} ${message}${metaStr}`);
      break;
    case 'info':
      console.log(`${prefix} ${message}${metaStr}`);
      break;
    case 'warn':
      console.warn(`${prefix} ${message}${metaStr}`);
      break;
    case 'error':
      console.error(`${prefix} ${message}${metaStr}`);
      break;
  }
};

/**
 * Global configuration state
 */
const globalConfig: LazyQLConfig = {
  debug: false,
  logger: defaultLogger,
  onError: null,
  timing: false,
};

/**
 * Configure LazyQL globally
 *
 * @example
 * ```typescript
 * configure({
 *   debug: true,
 *   timing: true,
 *   onError: (ctx) => {
 *     // Transform or log errors
 *     return new CustomError(ctx.error.message);
 *   }
 * });
 * ```
 */
export function configure(options: Partial<LazyQLConfig>): void {
  if (options.debug !== undefined) {
    globalConfig.debug = options.debug;
  }
  if (options.logger !== undefined) {
    globalConfig.logger = options.logger;
  }
  if (options.onError !== undefined) {
    globalConfig.onError = options.onError;
  }
  if (options.timing !== undefined) {
    globalConfig.timing = options.timing;
  }
}

/**
 * Get current global configuration
 */
export function getConfig(): Readonly<LazyQLConfig> {
  return globalConfig;
}

/**
 * Reset configuration to defaults (useful for testing)
 */
export function resetConfig(): void {
  globalConfig.debug = false;
  globalConfig.logger = defaultLogger;
  globalConfig.onError = null;
  globalConfig.timing = false;
}

/**
 * Log a message using the configured logger.
 * For debug level, the caller should check isDebugEnabled() first.
 */
export function log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
  globalConfig.logger(level, message, metadata);
}

/**
 * Check if debug mode is enabled (globally or per-class)
 */
export function isDebugEnabled(classDebug?: boolean): boolean {
  return classDebug ?? globalConfig.debug;
}

/**
 * Handle an error using the configured error handler
 * Returns the (possibly transformed) error, or null if suppressed
 */
export function handleError(
  className: string,
  fieldName: string,
  getterName: string,
  error: Error
): Error | null {
  const context = { className, fieldName, getterName, error };

  // Log the error
  log('error', `Error in ${className}.${getterName}() for field "${fieldName}"`, {
    error: error.message,
  });

  // Call custom error handler if configured
  if (globalConfig.onError) {
    return globalConfig.onError(context);
  }

  // Default: return the original error
  return error;
}
