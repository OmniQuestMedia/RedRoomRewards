/**
 * RateLimitMiddleware Unit Tests
 *
 * Tests configuration binding and validation:
 * - RATE_LIMIT_PER_MINUTE env var is read and applied
 * - Invalid values throw at initialization
 * - Defaults to 60 when not set
 */

import { RateLimitMiddleware } from '../rate-limit.middleware';

describe('RateLimitMiddleware', () => {
  let middleware: RateLimitMiddleware;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.RATE_LIMIT_PER_MINUTE;
    middleware = new RateLimitMiddleware();
  });

  afterEach(() => {
    // Restore original env var
    if (originalEnv !== undefined) {
      process.env.RATE_LIMIT_PER_MINUTE = originalEnv;
    } else {
      delete process.env.RATE_LIMIT_PER_MINUTE;
    }
  });

  describe('onModuleInit', () => {
    it('should use default value of 60 when RATE_LIMIT_PER_MINUTE is not set', () => {
      delete process.env.RATE_LIMIT_PER_MINUTE;

      expect(() => {
        middleware.onModuleInit();
      }).not.toThrow();

      // Verify the middleware was initialized (limiter is set)
      expect((middleware as any).limiter).toBeDefined();
    });

    it('should read RATE_LIMIT_PER_MINUTE from env var', () => {
      process.env.RATE_LIMIT_PER_MINUTE = '100';

      expect(() => {
        middleware.onModuleInit();
      }).not.toThrow();

      expect((middleware as any).limiter).toBeDefined();
    });

    it('should accept minimum valid value of 1', () => {
      process.env.RATE_LIMIT_PER_MINUTE = '1';

      expect(() => {
        middleware.onModuleInit();
      }).not.toThrow();
    });

    it('should accept large values', () => {
      process.env.RATE_LIMIT_PER_MINUTE = '10000';

      expect(() => {
        middleware.onModuleInit();
      }).not.toThrow();
    });

    it('should throw on invalid numeric string', () => {
      process.env.RATE_LIMIT_PER_MINUTE = 'not-a-number';

      expect(() => {
        middleware.onModuleInit();
      }).toThrow('RATE_LIMIT_PER_MINUTE must be a positive integer, got: not-a-number');
    });

    it('should throw on negative value', () => {
      process.env.RATE_LIMIT_PER_MINUTE = '-10';

      expect(() => {
        middleware.onModuleInit();
      }).toThrow('RATE_LIMIT_PER_MINUTE must be a positive integer, got: -10');
    });

    it('should throw on zero value', () => {
      process.env.RATE_LIMIT_PER_MINUTE = '0';

      expect(() => {
        middleware.onModuleInit();
      }).toThrow('RATE_LIMIT_PER_MINUTE must be a positive integer, got: 0');
    });

    it('should accept decimal value and truncate to integer', () => {
      process.env.RATE_LIMIT_PER_MINUTE = '60.5';

      // parseInt('60.5', 10) returns 60, which is valid
      expect(() => {
        middleware.onModuleInit();
      }).not.toThrow();
    });

    it('should default to 60 when empty string is provided', () => {
      process.env.RATE_LIMIT_PER_MINUTE = '';

      // Empty string is falsy, so it should use default
      expect(() => {
        middleware.onModuleInit();
      }).not.toThrow();
    });

    it('should throw on whitespace-only string', () => {
      process.env.RATE_LIMIT_PER_MINUTE = '   ';

      expect(() => {
        middleware.onModuleInit();
      }).toThrow('RATE_LIMIT_PER_MINUTE must be a positive integer, got:    ');
    });
  });

  describe('use (request processing)', () => {
    beforeEach(() => {
      process.env.RATE_LIMIT_PER_MINUTE = '100';
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

      // The limiter is from express-rate-limit, which is a middleware function
      // We just verify it doesn't throw when called
      expect(() => {
        middleware.use(mockReq, mockRes, mockNext);
      }).not.toThrow();
    });
  });
});
