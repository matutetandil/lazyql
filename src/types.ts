/**
 * Constructor type for classes
 */
export type Constructor<T = object> = new (...args: unknown[]) => T;

/**
 * Metadata stored for each LazyQL-decorated class
 */
export interface LazyQLMetadata {
  dtoClass: Constructor;
  fieldMappings: Map<string, string>; // fieldName -> getterName
  sharedMethods: Set<string>;
  requiredFields: Set<string>;
  optionalFields: Set<string>;
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
 * Result of DTO field analysis
 */
export interface DTOFieldInfo {
  name: string;
  isRequired: boolean;
  type: unknown;
}
