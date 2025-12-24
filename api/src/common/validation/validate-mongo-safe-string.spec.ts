import { validateMongoSafeString } from './validate-mongo-safe-string';

/**
 * Security-focused test suite for validateMongoSafeString utility
 * 
 * Purpose: Prevent NoSQL operator injection attacks
 * Tests cover:
 * - Object injection attempts (e.g., {$ne: null})
 * - Operator character injection ($ and .)
 * - Empty/whitespace strings
 * - Length validation
 * - Normal valid inputs
 */
describe('validateMongoSafeString (security)', () => {
  describe('NoSQL Operator Injection Prevention', () => {
    test('rejects object operator injection', () => {
      // CRITICAL: This is the primary attack vector
      // Attackers try to pass objects like {$ne: null} instead of strings
      expect(() => 
        validateMongoSafeString({ $ne: null } as any, 'event_id')
      ).toThrow(/must be a string/i);
    });

    test('rejects array injection', () => {
      // Arrays are also dangerous in MongoDB queries
      expect(() => 
        validateMongoSafeString(['malicious'] as any, 'event_id')
      ).toThrow(/must be a string/i);
    });

    test('rejects null', () => {
      expect(() => 
        validateMongoSafeString(null, 'event_id')
      ).toThrow(/must be a string/i);
    });

    test('rejects undefined', () => {
      expect(() => 
        validateMongoSafeString(undefined, 'event_id')
      ).toThrow(/must be a string/i);
    });

    test('rejects number', () => {
      expect(() => 
        validateMongoSafeString(12345 as any, 'event_id')
      ).toThrow(/must be a string/i);
    });

    test('rejects boolean', () => {
      expect(() => 
        validateMongoSafeString(true as any, 'event_id')
      ).toThrow(/must be a string/i);
    });
  });

  describe('MongoDB Operator Character Rejection', () => {
    test('rejects $ character when forbidDollarDot=true', () => {
      expect(() => 
        validateMongoSafeString('abc$123', 'event_id', { forbidDollarDot: true })
      ).toThrow(/illegal/i);
    });

    test('rejects . character when forbidDollarDot=true', () => {
      expect(() => 
        validateMongoSafeString('abc.123', 'event_id', { forbidDollarDot: true })
      ).toThrow(/illegal/i);
    });

    test('rejects $ at beginning', () => {
      expect(() => 
        validateMongoSafeString('$ne', 'event_id')
      ).toThrow(/illegal/i);
    });

    test('rejects . for field path traversal', () => {
      expect(() => 
        validateMongoSafeString('field.subfield', 'event_id')
      ).toThrow(/illegal/i);
    });

    test('allows $ when forbidDollarDot=false', () => {
      const result = validateMongoSafeString('abc$123', 'test_field', { 
        forbidDollarDot: false 
      });
      expect(result).toBe('abc$123');
    });

    test('allows . when forbidDollarDot=false', () => {
      const result = validateMongoSafeString('abc.123', 'test_field', { 
        forbidDollarDot: false 
      });
      expect(result).toBe('abc.123');
    });
  });

  describe('Empty String Validation', () => {
    test('rejects empty string', () => {
      expect(() => 
        validateMongoSafeString('', 'event_id')
      ).toThrow(/required/i);
    });

    test('rejects whitespace-only string', () => {
      expect(() => 
        validateMongoSafeString('   ', 'event_id')
      ).toThrow(/required/i);
    });

    test('rejects tab-only string', () => {
      expect(() => 
        validateMongoSafeString('\t\t', 'event_id')
      ).toThrow(/required/i);
    });

    test('rejects newline-only string', () => {
      expect(() => 
        validateMongoSafeString('\n\n', 'event_id')
      ).toThrow(/required/i);
    });
  });

  describe('Length Validation', () => {
    test('rejects string exceeding default max length (128)', () => {
      const long = 'a'.repeat(129);
      expect(() => 
        validateMongoSafeString(long, 'event_id')
      ).toThrow(/too long/i);
    });

    test('accepts string at max length (128)', () => {
      const atLimit = 'a'.repeat(128);
      const result = validateMongoSafeString(atLimit, 'event_id');
      expect(result).toBe(atLimit);
    });

    test('rejects string exceeding custom max length', () => {
      const long = 'a'.repeat(51);
      expect(() => 
        validateMongoSafeString(long, 'event_id', { maxLen: 50 })
      ).toThrow(/too long/i);
    });

    test('accepts string at custom max length', () => {
      const atLimit = 'a'.repeat(50);
      const result = validateMongoSafeString(atLimit, 'event_id', { maxLen: 50 });
      expect(result).toBe(atLimit);
    });
  });

  describe('Valid Input Handling', () => {
    test('accepts normal alphanumeric id', () => {
      const result = validateMongoSafeString('evt_12345', 'event_id');
      expect(result).toBe('evt_12345');
    });

    test('accepts UUID format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = validateMongoSafeString(uuid, 'event_id');
      expect(result).toBe(uuid);
    });

    test('accepts hyphenated ids', () => {
      const result = validateMongoSafeString('evt-12345-abc', 'event_id');
      expect(result).toBe('evt-12345-abc');
    });

    test('accepts underscored ids', () => {
      const result = validateMongoSafeString('evt_12345_abc', 'event_id');
      expect(result).toBe('evt_12345_abc');
    });

    test('trims leading whitespace', () => {
      const result = validateMongoSafeString('  evt_12345', 'event_id');
      expect(result).toBe('evt_12345');
    });

    test('trims trailing whitespace', () => {
      const result = validateMongoSafeString('evt_12345  ', 'event_id');
      expect(result).toBe('evt_12345');
    });

    test('trims both leading and trailing whitespace', () => {
      const result = validateMongoSafeString('  evt_12345  ', 'event_id');
      expect(result).toBe('evt_12345');
    });
  });

  describe('Error Message Quality', () => {
    test('includes field name in error message', () => {
      expect(() => 
        validateMongoSafeString({ $ne: null } as any, 'custom_field')
      ).toThrow(/custom_field/i);
    });

    test('provides clear error for type mismatch', () => {
      expect(() => 
        validateMongoSafeString(123 as any, 'event_id')
      ).toThrow('Invalid event_id: must be a string');
    });

    test('provides clear error for empty value', () => {
      expect(() => 
        validateMongoSafeString('', 'event_id')
      ).toThrow('Invalid event_id: required');
    });

    test('provides clear error for length violation', () => {
      const long = 'a'.repeat(129);
      expect(() => 
        validateMongoSafeString(long, 'event_id')
      ).toThrow('Invalid event_id: too long');
    });

    test('provides clear error for illegal characters', () => {
      expect(() => 
        validateMongoSafeString('$bad', 'event_id')
      ).toThrow('Invalid event_id: contains illegal characters');
    });
  });

  describe('Edge Cases', () => {
    test('handles special characters allowed in IDs', () => {
      const result = validateMongoSafeString('evt-123_abc', 'event_id');
      expect(result).toBe('evt-123_abc');
    });

    test('handles single character string', () => {
      const result = validateMongoSafeString('a', 'event_id');
      expect(result).toBe('a');
    });

    test('validates after trimming for length check', () => {
      // 128 chars + leading/trailing spaces should pass
      const atLimit = 'a'.repeat(128);
      const withSpaces = `  ${atLimit}  `;
      const result = validateMongoSafeString(withSpaces, 'event_id');
      expect(result).toBe(atLimit);
    });

    test('checks illegal characters after trimming', () => {
      // Should still reject $ even with surrounding whitespace
      expect(() => 
        validateMongoSafeString('  $bad  ', 'event_id')
      ).toThrow(/illegal/i);
    });
  });
});
