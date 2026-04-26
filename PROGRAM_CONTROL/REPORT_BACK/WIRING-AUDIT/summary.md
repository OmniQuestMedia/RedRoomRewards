# Phase 2: Cross-Cutting Summary

## 1. Unprotected Route List

Routes lacking authentication where `auth-enforcement = none` AND the route is NOT explicitly public.

**Explicitly public (excluded):**
- `GET /health` — health check endpoint

**Routes requiring authentication but lacking it:**

| Route | Method | Controller | Severity | Justification |
|-------|--------|------------|----------|---------------|
| /api/v1/merchants/awarding-wallet/upload-csv | POST | MerchantController | **CRITICAL** | Merchant bulk point-award operation. Financial mutation. Controller accesses `req.user?.merchantId` but no middleware populates it. |
| /api/v1/burn/redeem | POST | BurnController | **CRITICAL** | Point redemption (burn). Financial debit operation. No auth. |
| /api/v1/reports/liability | GET | ReportingController | **HIGH** | Financial liability report. Sensitive business data. No auth. |
| /api/v1/white-label/config | POST | WhiteLabelController | **HIGH** | Merchant configuration write. No auth. |
| /api/v1/white-label/config/:merchantId | GET | WhiteLabelController | **MEDIUM** | Merchant configuration read. Potential data leak without auth. |
| /api/v1/creator/gifting-panel/state | GET | CreatorGiftingPanelController | **MEDIUM** | Creator-scoped data. Controller accesses `req.user?.creatorId` but no middleware populates it. |
| /api/v1/wallet/credit | POST | WalletController | **CRITICAL** | Wallet credit (point award). Financial mutation. No auth. |
| /api/v1/wallet/deduct | POST | WalletController | **CRITICAL** | Wallet debit. Financial mutation. No auth. |

**Possibly legitimate public routes (needs confirmation):**
- `/api/v1/members/signup` (POST, MemberController) — User signup may be intentionally public. Verify with architect.

**Protected by other means:**
- `/api/v1/webhooks/receive` (POST, WebhookReceiveController) — Has signature verification in `WebhookReceiveService.handleIncoming()`. Not user auth but webhook authenticity check.

**Total unprotected routes requiring auth:** 8 (all MEDIUM to CRITICAL severity)

---

## 2. No-Rate-Limit List

Routes lacking rate limiting that accept unauthenticated input or are vulnerable to abuse.

**All routes lack rate limiting** (see enforcement-map.md). High-risk routes:

| Route | Method | Risk | Justification |
|-------|--------|------|---------------|
| /api/v1/members/signup | POST | **HIGH** | Public signup endpoint. Vulnerable to automated account creation, spam, DoS. |
| /api/v1/webhooks/receive | POST | **HIGH** | Webhook endpoint. Accepts external input. Vulnerable to flood attacks even with signature verification. |
| /api/v1/wallet/credit | POST | **CRITICAL** | Financial mutation. Without rate limit + auth, trivially exploitable for unlimited point creation. |
| /api/v1/wallet/deduct | POST | **CRITICAL** | Financial mutation. |
| /api/v1/burn/redeem | POST | **CRITICAL** | Financial mutation. |
| /api/v1/merchants/awarding-wallet/upload-csv | POST | **HIGH** | Bulk operation. Could be used for DoS via large payloads. |

**Mitigation:** Wire `RateLimitMiddleware` (exists at src/middleware/rate-limit.middleware.ts but not loaded).

---

## 3. No-Tenant-Scope List

Routes that touch tenant-scoped data but lack tenant-scope enforcement at middleware/guard layer.

**Service-level tenant scoping verification deferred** per prompt instructions. The following routes operate on tenant-scoped resources (wallets, ledger, redemptions, merchant data) but have `tenant-scope-enforcement: none` at the transport layer:

