# `seed:alpha-staging` — Spec + Operator Notes

**Audience:** whoever runs the Alpha test pack against staging.

**Purpose:** restore the named test fixtures from `docs/ALPHA_TEST_PACK.md` §3 to a known-good state, so the test pack runs deterministically.

**Status:** skeleton implementation in `scripts/seed-alpha-staging.ts`. Becomes "Alpha-ready" once it's run successfully against staging at least once.

---

## 1. What it does

The script idempotently upserts:

- 3 tenants — `redroompleasures`, `cyrano`, `oqmi` (all phase 1, status `active`).
- 4 member wallets — GOLD / PLATINUM / Diamond Concierge / zero-balance.
- 1 model wallet — starting allocation 2,500 points.

Re-runs are safe. If a previous test mutated a fixture, the next run restores the canonical starting state. No fixture is ever destructively recreated; the script uses `findOne` + `create` / `updateOne` patterns and increments the optimistic-lock `version` on resets.

---

## 2. What it deliberately does NOT do

- **Create Keycloak users.** Operator wallets and member wallets in RRR's DB don't require corresponding Keycloak users for Alpha — the API surface accepts user IDs directly when called via HMAC service-to-service. When a user-bound JWT flow is added, that's a separate bootstrap step against Keycloak (see `docs/KEYCLOAK_REALM_SPEC.md` §12).
- **Seed PointLots, LedgerEntries, or Escrows.** Those are produced by the test pack's earn/redeem/escrow operations themselves; pre-seeding them would invalidate ledger invariants.
- **Seed `EarnRateConfig`, `TierCapConfig`, or `MerchantPairConfig`.** Those are merchant-configurable runtime configs and live on a different lifecycle. A separate provisioning script handles them post-Alpha (out of scope here).
- **Seed Phase-1 merchant API keys.** Issued via the OQMI Operator console (or its CLI equivalent) per `docs/OPERATIONAL_RUNBOOK.md` §5.1. Not part of fixture seeding.
- **Touch production data.** Ever. See §4 below.

---

## 3. Running it

### 3.1 Prerequisites

- `MONGODB_URI` env var pointed at the staging Atlas cluster.
- `NODE_ENV` set to anything **except** `production` (refuses otherwise).
- `ts-node` available (it's a devDependency; `npm install` covers it).

### 3.2 Plan-only (dry-run) first

Always dry-run first when running against an unfamiliar cluster:

```bash
npm run seed:alpha-staging -- --dry-run
```

The script prints what it would do without writing. If anything in the dry-run output looks unfamiliar, **stop** — you may be pointed at the wrong cluster.

### 3.3 Apply

```bash
npm run seed:alpha-staging
```

Output is one line per fixture, ending with a totals line:

```
seed-alpha-staging: done. created=8 updated=0 unchanged=0
```

On a re-run after a clean test pack, expect `unchanged=8`.

---

## 4. Production safety

The script refuses to run in three ways:

1. **`NODE_ENV=production`** → hard refusal, no writes.
2. **`MONGODB_URI` host contains `prod`, `production`, or `live`** → hard refusal. Tunable via `SEED_PROD_HOST_DENYLIST` env var (comma-separated needle list) if your hostnames legitimately contain one of those substrings.
3. **No destructive operations.** Even if guards are bypassed, the script never `deleteOne`s, never drops collections, never zeroes a real balance. The most aggressive action it takes is a `$set` of `availableBalance` on a record matching a `test-` prefixed userId.

The `test-` prefix on every fixture ID is a separate guard: production data filters in reporting and analytics can exclude `test-*` records cleanly without per-fixture allowlisting.

---

## 5. Maintenance

If `docs/ALPHA_TEST_PACK.md` §3 changes (a fixture added, removed, or its starting state edited):

1. Update the fixture lists at the top of `scripts/seed-alpha-staging.ts` (`TENANTS`, `MEMBER_WALLETS`, `MODEL_WALLETS`).
2. Update this doc and the test pack §3 in lock-step.
3. Run dry-run against staging; verify the diff is what you expect.
4. Commit all three (script + this doc + test pack) in one PR.

Drift between the test pack and this script is the most likely failure mode. The CI doesn't currently enforce alignment — that's a v2 hardening item (a check that compares the fixture lists in both files and fails on divergence).

---

## 6. What this script is **not** the right tool for

- **Migrating real data.** Use `infra/migrations/` for that.
- **Resetting a single fixture.** This script restores all of them. If you only want to reset one wallet, do it via `POST /admin/adjustments` with an explicit reason code and the operator audit trail intact.
- **Bootstrapping a new merchant tenant.** Provisioning a real merchant requires more than a tenant row (API keys, EarnRateConfig, TierCapConfig, webhook URL, etc.). That's an OQMI Operator workflow, not a seed script.

---

## 7. Open follow-ups (v2)

- **CI alignment check** — assert this script's fixture list matches `ALPHA_TEST_PACK.md` §3 exactly.
- **Tear-down script** — `scripts/teardown-alpha-staging.ts` to remove every `test-*` fixture and its associated PointLots / LedgerEntries / Escrows. Useful after a destructive test run.
- **Fixture archive** — snapshot fixture state before a test run so post-run forensics has a known baseline.
- **Multi-environment support** — currently single-cluster. Production tear-up would need an explicit, separate bootstrap script (which this never becomes — production fixtures are real data).

---

_Updates require a CHORE: commit. Keep this doc and the script in lock-step with `docs/ALPHA_TEST_PACK.md` §3._
