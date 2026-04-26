/**
 * Route Policy — Centralized Security Classification
 *
 * Every route served by this application must appear in exactly one of the
 * three buckets below. The configure() method in AppModule wires middleware
 * in the order: RateLimitMiddleware → AuthMiddleware → TenantScopeMiddleware,
 * and excludes PUBLIC_ROUTES from AuthMiddleware and TenantScopeMiddleware.
 *
 * ── LOGIN ROUTE ──────────────────────────────────────────────────────────────
 * There is no /login endpoint in this service. JWT tokens are minted by an
 * external Identity Provider (IdP) and presented here as Bearer tokens.
 * RedRoomRewards is a loyalty platform only — it validates tokens but does not
 * issue them. See docs/DOMAIN_GLOSSARY.md §auth and api/openapi.yaml for the
 * external auth flow.
 *
 * ── OPENAPI DOCS ─────────────────────────────────────────────────────────────
 * SwaggerModule.setup('api/docs', app, document) mounts at:
 *   GET /api/docs          — Swagger UI
 *   GET /api-json          — OpenAPI JSON spec
 * These bypass the global api/v1 prefix and are registered as bare Express
 * routes BEFORE global middleware, so they are effectively public. They are
 * not listed here because NestJS middleware cannot intercept them at this
 * layer. If the docs surface must be gated, configure SwaggerModule with a
 * custom auth guard or disable it in production (NODE_ENV=production check
 * in setupSwagger). Current posture: docs are public (acceptable for dev;
 * should be reviewed before production hardening).
 *
 * ── SIGNUP RATE LIMIT ────────────────────────────────────────────────────────
 * /api/v1/members/signup is in PUBLIC_ROUTES. It is governed by
 * SignupRateLimitMiddleware (default 5/min, configurable via
 * SIGNUP_RATE_LIMIT_PER_MINUTE) — stricter than the global RateLimitMiddleware
 * because account-creation is the #1 bot-flood and credential-stuffing vector.
 * AppModule.configure() excludes signup from RateLimitMiddleware so requests
 * are not double-counted. Closes RISK-002.
 *
 * @module config/route-policy
 */

import { RequestMethod } from '@nestjs/common';
import { RouteInfo } from '@nestjs/common/interfaces';

/**
 * Routes that are accessible without authentication or tenant context.
 *
 * Health — liveness/readiness probe; must not require auth.
 * Signup — account creation; auth token does not exist yet at this point.
 * Webhooks — authenticated by HMAC signature in the handler, not by Bearer JWT.
 */
export const PUBLIC_ROUTES: RouteInfo[] = [
  { path: 'health', method: RequestMethod.GET },
  { path: 'api/v1/members/signup', method: RequestMethod.POST },
  { path: 'api/v1/webhooks/receive', method: RequestMethod.POST },
];

/**
 * Routes that require both authentication AND tenant scope.
 *
 * All financial mutations (wallet credit/deduct, burn/redeem, bulk CSV award)
 * and configuration surfaces (white-label, creator gifting panel) require a
 * valid JWT (populated by AuthMiddleware) AND a tenant_id claim
 * (enforced by TenantScopeMiddleware).
 */
export const TENANT_SCOPED_ROUTES: RouteInfo[] = [
  { path: 'api/v1/wallet/credit', method: RequestMethod.POST },
  { path: 'api/v1/wallet/deduct', method: RequestMethod.POST },
  { path: 'api/v1/burn/redeem', method: RequestMethod.POST },
  { path: 'api/v1/merchants/awarding-wallet/upload-csv', method: RequestMethod.POST },
  { path: 'api/v1/white-label/config', method: RequestMethod.POST },
  { path: 'api/v1/white-label/config/:merchantId', method: RequestMethod.GET },
  { path: 'api/v1/creator/gifting-panel/state', method: RequestMethod.GET },
];

/**
 * Routes that require authentication but NOT tenant scope.
 *
 * Cross-tenant liability reporting runs with platform-level credentials that
 * are not scoped to a single tenant. The reporter identity is still verified
 * by AuthMiddleware; TenantScopeMiddleware is excluded.
 */
export const AUTH_ONLY_ROUTES: RouteInfo[] = [
  { path: 'api/v1/reports/liability', method: RequestMethod.GET },
];
