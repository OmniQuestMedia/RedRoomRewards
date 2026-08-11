# Soft Loyalty Promotions

How RedRoomRewards runs promotions that drive sales, manage points liability,
and stay non-aggressive. This is the operator-facing companion to
`src/promotions/`.

Authority: `RRR-GOV-002` (charter). CEO Decision **D1** — slot machine retired,
no re-introduction — is the reason the mechanic set is closed.

---

## What "soft" means here

Three properties, all enforced in code rather than by convention:

1. **Deterministic.** A member can work out, before acting, exactly what they
   get. No randomised outcomes, no reveal mechanics, no odds.
2. **Capped.** Every granting campaign declares a per-member cap and a total
   points budget. An uncapped multiplier is unbounded liability.
3. **Frozen once live.** A campaign's economics cannot be edited after
   activation. Members have already acted on the published terms and the points
   are already real liability.

`PromotionCampaignService.assertSoftPromotionShape` rejects anything that
violates these, on create and again on activation. It also scans campaign terms
(including free-form reward payloads) for prohibited mechanic fields — `spin`,
`wheel`, `jackpot`, `random`, `odds`, `mystery`, `countdown_pressure`, and
friends. Adding a chance-based mechanic requires editing
`PROHIBITED_MECHANIC_FIELDS` in a reviewed commit; it cannot be smuggled in
through an admin API payload.

---

## The three campaign types

The enum is closed. There is no fourth type.

| Type                  | Direction             | What it does                            |
| --------------------- | --------------------- | --------------------------------------- |
| `PURCHASE_MULTIPLIER` | Adds liability        | Bonus points on qualifying spend        |
| `PROGRESS_BONUS`      | Adds liability        | Fill a bar, earn a fixed bonus          |
| `REDEMPTION_OFFER`    | **Retires liability** | Burn points for a discount or free item |

### "Double points" is not a separate mechanism

A double-points campaign is a `PURCHASE_MULTIPLIER` with `multiplier: 2` and a
bounded window. There is deliberately no second code path: two implementations
of the same bonus is how two multipliers end up disagreeing about what a member
earned.

```jsonc
{
  "campaign_type": "PURCHASE_MULTIPLIER",
  "name": "Double Points Weekend",
  "starts_at": "2026-08-15T00:00:00Z",
  "ends_at": "2026-08-18T00:00:00Z",
  "multiplier_terms": { "multiplier": 2, "band_multipliers": null },
  "per_member_points_cap": 5000,
  "campaign_points_budget": 500000,
}
```

---

## Margin-gated multiplier uplift

Higher multipliers go only to members whose own spend history proves
net-positive contribution **after** the cost of the points already issued to
them.

A campaign declares a base multiplier available to everyone, plus an optional
uplift ladder:

```jsonc
"multiplier_terms": {
  "multiplier": 2,                                     // everyone
  "band_multipliers": { "NET_POSITIVE": 2.5, "HIGH_MARGIN": 3 }
}
```

The ladder may only step upward — `base ≤ NET_POSITIVE ≤ HIGH_MARGIN` — and a
member never receives less than the advertised base, whatever their band. Uplift
is additive and earned; it is never a penalty rate for anyone else.

### How a band is decided

`MemberContributionService` reads the member's real ledger history:

```
gross_margin_cents = attributed_spend_cents × contribution_margin_bps / 10000
points_cost_cents  = points_granted_lifetime × cents_per_point
net_contribution   = gross_margin_cents − points_cost_cents
```

| Band           | Meaning                                             | Uplift         |
| -------------- | --------------------------------------------------- | -------------- |
| `UNPROVEN`     | Not enough attributable history to compute a margin | No             |
| `NET_NEGATIVE` | Proven, but margin does not cover points cost       | No             |
| `NET_POSITIVE` | Margin covers points cost with headroom             | Yes            |
| `HIGH_MARGIN`  | Margin covers points cost ≥ 2× over                 | Yes (top rung) |

Four decisions worth knowing:

- **Points cost uses points _granted_, not outstanding.** A programme incurs
  cost when a point is issued, not when it is redeemed. Costing only outstanding
  points would make a member look more profitable for having spent their points,
  which is backwards.
