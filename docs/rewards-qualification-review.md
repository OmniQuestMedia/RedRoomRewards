# Rewards Qualification Review — Purchases → RedRoomRewards

**Status:** Review / reference. Captures the _current_ (as-built) earn
qualification path for purchases and its alignment with RRR rules, as part of
the OKIB integration work (`docs/okib-integration-plan.md`, Step 5).

**Authority:** defers to `docs/RRR_LOYALTY_ENGINE_SPEC_v1.1.md`,
`docs/RRR_CEO_DECISIONS_FINAL_2026-04-17.md`, `docs/DOMAIN_GLOSSARY.md`, and
`api/openapi.yaml`. On conflict, those win.

---

## 1. The earn path, end to end

```
RedRoomPleasures (WooCommerce order → completed)
   │  POST /earn  (HMAC-signed, X-Idempotency-Key per order)
   ▼
RRR API  ──►  PointAccrualService.calculateEarnRate()   // how many points
         ──►  PointAccrualService.awardPoints()          // credit + ledger
```

Source references:

- WP bridge & contract: `docs/integrations/redroompleasures-wordpress.md` (§4.1
  earn-on-purchase, §6 reason codes).
- Earn-rate math: `src/services/point-accrual.service.ts` → `calculateEarnRate`.
- Award + ledger: `src/services/point-accrual.service.ts` → `awardPoints`.
- Creator attribution: `src/services/affiliate.service.ts` → `resolveBonus`.

---

## 2. Qualification rules in force today

| #   | Rule                                                                                                                  | Where enforced                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | **Reason must be an earning reason** (`USER_SIGNUP_BONUS`, `REFERRAL_BONUS`, `PROMOTIONAL_AWARD`, `ADMIN_CREDIT`)     | `awardPoints` → `validateEarningReason`                          |
| 2   | **Amount bounds**: `1 ≤ amount ≤ 1,000,000`, finite, positive                                                         | `awardPoints` → `validateAmount`                                 |
| 3   | **Idempotency**: per-order `X-Idempotency-Key`; replay returns the original result, no double credit                  | `awardPoints` → `ledgerService.checkIdempotency`; WP packet §4.1 |
| 4   | **Active earn-rate config required**: `EarnRateConfig` row for tenant/merchant/tier/event or the call throws          | `calculateEarnRate`                                              |
| 5   | **Earn math**: `base_points_per_unit * inferno_multiplier * amount` (server-computed; never client-side)              | `calculateEarnRate`; WP packet §4.1                              |
| 6   | **Diamond Concierge zero-earn** (CEO Decision D3) when `diamond_concierge_zero_earn` is set                           | `calculateEarnRate`                                              |
| 7   | **Atomic credit**: optimistic-locked wallet `$inc` + immutable ledger entry; retries with backoff on version conflict | `awardPoints`                                                    |
| 8   | **Wallet auto-create** on first earn for a user                                                                       | `awardPoints`                                                    |

---

## 3. Alignment with RedRoomRewards rules

**Aligned:**

- Server-authoritative earn math and zero-earn rules match the loyalty engine
  spec and CEO D3.
- Idempotency and immutable-ledger requirements are honored on the earn path.
- Multi-tenant scoping (`tenant_id`) is threaded through award + idempotency.

**Known stop-gap (documented, not a defect):**

- For Alpha the WP plugin sends `reason_code = PROMOTIONAL_AWARD` for
  merchant-order earns (WP packet §4.1/§6), because a dedicated "merchant order
  earn" reason isn't surfaced yet. `MERCHANT_ORDER_REDEMPTION` is the _debit_
  (redeem) code. This is intentional for Alpha; a dedicated earn reason is a
  candidate for a later wave.

---

## 4. Gaps relevant to creator attribution / OKIB

1. **Creator bonus is not auto-applied on purchase.**
   `AffiliateService.resolveBonus()` computes `base + bonus` and returns the
   `affiliate_id`, but nothing in the `/earn` → `awardPoints` path calls it. A
   RedRoomPleasures purchase therefore earns the base amount only; the
   `bonus_points_pct` configured on an `AffiliateLink` is inert in the live earn
   flow.

2. **No creator resolution when the storefront lacks a `creator_id`.**
   `resolveBonus` needs `(tenantId, creatorId)`. When a purchase has no explicit
   creator attribution, there is no fallback to infer one. This is exactly the
   slot `OkibIntegrationService.getCreatorAffinity()` is scaffolded to fill
   (plan §2.3/§4).

3. **`PROMOTIONAL_AWARD` overloading** (see §3) makes attribution reporting
   harder to slice by "merchant order vs. promo." Worth a dedicated reason when
   the catalog is revisited.

### Proposed future wiring (NOT implemented in this cut)

```
/earn (order)
  → [creator_id present?] ── no ──► OkibIntegrationService.getCreatorAffinity()
        │ yes / resolved
        ▼
  AffiliateService.resolveBonus(tenantId, creatorId, basePoints)
        ▼
  awardPoints(base + bonus, reason=PROMOTIONAL_AWARD, metadata.affiliate_id)
```

Tracked as plan §6 Wave 3 and gated on glossary ratification of `OKIB`.

---

## 5. Readiness verdict

- **Base purchase earn:** ✅ production-shaped (rules 1–8 enforced, tested).
- **Creator attribution bonus on purchase:** ⚠️ **not wired** — calculator
  exists, earn path does not call it. No money is mis-awarded today (bonus is
  simply not applied); closing this is additive and tracked above.
- **OKIB dependency:** none for base earn. OKIB is required only for the
  affinity-driven creator resolution in the future wiring, and is fully gated.
