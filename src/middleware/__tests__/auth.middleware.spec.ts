/**
 * AuthMiddleware Unit Tests
 *
 * Tests the fail-closed security behavior:
 * - JWT_SECRET required at module initialization
 * - Missing/invalid tokens rejected with 401
 * - Valid tokens populate req.tenantId and req.userId
 */

import { AuthMiddleware } from '../auth.middleware';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

describe('AuthMiddleware', () => {
  let middleware: AuthMiddleware;
  let mockRequest: Partial<Request> & { tenantId?: string; userId?: string };
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  const TEST_SECRET = 'test-secret-minimum-32-characters-long';

  beforeEach(() => {
    // Setup mock request
    mockRequest = {
      headers: {},
    };

    // Setup mock response with chaining
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = {
      status: statusMock,
    };

    mockNext = jest.fn();

    // Create middleware instance
    middleware = new AuthMiddleware();
  });

  describe('onModuleInit', () => {
    it('should throw if JWT_SECRET is not set', () => {
      delete process.env.JWT_SECRET;

      expect(() => {
        middleware.onModuleInit();
      }).toThrow('JWT_SECRET is required for AuthMiddleware');
    });

    it('should initialize successfully when JWT_SECRET is set', () => {
      process.env.JWT_SECRET = TEST_SECRET;

      expect(() => {
        middleware.onModuleInit();
      }).not.toThrow();
    });
  });

  describe('use (request processing)', () => {
    beforeEach(() => {
      // Initialize middleware with secret
      process.env.JWT_SECRET = TEST_SECRET;
      middleware.onModuleInit();
    });

    it('should reject request with missing Authorization header', () => {
      mockRequest.headers = {};

      middleware.use(
        mockRequest as Request & { tenantId?: string; userId?: string },
        mockResponse as Response,
        mockNext,
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with malformed Authorization header', () => {
      mockRequest.headers = { authorization: 'NotBearer token' };

      middleware.use(
        mockRequest as Request & { tenantId?: string; userId?: string },
        mockResponse as Response,
        mockNext,
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid JWT token', () => {
      mockRequest.headers = { authorization: 'Bearer invalid.token.here' };

      middleware.use(
        mockRequest as Request & { tenantId?: string; userId?: string },
        mockResponse as Response,
        mockNext,
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'invalid or expired token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with expired JWT token', () => {
      const expiredToken = jwt.sign(
        { tenantId: 'tenant-1', userId: 'user-1' },
        TEST_SECRET,
        { expiresIn: '-1h' }, // Already expired
      );

      mockRequest.headers = { authorization: `Bearer ${expiredToken}` };

      middleware.use(
        mockRequest as Request & { tenantId?: string; userId?: string },
        mockResponse as Response,
        mockNext,
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'invalid or expired token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should accept valid JWT and populate req.tenantId and req.userId', () => {
      const validToken = jwt.sign({ tenantId: 'tenant-123', userId: 'user-456' }, TEST_SECRET, {
        expiresIn: '1h',
      });

      mockRequest.headers = { authorization: `Bearer ${validToken}` };

      middleware.use(
        mockRequest as Request & { tenantId?: string; userId?: string },
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest.tenantId).toBe('tenant-123');
      expect(mockRequest.userId).toBe('user-456');
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should populate req.userId from sub claim if userId is not present', () => {
      const validToken = jwt.sign({ tenantId: 'tenant-123', sub: 'user-789' }, TEST_SECRET, {
        expiresIn: '1h',
      });

      mockRequest.headers = { authorization: `Bearer ${validToken}` };

      middleware.use(
        mockRequest as Request & { tenantId?: string; userId?: string },
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest.tenantId).toBe('tenant-123');
      expect(mockRequest.userId).toBe('user-789');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should handle token with only tenantId', () => {
      const validToken = jwt.sign({ tenantId: 'tenant-only' }, TEST_SECRET, {
        expiresIn: '1h',
      });

      mockRequest.headers = { authorization: `Bearer ${validToken}` };

      middleware.use(
        mockRequest as Request & { tenantId?: string; userId?: string },
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest.tenantId).toBe('tenant-only');
      expect(mockRequest.userId).toBeUndefined();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should reject token signed with different secret', () => {
      const tokenWithWrongSecret = jwt.sign(
        { tenantId: 'tenant-1', userId: 'user-1' },
        'different-secret-minimum-32-chars',
        { expiresIn: '1h' },
      );

      mockRequest.headers = { authorization: `Bearer ${tokenWithWrongSecret}` };

      middleware.use(
        mockRequest as Request & { tenantId?: string; userId?: string },
        mockResponse as Response,
        mockNext,
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'invalid or expired token' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