- **No breakage assumption.** Letting expected forfeiture fund a real uplift is
  how loyalty programmes end up structurally short.
- **Bonus points count as cost with zero margin.** A member only reaches
  `NET_POSITIVE` if their spend covers their base points _and_ every bonus they
  have already received. Uplift compounds only where it is paying for itself.
- **Unattributed spend is unknown, not zero.** A credit with no spend metadata
  is a purchase we cannot see. When those dominate, the member is `UNPROVEN` and
  keeps the base multiplier. Evidence we do not have never earns an uplift.

Thresholds are environment-tunable: `RRR_CONTRIBUTION_MARGIN_BPS` (default 3500
= 35%), `RRR_MIN_ATTRIBUTED_PURCHASES` (3), `RRR_MIN_ATTRIBUTED_SPEND_CENTS`
(5000), `RRR_MIN_ATTRIBUTION_COVERAGE` (0.6), `RRR_HIGH_MARGIN_RATIO` (2.0).

### Making spend attributable

The profile reads `spend_cents` (also `spendCents`, `order_total_cents`, or
major-unit `spend_amount` / `order_total`) from ledger entry metadata. Earn
paths should stamp it. Spend evidence always wins over the reason code — a
credit carrying `spend_cents` is attributed even under a generic reason.

---

## GateGuard and Welfare Score gating

`PromotionEligibilityService` composes three signals and **fails closed on all
of them**. An unreachable dependency denies the promotion; it never allows
because the check was unavailable.

1. **GateGuard AV** — mandatory 18+ verification on grants _and_ burns.
2. **Welfare Guardian Score** — scored against the points actually at stake.
3. **Contribution band** — gates the uplift only, never the base offer.

Grants and burns are gated differently on purpose. A grant induces future spend;
a burn spends down points the member already holds and takes no new money.

| WGS action     | Grant (induces spend)     | Burn (retires liability)       |
| -------------- | ------------------------- | ------------------------------ |
| `PASS`         | Allowed, uplift permitted | Allowed                        |
| `REVIEW`       | Allowed at **base only**  | Allowed                        |
| `SOFT_DECLINE` | **Suppressed**            | Allowed — the healthier action |
| `HARD_DECLINE` | **Suppressed**            | **Blocked**                    |

Permitting a burn at `SOFT_DECLINE` is deliberate: a member flagged for spend
velocity is better served by redeeming points they already own than by being
locked out of the one action that costs them nothing. `HARD_DECLINE` blocks both
— at that point the account needs a human, not a promotion.

A welfare `REVIEW` caps a member at base even with proven margin. "Can we afford
it" and "should we" are independent questions, and the restrictive answer wins.

**Progress is never lost to a welfare flag.** The bar keeps filling; only the
bonus is withheld. Losing progress to a transient flag would be punitive and
unrecoverable.

---

## Ledger discipline

Every grant and burn moves through `LedgerService` — nothing in this layer
touches a wallet balance directly (charter §3.1.2). Each movement carries its
own reason code so campaign cost is separable from base programme cost:

| Reason code                  | Direction             |
| ---------------------------- | --------------------- |
| `promotion_multiplier_bonus` | Credit                |
| `promotion_progress_bonus`   | Credit                |
| `promotion_offer_redemption` | Debit                 |
| `promotion_offer_reversal`   | Credit (compensating) |

`LedgerService.creditPoints` / `deductPoints` take an optional trailing
`reasonCode` that defaults to the previous behaviour, so existing callers are
unchanged.

`promotion_offer_reversal` is excluded from `getLifetimeEarnedPoints` and from
contribution issuance — it returns a member's own points and is not an earning.

### Exactly-once, under concurrency

Grant and claim rows are inserted **before** the ledger movement, in `RESERVED`
status, against a unique `{tenant_id, idempotency_key}` index. That index — not
a prior read — is the concurrency gate: a read-then-write would let two
simultaneous requests for the same purchase both observe "not yet granted" and
both credit. The row is promoted to `GRANTED` / `CLAIMED` after the movement
lands; if the movement fails, the reservation is removed so a retry is clean.

