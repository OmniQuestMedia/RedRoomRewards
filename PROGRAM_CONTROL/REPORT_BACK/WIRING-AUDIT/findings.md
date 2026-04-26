# Phase 1: Per-Class Findings

Analysis of the five subjects flagged in the cleanup pass.

---

## AuthMiddleware

**File:** src/middleware/auth.middleware.ts:30

**Importers:** none

**Loaded at runtime:** no

**Verdict:** ORPHAN-INTENT-MISSING

**Evidence:**
`AuthMiddleware` is a NestJS `@Injectable()` middleware that extracts and verifies Bearer JWTs from the `Authorization` header (lines 37-66). It populates `req.tenantId` and `req.userId` from the verified JWT payload.

Grep search for imports of `AuthMiddleware` found zero TypeScript source files importing this class (only references in docs and the cleanup report). No module in the runtime graph (see `module-graph.md`) declares a `configure(consumer: MiddlewareConsumer)` method.

The enforcement map (see `enforcement-map.md`) shows **all routes except /health have `auth-enforcement: none`**. No guards, no global middleware, no service-level auth checks detected. Controllers `MerchantController` (line 14) and `CreatorGiftingPanelController` (line 10) access `req.user?.merchantId` and `req.user?.creatorId` respectively, but no mechanism populates `req.user` — these will always be undefined.

**Recommended action:** Wire-it. This is a ship blocker. Proposed wiring in `AppModule.configure()`:

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .forRoutes('*');
  }
}
```

Requires `import { AuthMiddleware } from './middleware/auth.middleware';` and `AppModule implements NestModule`. Middleware must be added to `AppModule.providers` array.

---

## RateLimitMiddleware

**File:** src/middleware/rate-limit.middleware.ts:26

**Importers:** none

**Loaded at runtime:** no

**Verdict:** ORPHAN-INTENT-MISSING

**Evidence:**
`RateLimitMiddleware` is a NestJS `@Injectable()` middleware wrapping `express-rate-limit` (lines 17-23) with a default config of 60 requests per 60-second window per IP.

Grep search for imports found zero TypeScript source files importing this class. No module configures middleware. The comment at line 7-8 explicitly states "Wire this into AppModule.configure() after AuthMiddleware and TenantScopeMiddleware."

The enforcement map shows **all routes have `rate-limit-enforcement: none`**. Without rate limiting, public-facing routes (signup, webhook receive) are vulnerable to DoS and abuse.

**Recommended action:** Wire-it. This is a ship blocker. Proposed wiring in `AppModule.configure()`:

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware, TenantScopeMiddleware, RateLimitMiddleware)
      .forRoutes('*');
  }
}
```

Middleware must be added to `AppModule.providers` array. Order matters: Auth → TenantScope → RateLimit per the comment in the middleware file.

---

## TenantScopeMiddleware

**File:** src/middleware/tenant-scope.middleware.ts:16

**Importers:** none

**Loaded at runtime:** no

**Verdict:** ORPHAN-INTENT-MISSING

**Evidence:**
`TenantScopeMiddleware` is a NestJS `@Injectable()` middleware that propagates `req.tenantId` (populated by `AuthMiddleware`) into `req.queryOptions` (lines 23-24) for downstream service-level tenant filtering.

Grep search for imports found zero TypeScript source files importing this class. The enforcement map shows **all routes have `tenant-scope-enforcement: none`** at the middleware/guard layer.

RedRoomRewards is a multi-tenant financial system (per docs/DOMAIN_GLOSSARY.md and multiple references to `tenant_id` in service code and CI scripts like `scripts/ci/tenant-id-scope-check.js`). Without tenant-scope middleware, services must manually extract tenantId from the request on every call — error-prone and non-DRY. The repository's tenant-scoping CI check (B-009) enforces `tenant_id` filters in query calls, but without this middleware populating `req.queryOptions`, services cannot use it.

**Recommended action:** Wire-it. This is a ship blocker for multi-tenant correctness. Proposed wiring in `AppModule.configure()` (same snippet as RateLimitMiddleware above — all three middlewares should be wired together in order: Auth → TenantScope → RateLimit).

---

## AwardingWalletController

**File:** src/controllers/awarding-wallet.controller.ts:6

**Importers:** none

**Loaded at runtime:** no

**Verdict:** DUPLICATE