| Route | Method | Controller | Service Called | Tenant-Scoped Resource |
|-------|--------|------------|----------------|------------------------|
| /api/v1/merchants/awarding-wallet/upload-csv | POST | MerchantController | AwardingWalletService.uploadCSV | Merchant wallet awards |
| /api/v1/burn/redeem | POST | BurnController | BurnCatalogService.redeemPoints | User wallet redemptions |
| /api/v1/wallet/credit | POST | WalletController | LedgerService.creditPoints | User wallet |
| /api/v1/wallet/deduct | POST | WalletController | LedgerService.deductPoints | User wallet |
| /api/v1/white-label/config | POST | WhiteLabelController | WhiteLabelService.saveConfig | Merchant config |
| /api/v1/white-label/config/:merchantId | GET | WhiteLabelController | WhiteLabelService.getConfig | Merchant config |
| /api/v1/creator/gifting-panel/state | GET | CreatorGiftingPanelController | CreatorGiftingPanelService.getPanelState | Creator-scoped data |
| /api/v1/reports/liability | GET | ReportingController | ReportingService.getLiabilityReport | Tenant liability report |

**Note:** Repository contains CI enforcement for tenant_id scoping at the service layer (`scripts/ci/tenant-id-scope-check.js` per memory). However, without `AuthMiddleware` populating `req.tenantId` and `TenantScopeMiddleware` propagating it to `req.queryOptions`, services cannot consume it. This is a gap in the enforcement chain.

**Mitigation:** Wire `AuthMiddleware` and `TenantScopeMiddleware` (both exist but not loaded).

---

## 4. Module Orphans

Modules in `src/**/*.module.ts` that are **not** transitively imported from `AppModule`.

**Result:** NONE

All 10 modules found in the repository are in the runtime module graph (verified in `module-graph.md`):
- AppModule (root)
- MemberModule
- MerchantModule
- BurnModule
- ReportingModule
- WhiteLabelModule
- CreatorGiftingPanelModule
- RedRoomLedgerModule
- WalletModule
- WebhookModule

---

## 5. Controller Orphans

Controller files in `src/**/*.controller.ts` with `@Controller()` decorator that are **not** declared in any module's `controllers: [...]` array.

**Orphan controllers:**

1. **AwardingWalletController** — src/controllers/awarding-wallet.controller.ts
   - Has `@Controller('awarding-wallet')` decorator
   - Not in any module
   - Verdict: DUPLICATE (see findings.md) — functionality served by MerchantController

2. **CreatorGiftingController** — src/controllers/creator-gifting.controller.ts
   - Has `@Controller('creator-gifting')` decorator
   - Not in any module
   - Verdict: ORPHAN-INTENT-MISSING (see findings.md) — should be wired

**Non-controllers (no `@Controller()` decorator):**

The following files are named `*.controller.ts` but are **not** NestJS controllers (no decorator):
- src/api/events.controller.ts — Plain TypeScript class
- src/api/ledger.controller.ts — Plain TypeScript class
- src/api/wallet.controller.ts — Plain TypeScript class (NOTE: different from src/controllers/wallet.controller.ts which IS a NestJS controller)

These are likely legacy code or prototype stubs. Not included in the orphan count because they cannot be wired as NestJS controllers without adding the decorator first.

---

## Ship-Blocker Call

**Ship blocker: YES**

**Reason:**
- **8 unprotected routes** including 4 CRITICAL financial mutation endpoints (credit, deduct, redeem, merchant bulk award)
- **Zero rate limiting** on any route, including public signup and financial operations
- **Zero tenant-scope enforcement** at transport layer for multi-tenant financial system
- **4 critical middleware classes** (AuthMiddleware, RateLimitMiddleware, TenantScopeMiddleware, CreatorGiftingController) exist but are orphaned

**Impact:**
- Any anonymous user can call `/api/v1/wallet/credit` to create unlimited points
- Any anonymous user can call `/api/v1/burn/redeem` to redeem points without authentication
- No rate limiting allows DoS attacks and automated abuse
- Multi-tenant data isolation not enforced at the HTTP layer (relies entirely on service-level checks which may be incomplete)

**Next Steps:**
1. Wire AuthMiddleware, TenantScopeMiddleware, RateLimitMiddleware into AppModule.configure() (see findings.md for proposed implementation)
2. Wire CreatorGiftingController + CreatorGiftingService into CreatorGiftingPanelModule or new module
3. Delete AwardingWalletController (duplicate)
4. Run full auth/tenant/rate-limit integration tests after wiring
5. Review service-level tenant_id enforcement for every route in section 3 above

**Evidence files:**
- entrypoint.md
- module-graph.md
- route-table.md
- enforcement-map.md
- findings.md (this file)
