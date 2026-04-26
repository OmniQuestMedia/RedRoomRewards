/**
 * TenantScopeMiddleware Unit Tests
 *
 * Tests the fail-closed security behavior:
 * - Missing tenantId rejected with 403 Forbidden
 * - Valid tenantId propagates to req.queryOptions
 */

import { TenantScopeMiddleware } from '../tenant-scope.middleware';
import { Request, Response, NextFunction } from 'express';

describe('TenantScopeMiddleware', () => {
  let middleware: TenantScopeMiddleware;
  let mockRequest: Partial<Request> & {
    tenantId?: string;
    queryOptions?: Record<string, unknown>;
  };
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    middleware = new TenantScopeMiddleware();

    mockRequest = {};

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = {
      status: statusMock,
    };

    mockNext = jest.fn();
  });

  describe('fail-closed behavior', () => {
    it('should reject request with missing tenantId', () => {
      mockRequest.tenantId = undefined;

      middleware.use(
        mockRequest as Request & { tenantId?: string; queryOptions?: Record<string, unknown> },
        mockResponse as Response,
        mockNext,
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'tenant scope required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with empty string tenantId', () => {
      mockRequest.tenantId = '';

      middleware.use(
        mockRequest as Request & { tenantId?: string; queryOptions?: Record<string, unknown> },
        mockResponse as Response,
        mockNext,
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'tenant scope required' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('successful scoping', () => {
    it('should populate queryOptions with tenant_id when tenantId is present', () => {
      mockRequest.tenantId = 'tenant-123';

      middleware.use(
        mockRequest as Request & { tenantId?: string; queryOptions?: Record<string, unknown> },
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest.queryOptions).toEqual({ tenant_id: 'tenant-123' });
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should merge tenant_id into existing queryOptions', () => {
      mockRequest.tenantId = 'tenant-456';
      mockRequest.queryOptions = { limit: 10, offset: 0 };

      middleware.use(
        mockRequest as Request & { tenantId?: string; queryOptions?: Record<string, unknown> },
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest.queryOptions).toEqual({
        limit: 10,
        offset: 0,
        tenant_id: 'tenant-456',
      });
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should overwrite existing tenant_id in queryOptions', () => {
      mockRequest.tenantId = 'tenant-new';
      mockRequest.queryOptions = { tenant_id: 'tenant-old', other: 'value' };

      middleware.use(
        mockRequest as Request & { tenantId?: string; queryOptions?: Record<string, unknown> },
        mockResponse as Response,
        mockNext,
      );

      expect(mockRequest.queryOptions).toEqual({
        tenant_id: 'tenant-new',
        other: 'value',
      });
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });
});
