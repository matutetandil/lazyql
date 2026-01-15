/**
 * Converts a field name to its expected getter method name.
 *
 * Convention: snake_case field -> getCamelCase method
 *
 * Examples:
 *   status -> getStatus
 *   entity_id -> getEntityId
 *   increment_id -> getIncrementId
 *   grand_total -> getGrandTotal
 */
export function fieldToGetterName(fieldName: string): string {
  const camelCase = snakeToCamel(fieldName);
  return `get${capitalize(camelCase)}`;
}

/**
 * Converts snake_case to camelCase
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Capitalizes the first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Extracts the field name from a getter method name.
 *
 * Examples:
 *   getStatus -> status
 *   getEntityId -> entity_id
 *   getIncrementId -> increment_id
 */
export function getterToFieldName(getterName: string): string {
  if (!getterName.startsWith('get') || getterName.length <= 3) {
    return getterName;
  }

  const withoutGet = getterName.slice(3);
  const camelCase = withoutGet.charAt(0).toLowerCase() + withoutGet.slice(1);
  return camelToSnake(camelCase);
}

/**
 * Converts camelCase to snake_case
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Checks if a method name is a getter (starts with 'get' and has more characters)
 */
export function isGetterMethod(methodName: string): boolean {
  return methodName.startsWith('get') && methodName.length > 3;
}

/**
 * Gets all getter methods from a class prototype
 */
export function getGetterMethods(prototype: object): string[] {
  const methods: string[] = [];

  let current = prototype;
  while (current && current !== Object.prototype) {
    const propertyNames = Object.getOwnPropertyNames(current);

    for (const name of propertyNames) {
      if (isGetterMethod(name) && typeof (current as Record<string, unknown>)[name] === 'function') {
        if (!methods.includes(name)) {
          methods.push(name);
        }
      }
    }

    current = Object.getPrototypeOf(current);
  }

  return methods;
}
