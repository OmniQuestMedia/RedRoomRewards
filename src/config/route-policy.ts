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
 * routes BEFORE global middleware, so they cannot be intercepted by NestJS
 * middleware. They are gated at module load time by setupSwagger():
 *   - NODE_ENV=production    → docs are NOT mounted (no public schema exposure)
 *   - any other NODE_ENV     → docs are mounted (dev/staging/test debug surface)
 * To expose the docs in production with auth, replace the gate with a custom
 * Express handler — never remove the gate without an auth replacement.
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
 * Health        — combined health summary; must not require auth.
 * Health/live   — orchestrator liveness probe; must not require auth.
 * Health/ready  — orchestrator readiness probe (DB-aware); must not require auth.
 * Signup        — account creation; auth token does not exist yet at this point.
 * Webhooks      — authenticated by HMAC signature in the handler, not by Bearer JWT.
 */
export const PUBLIC_ROUTES: RouteInfo[] = [
  { path: 'health', method: RequestMethod.GET },
  { path: 'health/live', method: RequestMethod.GET },
  { path: 'health/ready', method: RequestMethod.GET },
  { path: 'api/v1/members/signup', method: RequestMethod.POST },
  { path: 'api/v1/webhooks/receive', method: RequestMethod.POST },
  // WooCommerce webhook — HMAC-SHA256 verified in handler, not by Bearer JWT
  { path: 'api/v1/integrations/woocommerce/webhook', method: RequestMethod.POST },
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
  // Screen 06 — Redemption Flow (Member)
  { path: 'api/v1/redemptions', method: RequestMethod.POST },
  { path: 'api/v1/redemptions/eligible', method: RequestMethod.GET },
  // Burn Catalogue — member-facing (tenant-scoped)
  { path: 'api/v1/catalogue', method: RequestMethod.GET },
  { path: 'api/v1/catalogue/:id', method: RequestMethod.GET },
  { path: 'api/v1/catalogue/redeem', method: RequestMethod.POST },
  { path: 'api/v1/catalogue/my-redemptions', method: RequestMethod.GET },
];

/**
 * Routes that require authentication but NOT tenant scope.
 *
 * Cross-tenant liability reporting runs with platform-level credentials that
 * are not scoped to a single tenant. The reporter identity is still verified
 * by AuthMiddleware; TenantScopeMiddleware is excluded.
 *
 * Ledger transaction history (Screen 04) and escrow detail (Screen 05) are
 * auth-only — they require a valid JWT so the caller is identified, but they
 * are read-only queries that do not mutate state and therefore do not require
 * a tenant scope claim.
 */
export const AUTH_ONLY_ROUTES: RouteInfo[] = [
  { path: 'api/v1/reports/liability', method: RequestMethod.GET },
  // Screen 07 — Merchant Admin Awarding Wallet (step-up auth enforced in service)
  { path: 'api/v1/admin/earn', method: RequestMethod.POST },
  { path: 'api/v1/ledger/transactions', method: RequestMethod.GET },
  { path: 'api/v1/ledger/transactions/:entryId', method: RequestMethod.GET },
  { path: 'api/v1/wallets/:userId/escrow/:escrowId', method: RequestMethod.GET },
  // Burn Catalogue — admin management (auth-only; tenant_id must be provided in request body)
  { path: 'api/v1/admin/catalogue', method: RequestMethod.POST },
  { path: 'api/v1/admin/catalogue/:id', method: RequestMethod.PUT },
];
