/**
 * Base error class for LazyQL errors
 */
export class LazyQLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LazyQLError';
  }
}

/**
 * Thrown when a required field is missing a getter at startup
 */
export class MissingGetterError extends LazyQLError {
  constructor(className: string, fieldName: string) {
    super(
      `Missing getter for required field "${fieldName}" in class "${className}". ` +
      `Expected method: get${toPascalCase(fieldName)}()`
    );
    this.name = 'MissingGetterError';
  }
}

/**
 * Thrown when validation fails during startup
 */
export class ValidationError extends LazyQLError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when a DTO class is invalid or cannot be analyzed
 */
export class InvalidDTOError extends LazyQLError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDTOError';
  }
}

/**
 * Helper to convert snake_case or camelCase to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
