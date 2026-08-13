# Incrementality Measurement — Scope for Ratification

**Status:** PROPOSAL — not built. Requires a CEO decision (§2) before any code.
**Correlation ID:** RRR-PROMO-INCR-001 **Prerequisite:**
`docs/SOFT_PROMOTIONS.md` (the promotions layer this measures)

---

## 1. The problem this solves

`GET /api/v1/admin/promotions/liability` reports **attributed** spend: what
campaigns rode on. It cannot report **incremental** spend: what campaigns
caused.

The difference is not academic. Suppose a double-points weekend grants 50,000
points (£500 cost at 1c/point) to members who spent £40,000 that weekend. At 35%
margin that is £14,000 of margin against £500 of points, and the campaign looks
like a 28× return. But if those members would have spent £38,000 anyway, the
campaign actually bought £2,000 of extra revenue — £700 of margin — for £500 of
points. A 1.4× return, not 28×.

Both readings come from the same data. Only a control group tells you which is
true. Without one, every campaign looks like a winner, and the programme scales
the ones that are quietly losing money.

---

## 2. The decision that needs ratification

**Measuring incrementality requires deliberately withholding promotions from a
randomly selected group of real members.** There is no way around this. A
holdout group that gets nothing is what makes the comparison meaningful.

This is a business and ethics decision, not a technical one, so it is yours:

- **Some members get a worse deal than others, by chance, for a period.** A
  holdout member sees no double-points weekend while a treated member does.
- **They are not told.** Telling them defeats the measurement — a member who
  knows they are in a control group behaves differently.
- **This is standard practice** in loyalty and retail measurement, and it is how
  every credible incrementality figure is produced. It is also, plainly,
  withholding a benefit from a customer to learn something.

**This does not conflict with CEO Decision D1.** D1 retired chance-based
_mechanics_ — a member's outcome must be deterministic given what they do. A
holdout is randomness in _assignment_, decided before the member acts and
invisible in their experience. A holdout member's outcome is still fully
deterministic: they earn base points, every time, with no reveal and no odds.
Nothing in the member-facing surface becomes a game of chance. Worth stating
explicitly in the ratification so it is not relitigated later.

### 2.1 What I recommend

**Run it, at 10% holdout, on granting campaigns only, with a hard exclusion
list.** Rationale:

- 10% is enough to detect a meaningful lift on campaign-sized populations while
  keeping the number of members who miss out small.
- **Granting campaigns only.** Never hold out a `REDEMPTION_OFFER`. Withholding
  a burn offer denies a member the chance to spend down points they already own
  — that is their property, and the offer costs the programme nothing to honour.
  Holdouts are for measuring what _we_ spend, not for restricting what _they_
  already earned.
- **Hard exclusions from the holdout pool:** any member with an active welfare
  flag (they should not be a measurement subject), and any member in their first
  30 days (a new member's first experience of the programme should not be the
  degraded one).

### 2.2 Options if you want something weaker

| Option                                                       | What you learn                                                                                                                          | Cost                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **A. Randomised holdout (recommended)**                      | True causal lift, with confidence intervals                                                                                             | 10% of members miss the promotion              |
| **B. Pre/post comparison**                                   | Directional only — confounded by seasonality, other campaigns, and the fact that campaigns run _because_ someone expected a good period | Nothing withheld                               |
| **C. Matched-cohort (compare to similar untreated members)** | Better than pre/post, still biased — the untreated are untreated for reasons that correlate with spend                                  | Nothing withheld                               |
| **D. Do nothing**                                            | Keep reporting attribution and label it honestly, as now                                                                                | Nothing withheld; campaigns tuned on intuition |

B and C are cheaper and worse. They produce a number that _looks_ like lift and
is not, which is more dangerous than no number at all — you would act on it. If
you do not want to run a holdout, my recommendation is D over B/C: keep the
honest attribution report and tune conservatively.

---

## 3. Proposed design (if Option A is ratified)

### 3.1 Assignment

- A member's holdout status is a **deterministic hash** of
  `(campaign_id, member_id, assignment_salt)`, not a coin flip at request time.
  This makes assignment stable across retries and reproducible for audit — the
  same member always lands the same way for a given campaign, and the assignment
  can be recomputed months later during a dispute.
- Assignment is computed **once, at first eligibility**, and persisted to a new
  append-only `PromotionAssignment` row. Recomputing from a hash alone would
  silently re-assign everyone if the salt or population changed mid-campaign.
- Holdout percentage lives on the campaign (`holdout_pct`, 0–50), frozen at
  activation with the rest of the economics. Changing it mid-flight invalidates
  the experiment.

Note: assignment fields live on the campaign document, **not** inside the
`multiplier_terms` / `progress_terms` / `offer_terms` blocks, because
`assertSoftPromotionShape` scans those blocks for chance-mechanic field names
and would (correctly) reject anything that reads as randomness in the member's
mechanic.

### 3.2 Behaviour

- A `HOLDOUT` member receives **no bonus** from that campaign and no
  member-facing sign that a campaign exists for them. `applyPurchaseBonus`
  returns zero bonus with `eligibilityReason: 'HOLDOUT'`.
- Progress bars still accrue for holdout members (they must, or the holdout is
  detectable and the member is permanently disadvantaged when the experiment
  ends).
- Holdout status is **per campaign**, not global — a member held out of one
  campaign is not held out of all of them.

### 3.3 Measurement

New endpoint `GET /api/v1/admin/promotions/:id/incrementality`:

```
treated_members, holdout_members
treated_spend_per_member, holdout_spend_per_member
incremental_spend_per_member  = treated − holdout
incremental_margin_cents      = incremental_spend × margin_bps
points_cost_cents             = points granted to treated members
net_incremental_contribution  = incremental_margin − points_cost
confidence_interval_95        = on the difference in means
```

Two properties the report must have, or it is worse than the attribution report
it replaces:

- **It reports the confidence interval, always.** A point estimate of "+£4 per
  member" from 40 members in each arm is noise. If the interval spans zero, the
  report must say the campaign has _not_ demonstrated lift, in those words.
- **It refuses to report at all below a minimum arm size** (proposed: 200
  members per arm). An underpowered experiment that produces a flattering number
  is exactly how a losing campaign gets scaled.

### 3.4 What it will still not tell you

Cross-campaign cannibalisation. If a double-points weekend pulls forward spend
that would have happened the following week, a within-campaign holdout will not
see it. Measuring that needs a longer post-period comparison, which I would
scope separately rather than bolt on.

---

## 4. Build estimate

| Piece                                                  | Notes                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `PromotionAssignment` model + deterministic assignment | Append-only; unique on (campaign, member)                                                    |
| `holdout_pct` on campaign + shape validation           | Frozen at activation; 0–50 range                                                             |
| Engine integration                                     | One branch in `applyPurchaseBonus` / `recordProgress`                                        |
| Incrementality service + endpoint                      | Difference-in-means + Welch's t interval                                                     |
| Tests                                                  | Assignment stability, holdout receives nothing, underpowered refusal, interval spanning zero |

FIZ-scoped: it changes who receives points. Human-Review Category.

---

## 5. What I need from you

1. **Ratify or reject the holdout** (§2). This is the blocking decision.
2. If ratified, confirm the **holdout percentage** (proposed 10%) and the
   **exclusions** (welfare-flagged members, members under 30 days).
3. Confirm **granting campaigns only** — redemption offers are never held out.
