# Module Graph (Runtime)

Transitive walk of all modules imported from `AppModule` at runtime.

## Root: AppModule (`src/app.module.ts`)

**Imports:**
- `ConfigModule` (NestJS framework — global)
- `MemberModule`
- `MerchantModule`
- `BurnModule`
- `ReportingModule`
- `WhiteLabelModule`
- `CreatorGiftingPanelModule`
- `RedRoomLedgerModule`
- `WalletModule`
- `WebhookModule`

**Controllers:**
- `HealthController`

**Providers:** none

**Middleware `configure()` method:** NOT PRESENT

---

## MemberModule (`src/member/member.module.ts`)

**Imports:** none

**Controllers:**
- `MemberController`

**Providers:**
- `MemberService`
- `GateGuardAVService`
- `RedRoomLedgerService`
- `TierEngineService`
- `WelfareGuardianScoreService`
- `LedgerService` (factory)

**Middleware `configure()` method:** NOT PRESENT

---

## MerchantModule (`src/merchant/merchant.module.ts`)

**Imports:** none

**Controllers:**
- `MerchantController`

**Providers:**
- `AwardingWalletService`
- `LedgerService` (factory)

**Middleware `configure()` method:** NOT PRESENT

---

## BurnModule (`src/burn/burn.module.ts`)

**Imports:** none

**Controllers:**
- `BurnController`

**Providers:**
- `BurnCatalogService`
- `RedRoomLedgerService`
- `GateGuardAVService`
- `WelfareGuardianScoreService`
- `LedgerService` (factory)

**Middleware `configure()` method:** NOT PRESENT

---

## ReportingModule (`src/reporting/reporting.module.ts`)

**Imports:** none

**Controllers:**
- `ReportingController`

**Providers:**
- `ReportingService`

**Middleware `configure()` method:** NOT PRESENT

---

## WhiteLabelModule (`src/white-label/white-label.module.ts`)

**Imports:** none

**Controllers:**
- `WhiteLabelController`

**Providers:**
- `WhiteLabelService`

**Middleware `configure()` method:** NOT PRESENT

---

## CreatorGiftingPanelModule (`src/creator-gifting-panel/creator-gifting-panel.module.ts`)

**Imports:** none

**Controllers:**
- `CreatorGiftingPanelController`

**Providers:**
- `CreatorGiftingPanelService`

**Middleware `configure()` method:** NOT PRESENT

---

## RedRoomLedgerModule (`src/redroom-ledger/redroom-ledger.module.ts`)

**Imports:** none

**Controllers:** none

**Providers:**
- `RedRoomLedgerService`
- `GateGuardAVService`
- `WelfareGuardianScoreService`
- `LedgerService` (factory)

**Exports:**
- `RedRoomLedgerService`

**Middleware `configure()` method:** NOT PRESENT

---

## WalletModule (`src/wallets/wallet.module.ts`)

**Imports:** none

**Controllers:**
- `WalletController`

**Providers:**
- `LedgerService` (factory)

**Middleware `configure()` method:** NOT PRESENT

---

## WebhookModule (`src/webhooks/webhook.module.ts`)

**Imports:** none

**Controllers:**
- `WebhookReceiveController`

**Providers:**
- `WebhookReceiveService`
- `WebhookEmitService`
- `IdempotencyService` (factory)

**Middleware `configure()` method:** NOT PRESENT

---

## Summary

**Total modules in runtime graph:** 10 (including AppModule and ConfigModule)
**Total controllers loaded:** 10
**Modules with middleware configuration:** 0
**Modules with guards:** 0
