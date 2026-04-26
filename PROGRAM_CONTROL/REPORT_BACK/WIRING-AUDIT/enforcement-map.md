# Enforcement Map

Analysis of authentication, rate-limiting, and tenant-scope enforcement for each route.

**Legend:**
- `none` — No enforcement detected
- `middleware:<ClassName>` — Applied via MiddlewareConsumer
- `guard:<ClassName>` — Applied via @UseGuards decorator
- `service-level` — Enforcement in service layer (cite file:line)
- `unknown` — Could not determine

## Route-by-Route Enforcement

| Route | Auth Enforcement | Rate Limit Enforcement | Tenant Scope Enforcement | Notes |
|-------|------------------|------------------------|--------------------------|-------|
| GET /health | none | none | none | Explicitly public (health check) |
| POST /api/v1/members/signup | none | none | none | No decorators, guards, or middleware |
| POST /api/v1/merchants/awarding-wallet/upload-csv | none | none | none | Controller accesses `req.user?.merchantId` (line 14) but no enforcement that `req.user` is populated |
| POST /api/v1/burn/redeem | none | none | none | No decorators, guards, or middleware |
| GET /api/v1/reports/liability | none | none | none | No decorators, guards, or middleware |
| POST /api/v1/white-label/config | none | none | none | No decorators, guards, or middleware |
| GET /api/v1/white-label/config/:merchantId | none | none | none | No decorators, guards, or middleware |
| GET /api/v1/creator/gifting-panel/state | none | none | none | Controller accesses `req.user?.creatorId` (line 10) but no enforcement that `req.user` is populated |
| POST /api/v1/wallet/credit | none | none | none | No decorators, guards, or middleware |
| POST /api/v1/wallet/deduct | none | none | none | No decorators, guards, or middleware |
| POST /api/v1/webhooks/receive | none | none | service-level | Webhook signature verification in `WebhookReceiveService.handleIncoming` (src/webhooks/webhook-receive.service.ts) — NOT auth/tenant |

## Analysis

### Auth Enforcement

**No routes have authentication enforcement at any layer:**
- No middleware: `AppModule` and child modules have no `configure(consumer: MiddlewareConsumer)` method
- No guards: No controllers use `@UseGuards()` decorator
- No global guards: `src/main.ts` does not call `app.useGlobalGuards(...)`
- Service-level: Not applicable for auth (auth is a transport concern)

**Controllers that assume `req.user` exists but don't enforce it:**
- `MerchantController` (src/controllers/merchant.controller.ts:14) — accesses `req.user?.merchantId`
- `CreatorGiftingPanelController` (src/controllers/creator-gifting-panel.controller.ts:10) — accesses `req.user?.creatorId`

These controllers will receive `undefined` for `req.user` on every request because no middleware populates it.

### Rate Limit Enforcement

**No routes have rate limiting:**
- No middleware: `RateLimitMiddleware` exists but is not wired
- No decorators or guards for rate limiting found

### Tenant Scope Enforcement

**No routes have tenant-scope enforcement:**
- No middleware: `TenantScopeMiddleware` exists but is not wired
- No guards
- Service-level: Would require reading all service methods — defer to human review

**Relevant code artifacts not wired:**
- `AuthMiddleware` (src/middleware/auth.middleware.ts) — would populate `req.tenantId` and `req.userId` from JWT
- `TenantScopeMiddleware` (src/middleware/tenant-scope.middleware.ts) — would propagate `req.tenantId` to `req.queryOptions`
- `RateLimitMiddleware` (src/middleware/rate-limit.middleware.ts) — would apply per-IP rate limiting

## Unprotected Routes (Ship-Blocker Candidates)

All routes except `/health` lack authentication. Listing routes that clearly should be protected:

1. `POST /api/v1/merchants/awarding-wallet/upload-csv` — merchant operation
2. `POST /api/v1/burn/redeem` — point redemption (financial)
3. `GET /api/v1/reports/liability` — sensitive financial report
4. `POST /api/v1/white-label/config` — admin/merchant configuration
5. `GET /api/v1/white-label/config/:merchantId` — merchant configuration
6. `GET /api/v1/creator/gifting-panel/state` — creator-scoped data
7. `POST /api/v1/wallet/credit` — financial mutation
8. `POST /api/v1/wallet/deduct` — financial mutation

**Possibly public:**
- `POST /api/v1/members/signup` — signup may be legitimately public

**Protected by signature:**
- `POST /api/v1/webhooks/receive` — webhook signature verification in service

## Verification Method

- Scanned all modules for `configure(consumer)` method: NONE FOUND
- Scanned all controllers for `@UseGuards()` decorator: NONE FOUND
- Checked `src/main.ts` for global guards/middleware: NONE FOUND
- Read each controller for inline enforcement: NONE FOUND (except webhook signature check at service layer)
