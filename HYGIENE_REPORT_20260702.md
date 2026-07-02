# RedRoomRewards — Carry-Back Item #1: WooCommerce Earn-Rate Config Refactor

**Date:** 2026-07-02 **Branch:** `claude/rrr-woo-earnrate-config-20260702` (off
`origin/main` @ `4019092`) **Item:** Carry-back #1 🔴 — Stranger-test refactor
(APPROVED, highest priority) **Mode:** push-only, `[skip ci]` interim, verified
green LOCALLY, Kevin review-merges.

---

## 1. Sync line

| Item           | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| HEAD           | `7ae428c` (this branch)                                           |
| Default branch | `main` @ `4019092` (`Update test suite metrics in README (#412)`) |
| Branch         | `claude/rrr-woo-earnrate-config-20260702`                         |

## 2. What changed

Removed the hard-coded module constants that violated the stranger-test in
`src/integrations/woocommerce/woocommerce.service.ts`:

```
- const TENANT_ID = 'redroompleasures';
- const POINTS_PER_DOLLAR = 1;
```

Replaced with config/contract-driven resolution:

| Concern                   | Before                             | After                                                                                                                                  |
| ------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant/merchant           | hard-coded `'redroompleasures'`    | resolved from deployment env (`WOOCOMMERCE_TENANT_ID` / `WOOCOMMERCE_MERCHANT_ID`, merchant defaults to tenant)                        |
| Earn rate                 | hard-coded `POINTS_PER_DOLLAR = 1` | `base_points_per_unit × inferno_multiplier` from the tenant's active (non-superseded, newest) `EarnRateConfig`, `event_class=PURCHASE` |
| `calculatePointsForOrder` | closed over the literal            | pure fn `(orderTotal, shippingCost, pointsPerUnit)`                                                                                    |
| Missing/unconfigured      | n/a (always earned at rate 1)      | **fail-closed** — throws, issues no points (never a guessed rate)                                                                      |

Both earn (`processOrderCompleted`) and refund (`processOrderRefunded`) resolve
the rate the same way, so a reversal always matches its original earn.

Files: `woocommerce.service.ts` (+100/−19), `woocommerce.service.spec.ts`
(+194/−…), `.env.example` (+9 — documents the new vars and the seed gate).

## 3. Money-path safety (mandatory checks)

- **Unit tests on `calculatePointsForOrder`** — rate 1, non-unit rates (2, 0.5),
  zero rate, shipping ≥ total, fractional flooring.
- **Config-path tests** — resolves rate from `EarnRateConfig`; lookup is scoped
  to the configured
  `tenant_id`/`merchant_id`/`event_class`/`superseded_at:null`; non-unit base
  and inferno multiplier applied; fail-closed on no-config and on unconfigured
  tenant.
- **SAFE-SWAP** — a `redroompleasures` config at `base 1 × inferno 1` yields the
  IDENTICAL result (90 pts on the canonical 99.99/9.99 order) as the old rate-1
  constant. **No tenant's effective rate is changed by this refactor** — the
  mechanism now supports other tenants, but the numbers are untouched (a rate
  change is a business/contract decision, not code).

## 4. ⚠️ Deployment gate (ops action, before this reaches production)

The `redroompleasures` `EarnRateConfig` must be seeded (`event_class=PURCHASE`,
`base_points_per_unit=1`, `inferno_multiplier=1`) so the effective rate stays 1.
Without it, WooCommerce earning fails closed (no points issued). Seeding is a
supervised DB action and is intentionally NOT run from this branch. The seed was
left out of `scripts/seed-alpha-staging.ts` to keep the `seed-fixture-alignment`
gate and this PR diff clean; call it out for ops or authorize a follow-up seed
commit.

## 5. Verification (LOCAL — `claude/*` triggers no CI)

| Gate                                   | Result                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint . --max-warnings=0`            | PASS (0)                                                                                                                               |
| `tsc --noEmit`                         | PASS (0)                                                                                                                               |
| `npm run build`                        | PASS (0)                                                                                                                               |
| `npm test`                             | **72 suites / 711 tests pass** (was 700; +11 new WooCommerce tests)                                                                    |
| `npm run ship-gate` (SKIP_LINT, as CI) | **PASS** — charter-integrity, no-hardcoded-balance, tenant-id-scope, seed-fixture-alignment, log-secret-leak, openapi-freeze all green |
| `node scripts/validate-schema.js`      | PASS                                                                                                                                   |

## 6. Remaining carry-back items (separate branches, per guardrail)

- **#2** Wallet `tenant_id` defense-in-depth — SCHEDULED (after #1); not bundled
  here.
- **#3** member-portal lockfile — APPROVED; own branch.
- **#6** stale-branch prune (merged-into-main only) — APPROVED gated; rides with
  #3.
- **#4** dependency advisories → dependabot PRs. **#5** engines `>=22` → leave
  as-is.

=== HYGIENE RUN COMPLETE ===
