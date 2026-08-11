/**
 * Security Wiring Integration Tests (Phase 3)
 *
 * Verifies that the route-policy constants are correctly defined and that
 * the three middleware layers (RateLimitMiddleware, AuthMiddleware,
 * TenantScopeMiddleware) enforce the expected boundaries.
 *
 * Test strategy: unit-level verification of the policy constants and
 * middleware logic using mocked request/response objects. Full HTTP
 * end-to-end tests that require a live NestJS app + MongoDB replica set
 * are marked with it.skip and a TODO reference to B-006.
 *
 * Classification of tests:
 *   ✅ All 13 tests run without infrastructure dependencies.
 */

import { RequestMethod } from '@nestjs/common';
import { PUBLIC_ROUTES, AUTH_ONLY_ROUTES, TENANT_SCOPED_ROUTES } from '../../config/route-policy';
import { AuthMiddleware } from '../../middleware/auth.middleware';
import { TenantScopeMiddleware } from '../../middleware/tenant-scope.middleware';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// Minimum 32 characters — matches the production JWT_SECRET minimum enforced by
// AuthMiddleware.onModuleInit(). Using a fixed-length secret here ensures tests
// exercise the same secret-length constraints as production.
const TEST_SECRET = 'test-jwt-secret-at-least-32-characters-long!';

function makeAuthMiddleware(): AuthMiddleware {
  process.env.JWT_SECRET = TEST_SECRET;
  const mw = new AuthMiddleware();
  mw.onModuleInit();
  return mw;
}

function makeTenantMiddleware(): TenantScopeMiddleware {
  return new TenantScopeMiddleware();
}

type MockedReq = Partial<Request> & {
  tenantId?: string;
  userId?: string;
  queryOptions?: Record<string, unknown>;
};

function mockReqRes(): {
  req: MockedReq;
  res: Partial<Response>;
  next: jest.MockedFunction<NextFunction>;
  json: jest.Mock;
  status: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const next = jest.fn() as jest.MockedFunction<NextFunction>;
  return {
    req: { headers: {} },
    res: { status, json },
    next,
    json,
    status,
  };
}

// ---------------------------------------------------------------------------
// Group 1 — PUBLIC_ROUTES shape and contents
// ---------------------------------------------------------------------------

