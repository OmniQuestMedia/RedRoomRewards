/**
 * validateEnv Unit Tests
 *
 * Tests startup environment validation:
 * - In production: throws on missing required vars
 * - In non-production: warns but doesn't throw
 */

import { validateEnv } from '../validate-env';

describe('validateEnv', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let stderrWriteSpy: jest.SpyInstance;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Spy on stderr.write
    stderrWriteSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;

    // Restore stderr
    stderrWriteSpy.mockRestore();
  });

  describe('production environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should throw when JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;
      process.env.QUEUE_AUTH_SECRET = 'valid-secret';
      process.env.RRR_WEBHOOK_SECRET = 'valid-secret';

      expect(() => {
        validateEnv();
      }).toThrow('Missing required env var(s): JWT_SECRET');
    });

    it('should throw when QUEUE_AUTH_SECRET is missing', () => {
      process.env.JWT_SECRET = 'valid-secret';
      delete process.env.QUEUE_AUTH_SECRET;
      process.env.RRR_WEBHOOK_SECRET = 'valid-secret';

      expect(() => {
        validateEnv();
      }).toThrow('Missing required env var(s): QUEUE_AUTH_SECRET');
    });

    it('should throw when RRR_WEBHOOK_SECRET is missing', () => {
      process.env.JWT_SECRET = 'valid-secret';
      process.env.QUEUE_AUTH_SECRET = 'valid-secret';
      delete process.env.RRR_WEBHOOK_SECRET;

      expect(() => {
        validateEnv();
      }).toThrow('Missing required env var(s): RRR_WEBHOOK_SECRET');
    });

    it('should throw when multiple vars are missing', () => {
      delete process.env.JWT_SECRET;
      delete process.env.QUEUE_AUTH_SECRET;
      process.env.RRR_WEBHOOK_SECRET = 'valid-secret';

      expect(() => {
        validateEnv();
      }).toThrow('Missing required env var(s): JWT_SECRET, QUEUE_AUTH_SECRET');
    });

    it('should throw when all vars are missing', () => {
      delete process.env.JWT_SECRET;
      delete process.env.QUEUE_AUTH_SECRET;
      delete process.env.RRR_WEBHOOK_SECRET;

      expect(() => {
        validateEnv();
      }).toThrow('Missing required env var(s): JWT_SECRET, QUEUE_AUTH_SECRET, RRR_WEBHOOK_SECRET');
    });

    it('should not throw when all required vars are set', () => {
      process.env.JWT_SECRET = 'valid-jwt-secret';
      process.env.QUEUE_AUTH_SECRET = 'valid-queue-secret';
      process.env.RRR_WEBHOOK_SECRET = 'valid-webhook-secret';

      expect(() => {
        validateEnv();
      }).not.toThrow();

      expect(stderrWriteSpy).not.toHaveBeenCalled();
    });

    it('should accept empty string values as set (non-ideal but not missing)', () => {
      process.env.JWT_SECRET = '';
      process.env.QUEUE_AUTH_SECRET = '';
      process.env.RRR_WEBHOOK_SECRET = '';

      // Empty strings are falsy, so they should trigger missing check
      expect(() => {
        validateEnv();
      }).toThrow('Missing required env var(s): JWT_SECRET, QUEUE_AUTH_SECRET, RRR_WEBHOOK_SECRET');
    });
  });

  describe('non-production environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should warn but not throw when JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;
      process.env.QUEUE_AUTH_SECRET = 'valid-secret';
      process.env.RRR_WEBHOOK_SECRET = 'valid-secret';

      expect(() => {
        validateEnv();
      }).not.toThrow();

      expect(stderrWriteSpy).toHaveBeenCalledWith(
        'WARNING: Missing required env var(s): JWT_SECRET\n',
      );
    });

    it('should warn but not throw when multiple vars are missing', () => {
      delete process.env.JWT_SECRET;
      delete process.env.QUEUE_AUTH_SECRET;
      process.env.RRR_WEBHOOK_SECRET = 'valid-secret';

      expect(() => {
        validateEnv();
      }).not.toThrow();

      expect(stderrWriteSpy).toHaveBeenCalledWith(
        'WARNING: Missing required env var(s): JWT_SECRET, QUEUE_AUTH_SECRET\n',
      );
    });

    it('should not warn when all vars are set', () => {
      process.env.JWT_SECRET = 'valid-jwt-secret';
      process.env.QUEUE_AUTH_SECRET = 'valid-queue-secret';
      process.env.RRR_WEBHOOK_SECRET = 'valid-webhook-secret';

      expect(() => {
        validateEnv();
      }).not.toThrow();

      expect(stderrWriteSpy).not.toHaveBeenCalled();
    });
  });

  describe('test environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('should warn but not throw when vars are missing', () => {
      delete process.env.JWT_SECRET;
      delete process.env.QUEUE_AUTH_SECRET;
      delete process.env.RRR_WEBHOOK_SECRET;

      expect(() => {
        validateEnv();
      }).not.toThrow();

      expect(stderrWriteSpy).toHaveBeenCalledWith(
        'WARNING: Missing required env var(s): JWT_SECRET, QUEUE_AUTH_SECRET, RRR_WEBHOOK_SECRET\n',
      );
    });
  });

  describe('no NODE_ENV set', () => {
    beforeEach(() => {
      delete process.env.NODE_ENV;
    });

    it('should treat as non-production and warn', () => {
      delete process.env.JWT_SECRET;
      process.env.QUEUE_AUTH_SECRET = 'valid-secret';
      process.env.RRR_WEBHOOK_SECRET = 'valid-secret';

      expect(() => {
        validateEnv();
      }).not.toThrow();

      expect(stderrWriteSpy).toHaveBeenCalled();
    });
  });
});
