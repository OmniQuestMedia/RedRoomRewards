# Route Bucket Classification — Phase 1 Audit

**Date:** 2026-04-26  
**Branch:** copilot/investigate-failing-tests  
**Method:** Static analysis of all `*.controller.ts` files + module graph traversal

---

## Live Routes (registered in module graph)

| # | Method | Path (with global prefix) | Controller | Module | Bucket |
|---|--------|--------------------------|------------|--------|--------|
| 1 | GET | /health | HealthController | AppModule (direct) | PUBLIC |
| 2 | POST | /api/v1/members/signup | MemberController | MemberModule | PUBLIC |
| 3 | POST | /api/v1/webhooks/receive | WebhookReceiveController | WebhookModule | PUBLIC |
| 4 | GET | /api/v1/reports/liability | ReportingController | ReportingModule | AUTH-ONLY |
| 5 | POST | /api/v1/wallet/credit | WalletController | WalletModule | AUTH-AND-TENANT |
| 6 | POST | /api/v1/wallet/deduct | WalletController | WalletModule | AUTH-AND-TENANT |
| 7 | POST | /api/v1/burn/redeem | BurnController | BurnModule | AUTH-AND-TENANT |
| 8 | POST | /api/v1/merchants/awarding-wallet/upload-csv | MerchantController | MerchantModule | AUTH-AND-TENANT |
| 9 | POST | /api/v1/white-label/config | WhiteLabelController | WhiteLabelModule | AUTH-AND-TENANT |
| 10 | GET | /api/v1/white-label/config/:merchantId | WhiteLabelController | WhiteLabelModule | AUTH-AND-TENANT |
| 11 | GET | /api/v1/creator/gifting-panel/state | CreatorGiftingPanelController | CreatorGiftingPanelModule | AUTH-AND-TENANT |

**Totals: 3 PUBLIC + 1 AUTH-ONLY + 7 AUTH-AND-TENANT = 11 wired routes**

---

## Orphan Controllers (NOT in any module's `controllers: []`)

These controllers exist as TypeScript files but are NOT registered in the NestJS
module graph. Their routes DO NOT exist at runtime — they are dead code.

| Controller | File | Declared Route | Status |
|------------|------|----------------|--------|
| AwardingWalletController | src/controllers/awarding-wallet.controller.ts | POST /awarding-wallet/upload-csv | ORPHAN — route unreachable |
| CreatorGiftingController | src/controllers/creator-gifting.controller.ts | POST /creator-gifting/create | ORPHAN — route unreachable |

**Note:** The critical financial endpoint `POST /api/v1/merchants/awarding-wallet/upload-csv`
IS live (via `MerchantController` in `MerchantModule`). `AwardingWalletController` is a
duplicate/dead stub and does NOT intercept financial traffic.

---

## Non-NestJS "Controllers" in src/api/ (plain TypeScript classes)

These files in `src/api/` are NOT decorated with `@Controller()` and are not NestJS
controllers. They are service-layer classes that are not registered anywhere in the
module graph and serve no HTTP routes.

| File | Class | Status |
|------|-------|--------|
| src/api/events.controller.ts | EventsController | Plain class — no @Controller decorator, no runtime routes |
| src/api/ledger.controller.ts | LedgerController | Plain class — no @Controller decorator, no runtime routes |
| src/api/wallet.controller.ts | WalletController (api/) | Plain class — no @Controller decorator, no runtime routes |

---

## OpenAPI Docs Surface

SwaggerModule mounts at bare Express level, bypassing the `api/v1` global prefix.
Live paths (always reachable, no middleware):
- `GET /api/docs` — Swagger UI
- `GET /api-json` — OpenAPI JSON

These paths cannot be intercepted by NestJS middleware wired in `configure()`.
Current posture: **public** (dev-acceptable; review before production hardening).

---

## Login Route

**There is no login endpoint.** JWT tokens are issued by an external IdP.
`MemberController.signup` creates accounts; it does NOT mint tokens.
`MemberProfile` returned by signup contains no JWT field.
Documented in `src/config/route-policy.ts` for future reviewer clarity.

---

## Risk Register Items

| ID | Surface | Risk | Severity | Resolution |
|----|---------|------|----------|------------|
| RISK-001 | GET /api/docs, GET /api-json | OpenAPI spec publicly accessible | Low | Document as intentional; harden in production |
| RISK-002 | POST /api/v1/members/signup | 60/min rate limit too permissive for signup | Medium | Follow-up: 5/min per-IP limit |
