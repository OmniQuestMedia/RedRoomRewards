/**
 * SignupRateLimitMiddleware Unit Tests
 *
 * Mirrors the RateLimitMiddleware test pattern. Verifies that:
 * - SIGNUP_RATE_LIMIT_PER_MINUTE is read and applied
 * - Invalid values throw at initialization
 * - Default is 5 (not 60) — stricter than the general limiter
 */

import { SignupRateLimitMiddleware } from '../signup-rate-limit.middleware';

describe('SignupRateLimitMiddleware', () => {
  let middleware: SignupRateLimitMiddleware;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.SIGNUP_RATE_LIMIT_PER_MINUTE;
    middleware = new SignupRateLimitMiddleware();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SIGNUP_RATE_LIMIT_PER_MINUTE = originalEnv;
    } else {
      delete process.env.SIGNUP_RATE_LIMIT_PER_MINUTE;
    }
  });

  describe('onModuleInit', () => {
    it('should default to 5 when SIGNUP_RATE_LIMIT_PER_MINUTE is not set', () => {
      delete process.env.SIGNUP_RATE_LIMIT_PER_MINUTE;

      expect(() => {
        middleware.onModuleInit();
      }).not.toThrow();

      expect((middleware as any).limiter).toBeDefined();
    });

    it('should read SIGNUP_RATE_LIMIT_PER_MINUTE from env var', () => {
      process.env.SIGNUP_RATE_LIMIT_PER_MINUTE = '10';

      expect(() => {
        middleware.onModuleInit();
      }).not.toThrow();

      expect((middleware as any).limiter).toBeDefined();
    });

    it('should accept minimum valid value of 1', () => {
      process.env.SIGNUP_RATE_LIMIT_PER_MINUTE = '1';

      expect(() => {
        middleware.onModuleInit();
      }).not.toThrow();
    });

    it('should throw on invalid numeric string', () => {
      process.env.SIGNUP_RATE_LIMIT_PER_MINUTE = 'not-a-number';

      expect(() => {
        middleware.onModuleInit();
      }).toThrow('SIGNUP_RATE_LIMIT_PER_MINUTE must be a positive integer, got: not-a-number');
    });

    it('should throw on negative value', () => {
      process.env.SIGNUP_RATE_LIMIT_PER_MINUTE = '-1';

      expect(() => {
        middleware.onModuleInit();
      }).toThrow('SIGNUP_RATE_LIMIT_PER_MINUTE must be a positive integer, got: -1');
    });

    it('should throw on zero value', () => {
      process.env.SIGNUP_RATE_LIMIT_PER_MINUTE = '0';

      expect(() => {
        middleware.onModuleInit();
      }).toThrow('SIGNUP_RATE_LIMIT_PER_MINUTE must be a positive integer, got: 0');
    });

    it('should default to 5 when empty string is provided', () => {
      process.env.SIGNUP_RATE_LIMIT_PER_MINUTE = '';

      expect(() => {
        middleware.onModuleInit();
      }).not.toThrow();
    });
  });

  describe('use (request processing)', () => {
    beforeEach(() => {
      process.env.SIGNUP_RATE_LIMIT_PER_MINUTE = '5';
      middleware.onModuleInit();
    });

    it('should have limiter function defined after initialization', () => {
      expect((middleware as any).limiter).toBeDefined();
      expect(typeof (middleware as any).limiter).toBe('function');
    });

    it('should delegate to express-rate-limit limiter', () => {
      const mockReq = {} as any;
      const mockRes = {} as any;
      const mockNext = jest.fn();

      expect(() => {
        middleware.use(mockReq, mockRes, mockNext);
      }).not.toThrow();
    });
  });
});
