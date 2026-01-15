import 'reflect-metadata';
import type { Constructor, DTOFieldInfo, LazyQLMetadata } from '../types.js';
import { MissingGetterError, InvalidDTOError } from '../errors.js';
import { fieldToGetterName, getGetterMethods, getterToFieldName } from './getter-mapper.js';

// NestJS GraphQL metadata keys
const GRAPHQL_METADATA_KEY = 'design:type';
const FIELD_METADATA_KEY = 'graphql:field';

/**
 * Analyzes a NestJS GraphQL DTO class to extract field information.
 */
export function analyzeDTOClass(dtoClass: Constructor): DTOFieldInfo[] {
  const fields: DTOFieldInfo[] = [];
  const prototype = dtoClass.prototype;

  // Get all property names from the DTO class
  const instance = Object.create(prototype);
  const propertyNames = Object.getOwnPropertyNames(instance);

  // Try to get properties from the class itself
  const classProperties = Object.getOwnPropertyNames(dtoClass.prototype);

  // For NestJS GraphQL DTOs, fields are typically defined with @Field() decorator
  // We need to check both the instance properties and metadata

  // Approach: Create an instance and check what properties exist
  // Also use reflect-metadata to find decorated fields

  const allPropertyNames = new Set<string>([
    ...propertyNames,
    ...classProperties.filter(p => p !== 'constructor'),
  ]);

  // Check metadata for each potential property
  for (const propName of allPropertyNames) {
    const typeMetadata = Reflect.getMetadata(GRAPHQL_METADATA_KEY, prototype, propName);
    const fieldMetadata = Reflect.getMetadata(FIELD_METADATA_KEY, prototype, propName);

    if (typeMetadata || fieldMetadata) {
      // Determine if the field is required (nullable: true means optional)
      const isRequired = !fieldMetadata?.nullable;

      fields.push({
        name: propName,
        isRequired,
        type: typeMetadata,
      });
    }
  }

  // Fallback: if no metadata found, try to extract from class properties
  // This handles cases where DTOs are plain TypeScript classes
  if (fields.length === 0) {
    // Use TypeScript's design:type metadata if available
    for (const propName of allPropertyNames) {
      if (propName === 'constructor') continue;

      const designType = Reflect.getMetadata('design:type', prototype, propName);
      if (designType) {
        fields.push({
          name: propName,
          isRequired: true, // Default to required if we can't determine
          type: designType,
        });
      }
    }
  }

  return fields;
}

/**
 * Validates that a LazyQL class has all required getters for its DTO.
 * Throws MissingGetterError if a required field is missing.
 * Returns warnings for optional fields without getters.
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

  if (dtoFields.length === 0) {
    throw new InvalidDTOError(
      `Could not analyze DTO class "${metadata.dtoClass.name}". ` +
      `Make sure it has decorated fields or uses reflect-metadata.`
    );
  }

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