Campaign budget is reserved with a conditional `$inc` guarded by
`$expr: points_granted_to_date + points ≤ campaign_points_budget`, so two
concurrent grants cannot jointly overshoot.

Offer inventory is reserved **before** the debit, so a member never pays for an
offer that had just run out.

---

## API surface

Member-facing (auth + tenant scope):

| Endpoint                               | Purpose                                   |
| -------------------------------------- | ----------------------------------------- |
| `GET /api/v1/promotions/progress`      | Progress-to-bonus bars                    |
| `GET /api/v1/promotions/offers`        | Live redemption offers + claims remaining |
| `POST /api/v1/promotions/offers/claim` | Burn points for a reward                  |
| `GET /api/v1/promotions/preview`       | What a purchase would earn                |
| `GET /api/v1/promotions/standing`      | The member's own contribution profile     |

Admin / machine-to-machine (auth-only, explicit `tenant_id`):

| Endpoint                                       | Purpose                              |
| ---------------------------------------------- | ------------------------------------ |
| `GET /api/v1/admin/promotions`                 | List campaigns                       |
| `POST /api/v1/admin/promotions`                | Create a campaign (opens `DRAFT`)    |
| `PUT /api/v1/admin/promotions/:id`             | Edit non-economic fields             |
| `POST /api/v1/admin/promotions/:id/status`     | Lifecycle transition                 |
| `POST /api/v1/admin/promotions/purchase-bonus` | Apply bonuses for a settled purchase |
| `GET /api/v1/admin/promotions/liability`       | Liability + contribution report      |

`GET /promotions/standing` is exposed to the member deliberately: if their
history decides their multiplier, they are entitled to see the figures the
decision used.

### Wiring a purchase

Base accrual runs first and stays the sole owner of base points. The earn path
then calls `purchase-bonus` with the base points it awarded:

```jsonc
POST /api/v1/admin/promotions/purchase-bonus
{
  "member_id": "…",
  "base_points": 100,
  "spend_cents": 10000,
  "merchant_id": "redroompleasures",
  "purchase_reference": "order-1234",
  "idempotency_key": "order-1234"
}
```

Keeping bonus separate from base accrual is what makes campaign cost measurable
after the fact.

---

## Lifecycle

```
DRAFT ──▶ ACTIVE ──▶ PAUSED ──▶ ACTIVE
  │         │          │
  └─────────┴──────────┴──────▶ ENDED   (terminal)
```

- A campaign always opens as `DRAFT` and never grants until activated.
- Activation re-runs the full shape validation, so nothing written before a
  guard tightened can slip into production.
- `PAUSED` behaves as out-of-window: no grants, no burns.
- `ENDED` is terminal. A live campaign can be **shortened** (reduces exposure)
  but never **extended** — extending re-prices budget consumption against a
  longer horizon. Open a successor instead.

---

## Reading the liability report

`GET /api/v1/admin/promotions/liability` reports per campaign and in total:

```
liability_added_cents   = bonus points granted × cents_per_point
liability_burned_cents  = points burned by offers × cents_per_point
net_liability_delta     = added − burned
attributed_margin_cents = attributed spend on granted rows × margin bps
net_contribution_cents  = attributed_margin − liability_added
```

**`attributed_spend_cents` is attributed, not incremental.** The report says
"campaigns rode on £X of spend and cost £Y of points". It does not claim the
spend would not have happened anyway — proving that needs a holdout group, which
this system does not run. Presenting attribution as incremental lift is the
single most common way a loyalty programme talks itself into a losing campaign,
which is why the field names and the summary line both say `attributed`.

Only `GRANTED` rows are counted. `RESERVED` rows represent grants that did not
complete; counting them would overstate liability by exactly the amount that
never reached a member.

---

## Tuning the programme

- Net liability climbing? Raise redemption-offer volume, or lower the base
  multiplier and let the uplift ladder carry the difference — the ladder only
  pays out where margin has already been shown.
- `uplifted_grants` near zero? Attribution coverage is probably the blocker, not
  member quality. Check that earn paths stamp `spend_cents`.
- `net_contribution_cents` negative on a campaign? Its multiplier is priced
  above the margin it rides on. Shorten it (allowed) and open a successor at a
  lower rate.
