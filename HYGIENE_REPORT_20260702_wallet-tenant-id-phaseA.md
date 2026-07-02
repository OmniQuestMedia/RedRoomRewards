# RedRoomRewards — Carry-Back #2 Work-Order: Wallet `tenant_id` (Phase A)

**Date:** 2026-07-02 **Branch:**
`claude/rrr-wallet-tenant-id-workorder-20260702` (off `origin/main` @ `090dbe3`)
**Item:** Carry-back #2 🟡 — wallet/escrow tenant isolation, defense-in-depth
(APPROVED, gated). **Mode:** push-only, `[skip ci]` interim, verified green
LOCALLY, Kevin review-merges.

---

## Tenant model (per CEO ruling)

Two levels already in the schema: **`tenant_id` = loyalty PROGRAM / SaaS client
= the isolation boundary**; **`merchant_id` = an earning site within a program**
(lives on ledger / EarnRateConfig). OmniQuest's four sites (ChatNow, Synthi,
RedRoomPleasures, RedRoomRewards.com) are **merchants within ONE OmniQuest
program tenant** — unified balance across sites, NOT separate tenants. → Wallets
scope by **`tenant_id` only** (never `merchant_id`);
`unique {tenant_id, userId}` does not fragment balances.

## 3-phase expand/contract plan

| Phase           | Scope                                                                                                                                                       | Safe to merge before backfill? |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **A (this PR)** | add optional `tenant_id` + non-unique index to `wallet`/`model_wallet`/`escrow_item`; config-driven backfill script. No query/behaviour change.             | ✅ yes (optional field)        |
| **B**           | thread `tenant_id` through the 41 call sites + add `tenant_id` filter to each; delete the matching `tenant-id-allowlist.json` entries (the progress meter). | ❌ only AFTER backfill has run |
| **C**           | `unique {tenant_id, userId}` / `{tenant_id, modelId}`; make `tenant_id` required; cross-tenant isolation tests.                                             | ❌ only AFTER backfill + B     |

**B and C are intentionally NOT in this PR** — they are unsafe to merge until
the Phase A backfill has actually run in each environment (they assume
`tenant_id` is populated). They land as separate PRs once you confirm the
backfill is done.

## Phase A — what changed (this PR)

- `src/db/models/wallet.model.ts`, `model-wallet.model.ts`,
  `escrow-item.model.ts`: added optional `tenant_id?: string` (mirrors the
  ledger's existing optional `tenant_id`) + a **non-unique** program-scoped
  index (`{tenant_id, userId}` / `{tenant_id, modelId}` /
  `{tenant_id, userId, status}`). Existing `unique {userId}` / `{modelId}` and
  `escrowId` keys are untouched (Phase C changes those).
- `scripts/migrations/2026-07-02-backfill-wallet-tenant-id.ts` +
  `npm run migrate:wallet-tenant-id`: idempotent backfill; reads the program
  tenant from **config** (`RRR_PROGRAM_TENANT_ID`, no literal — same discipline
  as the #1 refactor); `--dry-run` and `--unset` (rollback) supported; refuses
  to run without `MONGODB_URI` and `RRR_PROGRAM_TENANT_ID`. Reads/writes **no
  balance field**.
- `.env.example`: documents `RRR_PROGRAM_TENANT_ID` (no default).

## ⚠️ Phase A backfill — YOUR box (needs a DB; NOT run in-session)

No DB exists in this session, so the backfill was not executed. Run it after
this PR merges, dev/staging first (per `infra/migrations/README.md`):

```bash
# 1. dry-run (counts only, no writes)
RRR_PROGRAM_TENANT_ID=<omniquest-program-tenant> MONGODB_URI=<uri> \
  npm run migrate:wallet-tenant-id -- --dry-run
# 2. apply
RRR_PROGRAM_TENANT_ID=<omniquest-program-tenant> MONGODB_URI=<uri> \
  npm run migrate:wallet-tenant-id
# rollback if needed (removes tenant_id from docs carrying the program tenant)
RRR_PROGRAM_TENANT_ID=<omniquest-program-tenant> MONGODB_URI=<uri> \
  npm run migrate:wallet-tenant-id -- --unset
```

**Decision you still owe before running:** the value of `RRR_PROGRAM_TENANT_ID`.
It must equal the `tenant_id` the OmniQuest `EarnRateConfig` rows already use.
⚠️ Note the tension: existing `LoyaltyAccount` rows and the merged #1
(`WOOCOMMERCE_TENANT_ID=redroompleasures`) currently use
`tenant_id='redroompleasures'` — i.e. a merchant name is being used as the
program tenant today. If the intended program tenant is a distinct id (e.g.
`oqmi`, seeded in `seed-alpha-staging.ts`), the existing accounts/ledger and
#1's env need to align to the same value, or wallets will be scoped to a
different tenant than accounts. Confirm the canonical program `tenant_id` before
backfilling; the script stays config-driven so the choice is yours, not baked
into code.

## Verification (LOCAL — pre-Beta, no DB)

| Gate                        | Result                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `tsc --noEmit`              | PASS (0)                                                                            |
| `eslint . --max-warnings=0` | PASS (0)                                                                            |
| migration script            | compiles under ts-node; guard fires (`MONGODB_URI required`) with **no DB touched** |
| `npm test`                  | **72 suites / 711 tests pass** — unchanged (optional field, no behaviour change)    |
| `npm run ship-gate`         | **PASS** — incl. `tenant-id-scope` (0 new violations) and `no-hardcoded-balance`    |

Note: because `tenant_id` is optional and no query was changed, the allowlist
count is unchanged — Phase B is where those 41 entries get removed as each query
is scoped.

=== HYGIENE RUN COMPLETE ===
