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

- **CI alignment check** — assert this script's fixture list matches `ALPHA_TEST_PACK.md` §3 exactly. **Implemented** as `scripts/ci/seed-fixture-alignment-check.js`; see §8.
- **Tear-down script** — `scripts/teardown-alpha-staging.ts` to remove every `test-*` fixture and its associated PointLots / LedgerEntries / Escrows. **Implemented**; see §8 below.
- **Fixture archive** — snapshot fixture state before a test run so post-run forensics has a known baseline.
- **Multi-environment support** — currently single-cluster. Production tear-up would need an explicit, separate bootstrap script (which this never becomes — production fixtures are real data).

---

## 8. Tear-down: `npm run teardown:alpha-staging`

Counterpart to seed. Removes the test fixtures and their derived records so a subsequent `seed:alpha-staging` starts from truly empty.

### 8.1 What it removes

- `Wallet` records where `userId` starts with `test-member-` or `test-operator-`.
- `ModelWallet` records where `modelId` starts with `test-model-`.
- `EscrowItem` records linked to any of those `userId` / `modelId` values.
- `PointLot` records linked to any of those `userId`s (via `wallet_id`).

### 8.2 What it does NOT remove (and why)

- **`LedgerEntry` records — never.** The append-only ledger invariant (`docs/OPERATIONAL_RUNBOOK.md` §0: *"Never UPDATE or DELETE a LedgerEntry row"*) is stated unconditionally and applies in staging too. An earlier draft of this script exposed an `--include-ledger` flag; that flag has been removed. Attempting to pass it produces an error. If staging accumulates too many ledger entries to be tolerable, see §8.4 (full DB drop).
- `LedgerEntry` records linked — **only when `--include-ledger` is passed**. The default is to leave the ledger intact, since the ledger is append-only as a system invariant. Even on staging, removing ledger entries should be a deliberate action.

### 8.2 What it does NOT remove

- **`Tenant` records.** Tenants are seeded for the lifetime of the staging environment. If a tenant row needs to come out, do it manually with a documented justification.
- **Anything whose key doesn't match the `test-` prefix allowlist.** This is the primary safety; the script will never touch a real (non-test-prefixed) record even if something else in the data has gone wrong.

### 8.3 Running it

Always dry-run first:

```bash
npm run teardown:alpha-staging -- --dry-run
```

Output is one line per collection with `matched=N` and a `dry` / `deleted` indicator. Inspect it before applying.

To apply:
To apply (preserving ledger):

```bash
npm run teardown:alpha-staging
```

### 8.4 Full staging-DB reset (only when needed)

If a destructive test polluted the staging ledger with so many `test-*` entries that they're operationally distracting, the correct procedure is **not** to add a flag to this script. It is to drop the staging database entirely and re-seed:

```bash
# 1. Confirm you're on staging (NEVER do this in production):
echo "$MONGODB_URI"   # expect a staging URI; abort if it contains prod/production/live

# 2. Drop the database:
mongosh "$MONGODB_URI" --eval 'db.dropDatabase()'

# 3. Re-run schema migrations:
#    (per your migration tooling — out of scope for this doc)

# 4. Re-seed:
npm run seed:alpha-staging
```

This is intentionally a manual procedure rather than a flag on the teardown script — the friction is the safety. A drop-database step that requires the operator to read the URI out loud and run `mongosh` is exactly the level of deliberateness this should require.

### 8.5 Production safety
To apply (including ledger — only on staging, only when you've decided you want a full reset):

```bash
npm run teardown:alpha-staging -- --include-ledger
```

### 8.4 Production safety

Same three layers as the seed script:

1. **`NODE_ENV=production`** → hard refusal.
2. **`MONGODB_URI` host denylist** (`prod` / `production` / `live`, tunable via `SEED_PROD_HOST_DENYLIST`).
3. **Prefix-anchored deletion.** Filters use `^(test-member-|test-operator-|test-model-)` regexes anchored to start-of-string. A record whose ID merely *contains* `test-` somewhere will not match.

### 8.6 Suggested workflow
### 8.5 Suggested workflow

Between full test-pack runs, when fixtures are clean:

```bash
npm run teardown:alpha-staging   # clears wallets, model wallets, escrows, lots; preserves tenants and ledger
npm run seed:alpha-staging       # restores known-good starting state
```

npm run teardown:alpha-staging   # clears wallets, escrows, lots; preserves tenants and ledger
npm run seed:alpha-staging       # restores known-good starting state
```

After a destructive test that left ledger entries you want to drop:

```bash
npm run teardown:alpha-staging -- --include-ledger
npm run seed:alpha-staging
```

---

_Updates require a CHORE: commit. Keep this doc, the seed script, and the tear-down script in lock-step with `docs/ALPHA_TEST_PACK.md` §3._
