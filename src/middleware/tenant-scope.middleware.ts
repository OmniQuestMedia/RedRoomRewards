import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * TenantScopeMiddleware
 *
 * Propagates the authenticated tenant context into a `queryOptions`
 * bag on the request so that downstream service calls can attach the
 * correct `tenant_id` filter without re-reading the JWT on every query.
 *
 * FAIL-CLOSED: Missing tenantId is rejected with 403 Forbidden.
 * The `tenantId` field must be populated earlier in the middleware chain
 * (e.g. by AuthMiddleware).
 */
@Injectable()
export class TenantScopeMiddleware implements NestMiddleware {
  use(
    req: Request & { tenantId?: string; queryOptions?: Record<string, unknown> },
    res: Response,
    next: NextFunction,
  ): void {
    if (!req.tenantId) {
      res.status(403).json({ error: 'tenant scope required' });
      return;
    }

    req.queryOptions = { ...req.queryOptions, tenant_id: req.tenantId };
    next();
  }
}