**Evidence:**
`AwardingWalletController` defines `@Controller('awarding-wallet')` with a single route `@Post('upload-csv')` at line 9. This route accepts `{ rows: AwardingWalletUploadRow[] }` and delegates to `AwardingWalletService.uploadCSV()`.

Grep search for imports found zero TypeScript source files importing this class. The module graph shows this controller is **not** in any module's `controllers` array.

However, `MerchantController` (src/controllers/merchant.controller.ts), which **is** loaded in `MerchantModule`, defines a route at line 9: `@Post('awarding-wallet/upload-csv')` that calls the same `AwardingWalletService.uploadCSV()` method.

**Route collision analysis:**
- `AwardingWalletController` would serve: `POST /api/v1/awarding-wallet/upload-csv` (if it were wired)
- `MerchantController` serves: `POST /api/v1/merchants/awarding-wallet/upload-csv` (runtime route, confirmed)

These are **different paths** — no collision. However, both controllers call the same service method with the same intent. This is a design smell: two controllers implementing the same feature under different paths suggests incomplete migration or duplicated code.

Checking `MerchantModule` (src/merchant/merchant.module.ts): it declares `MerchantController` in `controllers` and `AwardingWalletService` in `providers`. The service is wired and functional.

**Recommended action:** Delete-it. `AwardingWalletController` is dead code. The live route is `POST /api/v1/merchants/awarding-wallet/upload-csv` served by `MerchantController`. The orphan controller serves no purpose and will confuse future maintainers.

---

## CreatorGiftingController

**File:** src/controllers/creator-gifting.controller.ts:6

**Importers:** none

**Loaded at runtime:** no

**Verdict:** ORPHAN-INTENT-MISSING

**Evidence:**
`CreatorGiftingController` defines `@Controller('creator-gifting')` with a single route `@Post('create')` at line 9. This route accepts a `CreatorGiftingPromotion` body and delegates to `CreatorGiftingService.createPromotion()`.

Grep search for imports found zero TypeScript source files importing this class. The module graph shows this controller is **not** in any module's `controllers` array.

Searching for similar routes: `CreatorGiftingPanelController` (src/controllers/creator-gifting-panel.controller.ts), which **is** loaded in `CreatorGiftingPanelModule`, defines `@Controller('creator/gifting-panel')` with only a `@Get('state')` route. No overlap.

Searching route table: no other controller serves `POST /api/v1/creator-gifting/create`.

Checking `CreatorGiftingService`: it exists at src/services/creator-gifting.service.ts and exports a `createPromotion()` method. However, grepping for modules that provide `CreatorGiftingService`:

```bash
$ grep -r "CreatorGiftingService" src/**/*.module.ts
```

No matches. `CreatorGiftingService` is also orphaned — it's not in any module's `providers` array.

**This is a ship blocker.** The health check endpoint (`GET /health`) lists `'creator-gifting'` as a live component (src/health/health.controller.ts:21), but the feature is completely unwired: no controller in the runtime graph, no service in any module's providers.

**Recommended action:** Wire-it. Proposed addition to `CreatorGiftingPanelModule`:

```typescript
import { CreatorGiftingController } from '../controllers/creator-gifting.controller';
import { CreatorGiftingService } from '../services/creator-gifting.service';

@Module({
  controllers: [CreatorGiftingPanelController, CreatorGiftingController],
  providers: [CreatorGiftingPanelService, CreatorGiftingService],
})
export class CreatorGiftingPanelModule {}
```

Alternative: create a separate `CreatorGiftingModule`. Escalate to architect for decision on module structure.

---

## Summary Table

| Class | Verdict | Ship Blocker | Action |
|-------|---------|--------------|--------|
| AuthMiddleware | ORPHAN-INTENT-MISSING | **YES** | Wire-it |
| RateLimitMiddleware | ORPHAN-INTENT-MISSING | **YES** | Wire-it |
| TenantScopeMiddleware | ORPHAN-INTENT-MISSING | **YES** | Wire-it |
| AwardingWalletController | DUPLICATE | No | Delete-it |
| CreatorGiftingController | ORPHAN-INTENT-MISSING | **YES** | Wire-it (requires wiring CreatorGiftingService too) |

**Verdict counts:**
- WIRED: 0
- ORPHAN-DEAD: 0
- ORPHAN-INTENT-MISSING: 4
- DUPLICATE: 1

**Ship blocker: YES**
Four critical classes are missing from the runtime graph: auth, rate limiting, tenant scoping, and a feature endpoint that the health check claims is live.