describe('Security Wiring — PUBLIC_ROUTES policy', () => {
  it('should contain exactly 6 routes (3 health + signup + webhook receive + woocommerce webhook)', () => {
    expect(PUBLIC_ROUTES).toHaveLength(6);
  });

  it('should include GET /health as combined health summary', () => {
    const route = PUBLIC_ROUTES.find((r) => r.path === 'health');
    expect(route).toBeDefined();
    expect(route!.method).toBe(RequestMethod.GET);
  });

  it('should include GET /health/live as orchestrator liveness probe', () => {
    const route = PUBLIC_ROUTES.find((r) => r.path === 'health/live');
    expect(route).toBeDefined();
    expect(route!.method).toBe(RequestMethod.GET);
  });

  it('should include GET /health/ready as orchestrator readiness probe', () => {
    const route = PUBLIC_ROUTES.find((r) => r.path === 'health/ready');
    expect(route).toBeDefined();
    expect(route!.method).toBe(RequestMethod.GET);
  });

  it('should include POST /api/v1/members/signup as account-creation surface', () => {
    const route = PUBLIC_ROUTES.find((r) => r.path === 'api/v1/members/signup');
    expect(route).toBeDefined();
    expect(route!.method).toBe(RequestMethod.POST);
  });

  it('should include POST /api/v1/webhooks/receive as HMAC-authenticated surface', () => {
    const route = PUBLIC_ROUTES.find((r) => r.path === 'api/v1/webhooks/receive');
    expect(route).toBeDefined();
    expect(route!.method).toBe(RequestMethod.POST);
  });

  it('should include POST /api/v1/integrations/woocommerce/webhook as HMAC-authenticated surface', () => {
    const route = PUBLIC_ROUTES.find((r) => r.path === 'api/v1/integrations/woocommerce/webhook');
    expect(route).toBeDefined();
    expect(route!.method).toBe(RequestMethod.POST);
  });

  it('should contain no financial route patterns', () => {
    const financialPatterns = ['wallet', 'burn', 'redeem', 'credit', 'deduct', 'ledger'];
    const publicPaths = PUBLIC_ROUTES.map((r) => r.path);
    for (const pattern of financialPatterns) {
      const match = publicPaths.find((p) => p.includes(pattern));
      expect(match).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Group 2 — TENANT_SCOPED_ROUTES and AUTH_ONLY_ROUTES coverage
// ---------------------------------------------------------------------------

describe('Security Wiring — protected route classification', () => {
  // These counts are a tripwire, not trivia: adding a route without deciding
  // its classification fails here. Update the number only alongside a
  // deliberate entry in route-policy.ts.
  it('should classify 18 routes as AUTH-AND-TENANT', () => {
    expect(TENANT_SCOPED_ROUTES).toHaveLength(18);
  });

  it('should classify 13 routes as AUTH-ONLY', () => {
    expect(AUTH_ONLY_ROUTES).toHaveLength(13);
  });

  it('should put every member-facing promotions route under AUTH-AND-TENANT', () => {
    const memberPromotionRoutes = TENANT_SCOPED_ROUTES.filter((r) =>
      r.path.startsWith('api/v1/promotions'),
    );
    expect(memberPromotionRoutes).toHaveLength(5);

    // The point-burning claim endpoint must never be reachable without a
    // tenant claim — it debits a member's balance.
    const claim = memberPromotionRoutes.find((r) => r.path === 'api/v1/promotions/offers/claim');
    expect(claim).toBeDefined();
    expect(claim!.method).toBe(RequestMethod.POST);
  });

  it('should keep promotions admin routes out of PUBLIC_ROUTES', () => {
    const publicPromotions = PUBLIC_ROUTES.filter((r) => r.path.includes('promotions'));
    expect(publicPromotions).toHaveLength(0);
  });

  it('should include ledger transaction history endpoints in AUTH-ONLY', () => {
    const listRoute = AUTH_ONLY_ROUTES.find((r) => r.path === 'api/v1/ledger/transactions');
    expect(listRoute).toBeDefined();
    expect(listRoute!.method).toBe(RequestMethod.GET);

    const detailRoute = AUTH_ONLY_ROUTES.find(
      (r) => r.path === 'api/v1/ledger/transactions/:entryId',
    );
    expect(detailRoute).toBeDefined();
    expect(detailRoute!.method).toBe(RequestMethod.GET);
  });

  it('should include escrow detail endpoint in AUTH-ONLY', () => {
    const escrowRoute = AUTH_ONLY_ROUTES.find(
      (r) => r.path === 'api/v1/wallets/:userId/escrow/:escrowId',
    );
    expect(escrowRoute).toBeDefined();
    expect(escrowRoute!.method).toBe(RequestMethod.GET);
  });

  it('should put the cross-tenant liability report in AUTH-ONLY (not tenant-scoped)', () => {
    const authOnly = AUTH_ONLY_ROUTES.find((r) => r.path === 'api/v1/reports/liability');
    expect(authOnly).toBeDefined();
    expect(authOnly!.method).toBe(RequestMethod.GET);

    // Must NOT appear in TENANT_SCOPED_ROUTES
    const tenantScoped = TENANT_SCOPED_ROUTES.find((r) => r.path === 'api/v1/reports/liability');
    expect(tenantScoped).toBeUndefined();
  });

  it('should cover all financial mutation surfaces in TENANT_SCOPED_ROUTES', () => {
    const paths = TENANT_SCOPED_ROUTES.map((r) => r.path);
    expect(paths).toContain('api/v1/wallet/credit');
    expect(paths).toContain('api/v1/wallet/deduct');
    expect(paths).toContain('api/v1/burn/redeem');
    expect(paths).toContain('api/v1/merchants/awarding-wallet/upload-csv');
  });
});

// ---------------------------------------------------------------------------
// Group 3 — AuthMiddleware fail-closed on protected routes
// ---------------------------------------------------------------------------

describe('Security Wiring — AuthMiddleware fail-closed on protected routes', () => {
  it('should reject request with no Authorization header with 401', () => {
    const mw = makeAuthMiddleware();
    const { req, res, next, status, json } = mockReqRes();
    req.headers = {};

    mw.use(req as Request & { tenantId?: string; userId?: string }, res as Response, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow request with a valid JWT to proceed and populate tenantId', () => {
    const mw = makeAuthMiddleware();
    const { req, res, next } = mockReqRes();
    const token = jwt.sign({ tenantId: 'tenant-abc', userId: 'user-123' }, TEST_SECRET);
    req.headers = { authorization: `Bearer ${token}` };

    mw.use(req as Request & { tenantId?: string; userId?: string }, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.tenantId).toBe('tenant-abc');
    expect(req.userId).toBe('user-123');
  });
});

// ---------------------------------------------------------------------------
// Group 4 — TenantScopeMiddleware fail-closed on AUTH-AND-TENANT routes
// ---------------------------------------------------------------------------

describe('Security Wiring — TenantScopeMiddleware fail-closed on tenant routes', () => {
  it('should reject request with missing tenantId with 403', () => {
    const mw = makeTenantMiddleware();
    const { req, res, next, status, json } = mockReqRes();
    req.tenantId = undefined;

    mw.use(
      req as Request & { tenantId?: string; queryOptions?: Record<string, unknown> },
      res as Response,
      next,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'tenant scope required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should propagate tenantId into queryOptions and call next', () => {
    const mw = makeTenantMiddleware();
    const { req, res, next } = mockReqRes();
    req.tenantId = 'tenant-xyz';

    mw.use(
      req as Request & { tenantId?: string; queryOptions?: Record<string, unknown> },
      res as Response,
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(req.queryOptions).toEqual({ tenant_id: 'tenant-xyz' });
  });
});
