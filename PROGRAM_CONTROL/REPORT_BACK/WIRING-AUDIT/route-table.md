# Route Table (Static Analysis)

**Source:** Static parsing of `@Controller()` and `@Get/@Post/@Put/@Patch/@Delete` decorators.
**Limitation:** Runtime OpenAPI endpoint unavailable; this table may over-report routes from controllers not wired into modules.
**Global Prefix:** `api/v1` (per `src/main.ts:11`, with `health` excluded)

## Routes

| Method | Path | Controller Class | Controller File | In Module Graph | Source |
|--------|------|------------------|-----------------|-----------------|--------|
| GET | /health | HealthController | src/health/health.controller.ts | YES (AppModule) | static |
| POST | /api/v1/members/signup | MemberController | src/controllers/member.controller.ts | YES (MemberModule) | static |
| POST | /api/v1/merchants/awarding-wallet/upload-csv | MerchantController | src/controllers/merchant.controller.ts | YES (MerchantModule) | static |
| POST | /api/v1/burn/redeem | BurnController | src/controllers/burn.controller.ts | YES (BurnModule) | static |
| GET | /api/v1/reports/liability | ReportingController | src/controllers/reporting.controller.ts | YES (ReportingModule) | static |
| POST | /api/v1/white-label/config | WhiteLabelController | src/controllers/white-label.controller.ts | YES (WhiteLabelModule) | static |
| GET | /api/v1/white-label/config/:merchantId | WhiteLabelController | src/controllers/white-label.controller.ts | YES (WhiteLabelModule) | static |
| GET | /api/v1/creator/gifting-panel/state | CreatorGiftingPanelController | src/controllers/creator-gifting-panel.controller.ts | YES (CreatorGiftingPanelModule) | static |
| POST | /api/v1/wallet/credit | WalletController | src/controllers/wallet.controller.ts | YES (WalletModule) | static |
| POST | /api/v1/wallet/deduct | WalletController | src/controllers/wallet.controller.ts | YES (WalletModule) | static |
| POST | /api/v1/webhooks/receive | WebhookReceiveController | src/webhooks/webhook-receive.controller.ts | YES (WebhookModule) | static |
| POST | /api/v1/awarding-wallet/upload-csv | AwardingWalletController | src/controllers/awarding-wallet.controller.ts | **NO** (not in any module) | static |
| POST | /api/v1/creator-gifting/create | CreatorGiftingController | src/controllers/creator-gifting.controller.ts | **NO** (not in any module) | static |

## Controllers Not in Module Graph

The following controllers exist but are **NOT** declared in any module's `controllers: [...]` array:

1. **AwardingWalletController** (`src/controllers/awarding-wallet.controller.ts`)
   Route: `POST /api/v1/awarding-wallet/upload-csv`
   **Status:** Orphan — will not serve traffic at runtime

2. **CreatorGiftingController** (`src/controllers/creator-gifting.controller.ts`)
   Route: `POST /api/v1/creator-gifting/create`
   **Status:** Orphan — will not serve traffic at runtime

## Verification Method

Static parsing only. The app was started briefly and responded to `/health` confirming boot succeeded, but OpenAPI JSON endpoint was not available at `/api-json` or `/api/docs-json`.

## Actual Runtime Routes (Confirmed via curl)

- `GET /health` → 200 OK
- `GET /api/docs` → 200 OK (Swagger HTML UI served)

All other routes not tested at runtime.
