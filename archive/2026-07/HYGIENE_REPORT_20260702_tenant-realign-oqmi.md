> **ARCHIVED 2026-07-11** — spent point-in-time report, quarantined per `docs/SOURCE_OF_TRUTH.md`. Not for current work; the live source of truth is `README.md` / the canonical docs in `docs/SOURCE_OF_TRUTH.md`. Git history preserves the original.

# RedRoomRewards — Tenant Realign: `oqmi` program + merchants

**Date:** 2026-07-02 **Branch:** `claude/rrr-tenant-realign-oqmi-20260702` (off
`origin/main`) **Item:** Carry-back #2 prerequisite — realign the
tenant/merchant mislabel per CEO ruling. **Mode:** push-only, `[skip ci]`
interim, verified green LOCALLY, Kevin review-merges.

---

## Ruling applied

`RRR_PROGRAM_TENANT_ID = 'oqmi'` — the unified OmniQuest RedRoomRewards
**program** tenant (the isolation boundary). The sites are **merchants**
(`merchant_id`) within it, **not** tenants. RedRoomPleasures →
`merchant_id='redroompleasures'` under `tenant_id='oqmi'`.

## Changes

- **`scripts/seed-alpha-staging.ts`** — RedRoomPleasures is now seeded as a
  **merchant** under the `oqmi` program tenant (via `MerchantModel`), not as a
  standalone tenant. Added optional `merchant_id`/`merchant_tier` to the seed
  fixture shape and an idempotent `upsertMerchant` (defaults tier `MEMBER`,
  currency `points`); the seed now processes program tenants first, then
  merchants. `cyrano` and the `oqmi` program tenant are unchanged (Cyrano was
  not named in the ruling and is left as-is).
- **`.env.example`** —
  - `RRR_PROGRAM_TENANT_ID=oqmi` (was empty).
  - WooCommerce config split realigned: `WOOCOMMERCE_TENANT_ID=oqmi`,
    `WOOCOMMERCE_MERCHANT_ID=redroompleasures` (the #1 code is config-driven and
    unaffected — only the tenant/merchant split in the example data changes).
    Comment updated to state the `EarnRateConfig` key is now
    `tenant_id=oqmi, merchant_id=redroompleasures`.

## Item-by-item (from the ruling)

1. `seed-alpha-staging.ts:51` → RedRoomPleasures as merchant under `oqmi`. ✅
   done.
2. EarnRateConfig seed/data rows keyed `tenant_id='redroompleasures'` →
   `oqmi`/`redroompleasures`. **No such rows exist** in the repo (no
   EarnRateConfig seed) — nothing to change. Ops must seed the live row as
   `tenant_id=oqmi, merchant_id=redroompleasures` (noted for the #1 deployment
   gate).
3. `RRR_PROGRAM_TENANT_ID=oqmi` in `.env.example` (+ config comments). ✅ done.

## Not touched (flagged, not in scope)

- Unit-test fixture strings using `tenant_id='redroompleasures'` (e.g.
  `burn-catalogue.service.spec.ts`, `okib`/`woocommerce` specs) are
  self-contained test identifiers, not production labeling — left as-is.
- The README "Tenants & Integrations" table still lists the sites as tenants;
  that's descriptive doc drift, not config — flagged as a small follow-up rather
  than churned into this PR.

## Verification (LOCAL)

| Gate                        | Result                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `eslint . --max-warnings=0` | PASS (0)                                                                |
| `tsc --noEmit`              | PASS (0)                                                                |
| seed script                 | compiles under ts-node (type-checked); guard fires with no DB touched   |
| `npm test`                  | **72 suites / 711 tests pass** (unchanged)                              |
| `npm run ship-gate`         | **PASS** — incl. `seed-fixture-alignment` (8 test-pack IDs, 5 seed IDs) |

## Backfill reminder (deferred to Beta, Kevin's box)

`RRR_PROGRAM_TENANT_ID=oqmi npm run migrate:wallet-tenant-id -- --dry-run` then
without `--dry-run`. Pre-Beta there is no DB / ~no rows → effectively a no-op.
Phase C (enforcement) stays HELD until the backfill has run against a real DB.

=== HYGIENE RUN COMPLETE ===
