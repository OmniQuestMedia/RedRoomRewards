# Proposal — Opt-In Standing Accrual (RedRoomRewards)

**Status:** DRAFT PROPOSAL — for CEO review. **Not implemented.** No code in
this PR. **Author:** Codebase-audit / launch-readiness pass. **Unblocks:** FLAG
**F-042** / charter task **C-010 `TierEvaluationService`**. **Naming
authority:** `docs/DOMAIN_GLOSSARY.md` (Standing = DESIRE / PASSION / OBSESSION
/ REIGN, per Canon Amendment 2026-08).

> This is a **spec/proposal only** — it exists because standing accrual needs a
> product decision before code (coding doctrine §9.4). Nothing here is built.

---

## 1. Why this is needed

RRR is **standing-only**: the single member-progression ladder is **Standing**
(`DESIRE / PASSION / OBSESSION / REIGN`). The tier engine already carries the
**locked D3 thresholds** keyed on _lifetime_ points:

| Standing    | Lifetime points | Meaning                           |
| ----------- | --------------- | --------------------------------- |
| `DESIRE`    | 0               | Heartbeat — alive in the program  |
| `PASSION`   | 5,000           | Emotionally invested              |
| `OBSESSION` | 25,000          | Deep craving, committed           |
| `REIGN`     | 100,000         | All-in — the most devoted members |

`tier-engine.service.ts` computes standing from a lifetime total, but the data
layer cannot feed it. F-042 (`C-010`) is blocked by three model conflicts:

1. `LoyaltyAccount` has **no `lifetime_points`** field. → **this proposal.**
2. `rrr_member_tier` typed as the removed `RrrMemberTier` ladder. → **resolved**
   by the standing-only sweep (PR #436): `RrrMemberTier` is deleted and standing
   is `DESIRE/PASSION/OBSESSION/REIGN`. No longer a blocker.
3. `WebhookEmitService` does not exist. → out of scope here (a separate emit
   concern); noted for the C-010 work order.

This proposal closes (1) and adds the **opt-in** dimension the CEO chose.

---

## 2. Core model — lifetime points vs spendable balance

Standing must accrue on **lifetime earned points**, a **monotonic,
non-decreasing** counter that is **never reduced by redemptions**. This is
distinct from the member's _spendable_ points balance (which redemptions do
reduce). A member who earns 30,000 and redeems 28,000 is `OBSESSION` (lifetime
30,000), not knocked back to `PASSION` by spending.

**Proposed fields on `LoyaltyAccount`:**

| Field                  | Type                 | Notes                                                                                                                                                 |
| ---------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifetime_points`      | `BigInt` (default 0) | Monotonic. Incremented on every **positive earn**; **never** decremented by redemption, expiry, or clawback. The accrual basis for the D3 thresholds. |
| `standing_opted_in_at` | `DateTime?`          | Null until the member opts into the Standing program. Standing is computed/surfaced only when non-null (§3).                                          |

**Source of truth stays the append-only earn record.** `lifetime_points` is a
**maintained aggregate**: incremented in the _same_ transaction that appends an
earn `PointLot` / ledger entry, so it never diverges. It is reconstructable at
any time as `SUM(points) over positive earn events` — the migration backfills it
that way, making the counter fully reversible/auditable against the immutable
log.

---

## 3. Opt-in semantics (the CEO decision)

Standing is **opt-in**. A member is not in the Standing program until they opt
in (`standing_opted_in_at` set) — consistent with treating standing as a
consented, member-visible status rather than something imposed.

**Recommended (needs CEO confirm):**

- **Accrual basis = full lifetime earns.** `lifetime_points` accrues from
  account creation regardless of opt-in, but **Standing is only computed,
  surfaced, and acted on (rewards/multipliers, displays, webhooks) after
  opt-in.** On opt-in the member immediately reflects the standing their
  existing lifetime already earns — no "start from zero at opt-in" penalty.
  - _Alternative:_ accrual counts **only post-opt-in** earns (standing starts at
    `DESIRE` at opt-in). Simpler privacy story, but discards pre-opt-in loyalty.
    Flagged for the CEO — the recommendation above rewards existing members.
- **Opt-out:** `standing_opted_in_at` cleared → standing hidden and inert; but
  `lifetime_points` is **retained** (monotonic), so a later re-opt-in restores
  standing without loss.

---

## 4. Accrual query & tier resolution

- On each **earn** event: within the earn transaction,
  `lifetime_points += points` (positive earns only).
- Standing is `tier-engine.calculateTier(account.lifetime_points)` — the
  existing locked D3 thresholds, unchanged. No new thresholds are introduced.
- Standing is **derived**, not stored as an authoritative column (or, if cached
  for query speed, re-derived from `lifetime_points` and never trusted alone —
  same fail-closed pattern used elsewhere). This avoids a second drift source
  and keeps the removed `rrr_member_tier` from reappearing.

---

## 5. Migration & rollout

- **Additive, nullable/defaulted** schema change:
  `lifetime_points BigInt DEFAULT 0`, `standing_opted_in_at TIMESTAMP NULL`.
  Reversible.
- **Backfill** `lifetime_points` from the historical positive-earn events
  (`SUM`), inside a one-shot idempotent backfill script; verifiable against the
  append-only log.
- `standing_opted_in_at` stays NULL for all existing members (nobody is auto-
  enrolled); opt-in is an explicit member action.
- FIZ/points-adjacent → **Human-Review**; `lifetime_points` is monotonic and
  must never be wired to a redemption/spend decrement.

---

## 6. What this unblocks / open questions for sign-off

**Unblocks:** C-010 `TierEvaluationService` (conflict 1 closed here, conflict 2
already resolved). The emit dependency (conflict 3, `WebhookEmitService`)
remains a separate C-010 sub-task.

**Needs CEO sign-off:**

1. Accrual basis — **full lifetime** (recommended) vs **post-opt-in only**.
2. Opt-out behaviour — retain `lifetime_points` and restore on re-opt-in
   (recommended) vs reset.
3. Whether standing changes emit a member-facing event/notification on crossing
   a threshold (ties into the F-042 emit dependency).
4. Confirmation that the D3 thresholds (0 / 5k / 25k / 100k) are final.

---

_On approval this becomes a work order: the `LoyaltyAccount` migration
(`lifetime_points` + `standing_opted_in_at`) + the earn-transaction increment +
the backfill + `TierEvaluationService`, each under Human-Review._
