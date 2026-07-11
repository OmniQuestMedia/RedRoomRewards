> **ARCHIVED 2026-07-11** — spent point-in-time report, quarantined per `docs/SOURCE_OF_TRUTH.md`. Not for current work; the live source of truth is `README.md` / the canonical docs in `docs/SOURCE_OF_TRUTH.md`. Git history preserves the original.

# RedRoomRewards — Carry-Back #2 Phase C: enforce tenant isolation

**Date:** 2026-07-02 **Branch:** `claude/rrr-wallet-tenant-phaseC-20260702` (off
`origin/main`) **Item:** Carry-back #2 Phase C — composite-unique + required
`tenant_id` + cross-tenant isolation tests. **Mode:** push-only, `[skip ci]`
interim, verified green LOCALLY, Kevin review-merges.

---

## What Phase C does (the enforcing/contract step)

| Model                   | Change                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `wallet.model.ts`       | `tenant_id` **required**; replace global `unique {userId}` → **`unique {tenant_id, userId}`** |
| `model-wallet.model.ts` | `tenant_id` **required**; replace `unique {modelId}` → **`unique {tenant_id, modelId}`**      |
| `escrow-item.model.ts`  | `tenant_id` **required** (escrowId stays the unique key)                                      |

Consequence: the **same `userId` may exist under two different program tenants →
two wallets** (external-merchant case); OmniQuest members remain one balance
because they share the one `oqmi` program tenant. No balance math changed.

### Create sites completed (required `tenant_id`)

Phase B stamped the wallet/model/escrow creates in `wallet.service` /
`point-accrual`. Phase C covers the remaining two paths so nothing can insert a
null-tenant row:

- `src/redemption/redemption.service.ts` — stamp `tenant_id` on the escrow
  create **and** scope its three `WalletModel` queries by
  `resolveTenantId(request.tenantId)` (redemption carries the tenant;
  `src/redemption` isn't covered by the scope-guard, so this was done for
  isolation correctness).
- `scripts/seed-alpha-staging.ts` — member/model wallet fixtures now stamp
  `tenant_id` (program tenant).

### Cross-tenant isolation tests

`src/db/models/__tests__/wallet-tenant-isolation.spec.ts` (8 tests) asserts the
mechanism directly (no live DB needed): the composite `{tenant_id,userId}` /
`{tenant_id,modelId}` indexes are unique, there is **no** standalone unique
`{userId}`/`{modelId}`, `tenant_id` is required on all three models, and the
resolver scopes the same userId to different keys per tenant.

## ⚠️ Deployment ordering (critical)

Phase C makes `tenant_id` **required + unique-composite**. This is safe to merge
now because the DB is empty pre-Beta and every write path stamps `tenant_id`.
**Before any real/legacy data exists (Beta), the Phase A backfill MUST run** or
un-backfilled (null-tenant) rows would violate the new constraints. Run it
(item 1) then deploy Phase C:

```powershell
# no clone needed if you run it where the app/env lives; needs MONGODB_URI + RRR_PROGRAM_TENANT_ID
$env:RRR_PROGRAM_TENANT_ID = 'oqmi'
npm run migrate:wallet-tenant-id -- --dry-run   # counts only
npm run migrate:wallet-tenant-id                # apply
```

Also note: MongoDB does not auto-drop the old `unique {userId}` / `{modelId}`
indexes on an existing collection — on a pre-populated DB, drop them as part of
the Beta migration (a fresh DB just builds the new composite indexes).

## Verification (LOCAL)

| Gate                              | Result                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `tsc --noEmit`                    | PASS (0)                                                                           |
| `eslint . --max-warnings=0`       | PASS (0)                                                                           |
| `npm run build`                   | PASS (0)                                                                           |
| `npm test`                        | **74 suites / 725 tests pass** (+8 isolation)                                      |
| `npm run ship-gate`               | **PASS** — tenant-id-scope, no-hardcoded-balance, seed-fixture-alignment all green |
| `node scripts/validate-schema.js` | PASS                                                                               |

## Sequence status

- #2 Phase A (field + backfill), realign (`oqmi`), Phase B (scoping) — all
  merged.
- **Phase C — this PR** (enforcement). With C merged, #2 is code-complete; the
  only remaining runtime step is running the Phase A backfill at Beta (item 1,
  ops).

=== HYGIENE RUN COMPLETE ===
