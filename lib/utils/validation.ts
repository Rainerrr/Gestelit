/**
 * UUID validation utilities for API routes.
 */

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID.
 */
export function isValidUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * Check if all values in an array are valid UUIDs.
 */
export function areValidUUIDs(values: unknown[]): values is string[] {
  return values.every((v) => isValidUUID(v));
}
