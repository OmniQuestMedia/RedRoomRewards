/**
 * Validates that a value is a safe string for MongoDB queries
 * 
 * This utility prevents NoSQL operator injection attacks by:
 * 1. Ensuring the value is a primitive string (not an object like {$ne: null})
 * 2. Rejecting MongoDB operator characters ($ and .)
 * 3. Enforcing length limits
 * 
 * @param value - Untrusted input to validate
 * @param fieldName - Name of the field (for error messages)
 * @param opts - Optional configuration
 * @param opts.maxLen - Maximum allowed length (default: 128)
 * @param opts.forbidDollarDot - Whether to reject $ and . characters (default: true)
 * @returns Trimmed, validated string
 * @throws Error if validation fails
 * 
 * @example
 * ```typescript
 * // Valid usage
 * const safeId = validateMongoSafeString('evt_12345', 'event_id');
 * // Returns: 'evt_12345'
 * 
 * // Invalid: object injection attempt
 * validateMongoSafeString({ $ne: null }, 'event_id');
 * // Throws: "Invalid event_id: must be a string"
 * 
 * // Invalid: contains operator character
 * validateMongoSafeString('$malicious', 'event_id');
 * // Throws: "Invalid event_id: contains illegal characters"
 * ```
 */
export function validateMongoSafeString(
  value: unknown,
  fieldName: string,
  opts?: { maxLen?: number; forbidDollarDot?: boolean }
): string {
  const maxLen = opts?.maxLen ?? 128;
  const forbidDollarDot = opts?.forbidDollarDot ?? true;

  // Type guard: must be primitive string (prevents operator injection)
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}: must be a string`);
  }

  // Sanitize: trim whitespace
  const trimmed = value.trim();

  // Validate: non-empty
  if (!trimmed) {
    throw new Error(`Invalid ${fieldName}: required`);
  }

  // Validate: reasonable length
  if (trimmed.length > maxLen) {
    throw new Error(`Invalid ${fieldName}: too long`);
  }

  // Security: reject MongoDB operator characters
  // This prevents patterns like {"$ne": null} or field path traversal
  if (forbidDollarDot && (trimmed.includes('$') || trimmed.includes('.'))) {
    throw new Error(`Invalid ${fieldName}: contains illegal characters`);
  }

  return trimmed;
}
