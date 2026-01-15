import 'reflect-metadata';

const FIELD_MAPPING_KEY = 'lazyql:fieldMapping';

/**
 * Decorator to explicitly map a getter method to a specific DTO field.
 *
 * Use this when:
 * - The field name doesn't follow the snake_case -> getCamelCase convention
 * - You want to be explicit about the mapping
 * - There's ambiguity in the field name
 *
 * @example
 * ```typescript
 * @LazyQL(OrderDTO)
 * class Order {
 *   @Field('customer_po')
 *   getPurchaseOrderNumber() {
 *     return this.db.getPO(this.id);
 *   }
 * }
 * ```
 */
export function Field(fieldName: string): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor
  ) {
    const methodName = String(propertyKey);

    // Store the mapping on the class prototype
    const existingMappings = Reflect.getMetadata(FIELD_MAPPING_KEY, target) || new Map<string, string>();
    existingMappings.set(fieldName, methodName);
    Reflect.defineMetadata(FIELD_MAPPING_KEY, existingMappings, target);
  };
}

/**
 * Gets all explicit field mappings from a class prototype
 */
export function getFieldMappings(prototype: object): Map<string, string> {
  return Reflect.getMetadata(FIELD_MAPPING_KEY, prototype) || new Map<string, string>();
}
