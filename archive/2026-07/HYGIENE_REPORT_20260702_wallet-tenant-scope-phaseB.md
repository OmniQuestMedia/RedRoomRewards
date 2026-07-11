> **ARCHIVED 2026-07-11** — spent point-in-time report, quarantined per `docs/SOURCE_OF_TRUTH.md`. Not for current work; the live source of truth is `README.md` / the canonical docs in `docs/SOURCE_OF_TRUTH.md`. Git history preserves the original.

# RedRoomRewards — Carry-Back #2 Phase B: tenant-scope the money-store queries

**Date:** 2026-07-02 **Branch:**
`claude/rrr-wallet-tenant-scope-phaseB-20260702` (off `origin/main`) **Item:**
Carry-back #2 Phase B — thread `tenant_id` (program `oqmi`) through the
money-store queries. **Mode:** push-only, `[skip ci]` interim, verified green
LOCALLY, Kevin review-merges.

---

## What Phase B does

Scopes every **wallet / model_wallet** money-store query by `tenant_id` (the
program isolation boundary) and stamps `tenant_id` on every create, closing 26
of the 46 `tenant-id-allowlist.json` exemptions. Safe pre-Beta: single program
(`oqmi`), no populated DB to break, and **no balance math changed**.

### Tenant source

New `src/config/program-tenant.ts`:

- `getProgramTenantId()` — reads `RRR_PROGRAM_TENANT_ID`, falling back to the
  canonical default `oqmi`. Single config source; no scattered literals.
- `resolveTenantId(explicit?)` — prefers a request-context tenant when the
  caller has one, else the program tenant.

Usage: services that already carry a tenant use it (`point-accrual` →
`resolveTenantId(request.tenantId)`; settle/refund/partial →
`resolveTenantId(escrow.tenant_id)`); tenant-less flows use
`getProgramTenantId()`.

### Scoped call sites (26)

| File                                       | Queries scoped                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `src/wallets/wallet.service.ts`            | all WalletModel + ModelWalletModel finds/updates + creates (hold/settle/refund/partial/getBalance) |
| `src/services/point-accrual.service.ts`    | award + deduct wallet find/update + create                                                         |
| `src/services/point-expiration.service.ts` | wallet find/update + `getAllUserIds` `find({})`                                                    |
| `src/services/admin-ops.service.ts`        | manual-adjustment wallet find/update                                                               |
| `src/ledger/ledger.service.ts`             | `creditPoints` upsert (+`$setOnInsert` tenant_id) / `deductPoints` decrement + diagnostic read     |

### Deliberately NOT scoped (kept in the allowlist — legitimate exemptions)

- **EscrowItemModel queries keyed by `escrowId`** (a UUID) — scoping is
  redundant on a globally-unique key, and the escrow's tenant is only known
  _after_ fetching it. Escrow **creates** still stamp `tenant_id`.
- `LedgerEntryModel` by `idempotencyKey`, `BurnRedemptionModel` by
  `redemption_id` — globally-unique keys.
- `BurnCatalogueItemModel` — already tenant-scoped via a query variable the
  regex checker can't follow.
- `IdempotencyRecordModel`; a JSDoc transaction _example_ line.

The allowlist was regenerated (`--update-baseline`) so line numbers are correct
after the edits, and its `_comment` now documents each exemption class.

## Verification (LOCAL)

| Gate                              | Result                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`                    | PASS (0)                                                                                                                   |
| `eslint . --max-warnings=0`       | PASS (0)                                                                                                                   |
| `npm run build`                   | PASS (0)                                                                                                                   |
| `npm test`                        | **73 suites / 717 tests pass** (+6: program-tenant helper; ledger credit/deduct assertions updated to include `tenant_id`) |
| `npm run ship-gate`               | **PASS** — `tenant-id-scope` OK (20 known exemptions, **0 new violations**), `no-hardcoded-balance` clean                  |
| `node scripts/validate-schema.js` | PASS                                                                                                                       |

No balance-math change anywhere; the diff only adds `tenant_id` to
filters/creates + the config helper.

## Sequencing

- Depends on Phase A (`tenant_id` field, merged) and the `oqmi` realign
  (merged).
- **Phase C stays HELD** until the Phase A backfill runs against a real DB
  (Beta): composite-unique `{tenant_id,userId}` / `{tenant_id,modelId}`,
  `tenant_id` required, and cross-tenant isolation tests (same userId under two
  program tenants → two wallets). Merging C before backfill would break
  un-backfilled (null-tenant) rows.

=== HYGIENE RUN COMPLETE ===
