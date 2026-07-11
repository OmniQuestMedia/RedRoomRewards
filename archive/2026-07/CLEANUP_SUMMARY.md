> **ARCHIVED 2026-07-11** — spent point-in-time report, quarantined per `docs/SOURCE_OF_TRUTH.md`. Not for current work; the live source of truth is `README.md` / the canonical docs in `docs/SOURCE_OF_TRUTH.md`. Git history preserves the original.

# RedRoomRewards — Hygiene & Cleanup Summary

**Date:** 2026-06-20 **Scope:** Focused backend hygiene pass to bring
RedRoomRewards to a clean, green baseline (parity with the recent
RedRoomPleasures cleanup). **Branch:** `claude/gifted-ramanujan-6bp7xs`

---

## Baseline (before)

The repository was already in good health. The pass started from:

| Gate           | Result                           |
| -------------- | -------------------------------- |
| `tsc --noEmit` | ✅ clean                         |
| `eslint .`     | ✅ 0 warnings                    |
| `prettier`     | ⚠️ 1 file unformatted            |
| `jest`         | ✅ 71 suites / 689 tests passing |

This was a low-debt repo, so the pass is intentionally conservative: remove only
confirmed dead/duplicate scaffolding, fix formatting, and document the remaining
intentional scaffolding for later phases. No behavior changed and no test
coverage was lost.

---

## What was cleaned

### 1. Removed byte-identical case-duplicate doc

- **Deleted `architecture.md`** — byte-for-byte identical to `ARCHITECTURE.md`
  (verified via `diff`). A case-only duplicate is a hazard on case-insensitive
  filesystems (macOS/Windows) and confuses tooling. Kept the conventional
  upper-case `ARCHITECTURE.md`.

### 2. Removed dead, unreachable controllers (redundant scaffolding)

Both were confirmed **not registered in any NestJS module**, so Nest never
instantiated them, and neither had a spec — they were unreachable dead code.

- **Deleted `src/controllers/awarding-wallet.controller.ts`** — its single
  endpoint (`POST awarding-wallet/upload-csv`) is already implemented by the
  **wired** `MerchantController` (`src/controllers/merchant.controller.ts`,
  `@Post('awarding-wallet/upload-csv')`). Pure redundant duplicate. The
  underlying `AwardingWalletService` is untouched and remains wired via
  `MerchantModule`.
- **Deleted `src/controllers/creator-gifting.controller.ts`** — superseded by
  the **wired** `CreatorGiftingPanelController` (`src/creator-gifting-panel/`).
  The underlying `CreatorGiftingService` (with its passing spec) is retained as
  a library service.

### 3. Fixed formatting

- **`docs/loyalty-compliance-review.md`** reformatted with Prettier so
  `prettier --check .` passes clean.

---

## Wiring review (`app.module.ts` and entry points)

`src/app.module.ts` was reviewed and is **clean**: every imported module
(`Member`, `Merchant`, `Burn`, `Reporting`, `WhiteLabel`, `CreatorGiftingPanel`,
`RedRoomLedger`, `Ledger`, `Wallet`, `Webhook`, `Redemption`, `Admin`,
`WooCommerce`, `Catalogue`) resolves and compiles, and the middleware chain
(signup rate-limit → general rate-limit → auth → tenant-scope) is coherent. No
broken or redundant module imports were found. Core modules called out in the
task — **rewards/burn, points/ledger, affiliates** — compile cleanly.

---

## What remains for later phases

These items are **intentional migration-prep scaffolding** (introduced in the
"loyalty hardening for post-FullHost power-build" work). They are fully tested
in isolation but not yet mounted into the running HTTP app. They were **left in
place on purpose** — removing them would delete intended functionality and
reduce coverage.

### A. Affiliates — ready, not yet exposed

- `src/services/affiliate.service.ts` + `src/db/models/affiliate-link.model.ts`
  - `affiliate.service.spec.ts` form a complete, tested unit (`registerLink` /
    `resolveBonus` / `deactivateLink`), but there is **no affiliate
    controller/module** and the service is not a provider anywhere.
- **Next phase:** add an `AffiliateModule` + controller (or inject
  `AffiliateService.resolveBonus` into the point-accrual flow) and register it
  in `app.module.ts`.

### B. Tested-but-unmounted library services

Each has a passing spec and is intended for a later wiring phase:

- `settlement.service.ts`
- `reconciliation.service.ts`
- `fraud-signal.service.ts`
- `point-expiration.service.ts`
- `chargeback-recovery.service.ts`
- `vip-dfsp-hook.service.ts`
- `cross-merchant-exchange.service.ts`
- `admin-ops.service.ts`
- `zk-oracle/zk-oracle.service.ts`

**Next phase:** decide per service whether to wire into a module + controller or
move to a clearly-labelled `lib/`/`pending/` area so "tested but not mounted" is
explicit.

### C. Standalone `src/api/` controllers

`src/api/wallet.controller.ts` and `src/api/events.controller.ts` have specs but
are not mounted in any module (only `src/api/ledger.controller.ts` is actually
used — it is delegated to by the wired `src/controllers/ledger.controller.ts`).
The `src/controllers/` directory is the active surface.

**Next phase:** confirm `src/api/wallet|events` are obsolete and remove, or
consolidate the `api/` and `controllers/` directories into one canonical layout.

### D. Stale already-merged remote branches

The following remote branches are **already merged into `origin/main`** and are
safe-to-delete housekeeping candidates (left untouched here — deleting shared
remote branches needs explicit owner sign-off):

- `claude/add-copilot-instructions-file`
- `claude/ci-quality-gate-checks`
- `claude/cleanup-linter-code-quality-pass`
- `claude/cleanup-prompts`
- `copilot/advance-to-canonical-compliance`
- `copilot/apply-mixed-language-fixes`
- `copilot/update-architecture-and-workflows`

---

## Final hygiene status (after)

| Gate                        | Result                           |
| --------------------------- | -------------------------------- |
| `tsc --noEmit`              | ✅ clean                         |
| `eslint . --max-warnings=0` | ✅ 0 warnings                    |
| `prettier --check .`        | ✅ clean                         |
| `jest`                      | ✅ 71 suites / 689 tests passing |

**Net change:** 3 files removed (1 duplicate doc, 2 dead controllers), 1 file
reformatted. No source behavior changed; no tests lost. Repository is green.
