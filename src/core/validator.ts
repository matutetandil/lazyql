import 'reflect-metadata';
import type { Constructor, DTOFieldInfo, LazyQLMetadata } from '../types.js';
import { MissingGetterError } from '../errors.js';
import { fieldToGetterName, getGetterMethods, getterToFieldName } from './getter-mapper.js';

// NestJS GraphQL metadata keys
const GRAPHQL_METADATA_KEY = 'design:type';
const FIELD_METADATA_KEY = 'graphql:field';

/**
 * Try to get NestJS GraphQL TypeMetadataStorage if available
 */
function tryGetNestJSFields(dtoClass: Constructor): DTOFieldInfo[] | null {
  try {
    // Dynamic import to avoid hard dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TypeMetadataStorage } = require('@nestjs/graphql');

    if (!TypeMetadataStorage) return null;

    // Try to get fields using the predicate method
    const fields = TypeMetadataStorage.getClassFieldsByPredicate(
      (f: { target: Constructor }) => f.target === dtoClass
    );

    if (fields && fields.length > 0) {
      return fields.map((f: { name: string; options?: { nullable?: boolean } }) => ({
        name: f.name,
        isRequired: !f.options?.nullable,
        type: undefined,
      }));
    }

    return null;
  } catch {
    // NestJS GraphQL not available or different version
    return null;
  }
}

/**
 * Try to enumerate fields by scanning for design:type metadata
 * This works when TypeScript's emitDecoratorMetadata is enabled
 */
function scanForDecoratedFields(dtoClass: Constructor): DTOFieldInfo[] {
  const fields: DTOFieldInfo[] = [];
  const prototype = dtoClass.prototype;

  // Common field names to check - this is a heuristic
  // In practice, we'd need to scan more comprehensively
  const potentialNames = new Set<string>();

  // Try to get names from an instance
  try {
    const instance = new (dtoClass as new () => object)();
    Object.keys(instance).forEach(k => potentialNames.add(k));
    Object.getOwnPropertyNames(instance).forEach(k => potentialNames.add(k));
  } catch {
    // Constructor requires arguments, can't create instance
  }

  // Add names from prototype
  Object.getOwnPropertyNames(prototype)
    .filter(p => p !== 'constructor')
    .forEach(p => potentialNames.add(p));

  // Check each potential name for design:type metadata
  for (const name of potentialNames) {
    const designType = Reflect.getMetadata(GRAPHQL_METADATA_KEY, prototype, name);
    if (designType) {
      const fieldMeta = Reflect.getMetadata(FIELD_METADATA_KEY, prototype, name);
      fields.push({
        name,
        isRequired: !fieldMeta?.nullable,
        type: designType,
      });
    }
  }

  return fields;
}

/**
 * Analyzes a NestJS GraphQL DTO class to extract field information.
 * Returns empty array if fields cannot be determined (validation will be skipped).
 */
export function analyzeDTOClass(dtoClass: Constructor): DTOFieldInfo[] {
  // Try NestJS GraphQL TypeMetadataStorage first
  const nestJSFields = tryGetNestJSFields(dtoClass);
  if (nestJSFields && nestJSFields.length > 0) {
    return nestJSFields;
  }

  // Fall back to scanning for decorated fields
  const scannedFields = scanForDecoratedFields(dtoClass);
  if (scannedFields.length > 0) {
    return scannedFields;
  }

  // Could not determine fields - return empty array
  // Validation will be skipped in this case
  return [];
}

/**
 * Validates that a LazyQL class has all required getters for its DTO.
 * Throws MissingGetterError if a required field is missing.
 * Returns warnings for optional fields without getters.
 *
 * If DTO fields cannot be detected, validation is skipped and all getters
 * are registered as field mappings.
 */
export function validateClass(
  lazyClass: Constructor,
  metadata: LazyQLMetadata
): string[] {
  const warnings: string[] = [];
  const className = lazyClass.name;
  const prototype = lazyClass.prototype;

  // Get all getter methods in the class
  const getterMethods = getGetterMethods(prototype);

  // Get explicit field mappings from @Field decorators
  const explicitMappings = metadata.fieldMappings;

  // Analyze the DTO to get required and optional fields
  const dtoFields = analyzeDTOClass(metadata.dtoClass);

  // If no fields detected, skip strict validation and register all getters
  if (dtoFields.length === 0) {
    warnings.push(
      `Could not detect fields in DTO "${metadata.dtoClass.name}". ` +
      `Validation skipped - all getters will be registered.`
    );

    // Register all getters as field mappings
    for (const getterName of getterMethods) {
      if (!metadata.sharedMethods.has(getterName)) {
        const fieldName = getterToFieldName(getterName);
        metadata.fieldMappings.set(fieldName, getterName);
      }
    }

    return warnings;
  }

  // Strict validation when fields are detected
  for (const field of dtoFields) {
    // Check if there's an explicit mapping
    if (explicitMappings.has(field.name)) {
      const getterName = explicitMappings.get(field.name)!;
      if (!getterMethods.includes(getterName)) {
        if (field.isRequired) {
          throw new MissingGetterError(className, field.name);
        } else {
          warnings.push(
            `Optional field "${field.name}" has explicit mapping to "${getterName}" but method not found`
          );
        }
      }
      continue;
    }

    // Check using naming convention
    const expectedGetter = fieldToGetterName(field.name);
    const hasGetter = getterMethods.includes(expectedGetter);

    if (!hasGetter) {
      if (field.isRequired) {
        throw new MissingGetterError(className, field.name);
      } else {
        warnings.push(
          `Optional field "${field.name}" has no getter. Expected: ${expectedGetter}(). Will return null.`
        );
        metadata.optionalFields.add(field.name);
      }
    } else {
      // Store the mapping
      metadata.fieldMappings.set(field.name, expectedGetter);
      if (field.isRequired) {
        metadata.requiredFields.add(field.name);
      } else {
        metadata.optionalFields.add(field.name);
      }
    }
  }

  // Warn about getters that don't match any DTO field
  for (const getterName of getterMethods) {
    const fieldName = getterToFieldName(getterName);
    const hasExplicitMapping = Array.from(explicitMappings.values()).includes(getterName);
    const hasConventionMapping = metadata.fieldMappings.has(fieldName);

    if (!hasExplicitMapping && !hasConventionMapping) {
      const matchesAnyField = dtoFields.some(f => f.name === fieldName);
      if (!matchesAnyField && !metadata.sharedMethods.has(getterName)) {
        warnings.push(
          `Getter "${getterName}" does not match any field in DTO "${metadata.dtoClass.name}"`
        );
      }
    }
  }

  return warnings;
}
