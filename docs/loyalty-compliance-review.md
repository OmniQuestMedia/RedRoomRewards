# Loyalty Compliance Review — RedRoomRewards Core Loyalty Engine

| Field       | Value                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review date | 2026-06-20 (revision 2)                                                                                                                                                                                             |
| Reviewer    | Engineering collaborator (DAILY WORKING AGREEMENT)                                                                                                                                                                  |
| Scope       | Core loyalty/points logic: ledger, wallet, escrow, accrual, redemption, burn catalogue, and integration boundaries                                                                                                  |
| Branch      | `claude/busy-darwin-gjezr0`                                                                                                                                                                                         |
| Source spec | `docs/RRR_LOYALTY_ENGINE_SPEC_v1.1.md`                                                                                                                                                                              |
| Status      | **AMBER** — `creditPoints`/`deductPoints` are now unified (LCR-1, #395), but the _accrual_ and _escrow_ write paths plus the balance _read_ paths remain split/non-atomic, and spend-ordering lots are still absent |

> **Revision note (rev 2).** Revision 1 (#385) flagged F-1 (split-brain
> balances) as a single P0. Commit **#395** (LCR-1) closed F-1 **only** for
> `LedgerService.creditPoints` / `deductPoints`, which now mutate
> `WalletModel.availableBalance` atomically inside the ledger transaction. This
> revision re-audits the current branch: it records what #395 fixed, narrows the
> residual integrity risk to the paths #395 did _not_ touch, and confirms which
> of F-2…F-9 remain open. The integration-boundary audit (§3) is unchanged in
> substance and re-verified.

---

## 1. Scope and method

This review audits the loyalty engine against three stated invariants:

1. **Append-only ledger** for all points movements.
2. **Three-bucket spend ordering** (promo → membership → purchased), i.e.
   point-type priority + earliest-expiry/FIFO within a type.
3. **No silent or direct balance edits** outside of transactions.

It also documents integration boundaries with ChatNow.Zone rewards, affiliate
qualification, eCommsZone (WooCommerce), and AccountFinanceZone
(settlement/payouts), and flags places where loyalty logic mixes with
financial-ledger (real-money) logic.

Files reviewed (primary):

- `src/ledger/ledger.service.ts` — append-only ledger, idempotency,
  transactions, `creditPoints`/`deductPoints`
- `src/wallets/wallet.service.ts` — escrow hold/settle/refund/partial-settle,
  `getUserBalance`
- `src/services/point-accrual.service.ts` — earn / direct-debit paths
- `src/services/point-redemption.service.ts` — escrow-based redemption + tier
  caps
- `src/services/burn-catalogue.service.ts` — catalogue burn redemption
  (two-phase RESERVED→PENDING)
- `src/services/redroom-ledger.service.ts`, `creator-gifting.service.ts`,
  `affiliate.service.ts`, `settlement.service.ts`
- `src/integrations/woocommerce/*`, `src/api/ledger.controller.ts`,
  `src/services/vip-dfsp-hook.service.ts`
- `src/db/models/spend-order-config.model.ts`, `valuation-config.model.ts`,
  `tier-cap-config.model.ts`, `model-wallet.model.ts`

---

## 2. Current-state assessment

### 2.1 What is working (compliant)

- **Append-only ledger entries.** `LedgerService.createEntry` only ever
  _inserts_ (`src/ledger/ledger.service.ts:54-165`). There is no update/delete
  path on `LedgerEntryModel`. Corrections are new entries. Invariant tests exist
  (`src/ledger/ledger.service.invariants.spec.ts`,
  `src/db/models/__tests__/ledger-entry.immutability.spec.ts`).
- **Idempotency gate.** `claimIdempotency` (`ledger.service.ts:451-475`) uses a
  unique index on `(pointsIdempotencyKey, eventScope)` as a hard single-winner
  concurrency gate.
- **PII guard on metadata.** `createEntry` rejects PII field names and inline
  email patterns (`ledger.service.ts:67-87`).
- **Transaction primitive available and now used on the credit/deduct path.**
  `withTransaction` / `withTransactionSafety` (`ledger.service.ts:519-569`)
  wraps writes in a Mongoose session on a replica set, with a safe standalone
  fallback for tests.
- **`creditPoints` / `deductPoints` are now atomic and balance-unified (LCR-1,
  #395).** `creditPoints` upserts `$inc availableBalance` and writes the ledger
  entry in the **same** session (`ledger.service.ts:590-635`). `deductPoints`
  uses a single conditional `findOneAndUpdate` (`availableBalance >= amount`) —
  race-free, never drives the balance negative — then writes the entry
  in-session (`ledger.service.ts:658-705`). Cross-path convergence is covered by
  `src/ledger/__tests__/balance-source-unification.spec.ts`.
- **Escrow lifecycle is state-guarded.** Hold→settle/refund/partial-settle
  transitions use an intermediate status
  (`settling`/`refunding`/`partial_settling`) and conditional `findOneAndUpdate`
  to prevent double-processing (`wallet.service.ts:288-309, 466-487`).
- **Tier caps & earn rates are effective-dated and config-driven.**
  `validateTierCap` (`point-redemption.service.ts:280-306`) requires an active
  `TierCapConfig` row — no platform default. `calculateEarnRate` requires an
  active `EarnRateConfig` (`point-accrual.service.ts:376-404`).
- **WooCommerce webhook signatures verified.** HMAC-SHA256 + timing-safe compare
  against the raw body
  (`src/integrations/woocommerce/woocommerce-webhook.controller.ts`).

### 2.2 Architecture as-built (post-#395)

LCR-1 made `WalletModel.availableBalance` the **intended** single source of
truth, but only the `creditPoints`/`deductPoints` path was migrated. Three other
writers/readers still bypass that contract:

| Path                                                                                                     | Balance write                                                                    | Balance read                                                               | Atomic w/ ledger?                                                                                               |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `LedgerService.creditPoints` / `deductPoints` (catalogue burn, WooCommerce, RedRoom compliance)          | `WalletModel.availableBalance` via `$inc`                                        | n/a                                                                        | ✅ shared session                                                                                               |
| `PointAccrualService.awardPoints` / `deductFromAvailable` (signup, referral, promo, admin)               | `WalletModel.availableBalance` via optimistic `version` `$inc`                   | n/a                                                                        | ❌ ledger entry written **after**, no shared session (`point-accrual.service.ts:177-219, 460-501`)              |
| `WalletService` escrow (`holdInEscrow`/`settleEscrow`/`refundEscrow`/`partialSettleEscrow`)              | `WalletModel.availableBalance`/`escrowBalance`, `ModelWalletModel.earnedBalance` | n/a                                                                        | ❌ ledger entries written **after**, no shared session (`wallet.service.ts:160-225, 328-406, 500-553, 667-770`) |
| **Read: `WalletService.getUserBalance`**                                                                 | n/a                                                                              | `WalletModel.availableBalance` (`wallet.service.ts:814-834`)               | —                                                                                                               |
| **Read: `LedgerService.getBalanceSnapshot`** (used by `GET /v1/.../balance`, `ledger.controller.ts:229`) | n/a                                                                              | last ledger entry's `balanceAfter` per state (`ledger.service.ts:310-319`) | —                                                                                                               |

So #395 fixed the _write_ convergence for one path, but the system still has (a)
two **non-atomic** write paths that can leave wallet and ledger divergent on
partial failure, and (b) two **different read paths** (`WalletModel` vs ledger
`balanceAfter`) that can return different "current balances" for the same
account. These are the root causes of the two highest residual findings below.

---

## 3. Findings and risks

Severity: **P0** = points-as-money integrity risk; **P1** = invariant/spec
violation; **P2** = boundary/hardening. Status reflects the current branch as of
commit #395.

### F-1 (P0 → now P1) — Balance unification incomplete: accrual + escrow writes still bypass it

**Partially resolved by #395.** `creditPoints`/`deductPoints` are now atomic and
write `WalletModel`. But the two largest write surfaces were not migrated:

- `PointAccrualService.awardPoints`/`deductFromAvailable` mutate `WalletModel`
  with optimistic locking and then call `createEntry` with **no shared session**
  (`point-accrual.service.ts:177-219, 460-501`). The
  `balanceBefore`/`balanceAfter` they record are computed locally, not by the
  same `$inc` that the ledger row is bound to.
- All four `WalletService` escrow methods mutate
  `WalletModel`/`ModelWalletModel` and then call `createEntry` outside any
  shared transaction (`wallet.service.ts:160-225, 328-406, 500-553, 667-770`).
  The file header still documents the gap as an open TODO
  (`wallet.service.ts:7-28`), and `partialSettleEscrow` explicitly notes an
  un-rolled-back user-wallet mutation (`wallet.service.ts:712`).

**Consequence:** the points-as-money guarantee now holds for
catalogue/WooCommerce/compliance credits but **not** for
signup/referral/promo/admin earns or any escrow movement. A ledger insert
failing after a wallet `$inc` (or vice versa) still silently diverges balance
from ledger on those paths. This is the same class of defect F-1 named, narrowed
to the un-migrated paths. See task **LCR-1b** (supersedes residual LCR-1) and
**LCR-3**.

### F-2 (P1) — Three-bucket spend ordering (promo → membership → purchased) not implemented

**Unchanged.** The invariant requires lot-aware consumption: point-type priority
(promo → membership → purchased) with earliest-expiry-then-FIFO within a type
(spec §6; `SpendOrderConfig.point_type_priority` + `within_type_order`,
`src/db/models/spend-order-config.model.ts`). As built, **no redemption path
consumes points by lot or bucket**:

- `BurnCatalogueService.redeemItem` calls `ledger.deductPoints` against a single
  scalar available balance (`burn-catalogue.service.ts:224-239`).
- `WalletService.holdInEscrow` decrements one scalar `availableBalance`
  (`wallet.service.ts:140-173`).
- `awardPoints` stores `expiresAt` only in **metadata**, never as a consumable
  lot (`point-accrual.service.ts:215-218`).
- There is **no `PointLot` model** in the codebase (verified:
  `grep -rn PointLot src` returns nothing). `SpendOrderConfig` and
  `ValuationConfig` exist as config models with **no runtime consumer**
  (verified: the only non-model/non-spec references are
  `src/db/models/index.ts`).

**Consequence:** promo/gifted points (short expiry) are not preferentially
consumed before purchased points; per-lot expiry (spec §3) cannot be enforced;
`redeemable_points` excluding ineligible/expired lots (spec §5, §14
`GET /v1/balance`) cannot be computed. Direct violation of the stated
spend-ordering invariant. See task **LCR-2**.

### F-3 (P1) — Balance edits and ledger writes are not atomic on the accrual + escrow paths

**Unchanged (now the dominant residual of F-1).**
`PointAccrualService.awardPoints`/ `deductFromAvailable` and all `WalletService`
escrow flows update the wallet first and then call `createEntry` without a
shared session (`point-accrual.service.ts:177-219, 460-501`;
`wallet.service.ts:160-225, 328-406`). The transaction primitive
(`withTransaction`) exists and is already used by `creditPoints`/`deductPoints`,
proving the pattern — these paths simply have not adopted it. See task
**LCR-3**.

### F-4 (P1) — Two read paths can diverge: `getUserBalance` (wallet) vs `getBalanceSnapshot` (ledger)

**Partially mitigated, partially worsened by #395.** `getBalanceSnapshot` still
sets `balances[state] = entry.balanceAfter` for the chronologically last entry
rather than summing signed `amount` deltas (`ledger.service.ts:310-319`). After
LCR-1 there are now two _authoritative-looking_ reads:
`WalletService.getUserBalance` reads `WalletModel`
(`wallet.service.ts:814-834`), while the balance API `GET …/balance` reads
`getBalanceSnapshot` from the ledger (`ledger.controller.ts:229`). Because the
non-atomic F-3 paths can write a `balanceAfter` that the wallet `$inc` later
contradicts, these two reads can return different numbers for the same account.
A pure append-only ledger should derive balance by **summing deltas**, and the
product should expose **one** read path. See task **LCR-4** (fold into LCR-1b).

### F-5 (P2) — Domain boundary: loyalty points mixed with financial (earned/settlement) balance

**Unchanged.** `settleEscrow` settles user loyalty points into
`ModelWalletModel.earnedBalance` (`wallet.service.ts:323-406`), which feeds
creator settlement/payouts (AccountFinanceZone). The same `LedgerEntry` model
and `currency: 'points'` carry both abstract loyalty points and cash-equivalent
creator earnings. `SettlementService.settlePeriod` creates a record with
`total_redeemed: 0` and **never consults `ValuationConfig.cents_per_point`**
(`settlement.service.ts:29-56`), so no point→currency conversion is recorded on
the financial side and `ValuationConfig` is effectively dead config.
`RedRoomLedgerService.awardPointsWithCompliance` further mixes external
compliance gating (GateGuard AV, Welfare Guardian Score) directly into the award
path (`redroom-ledger.service.ts:14-41`).

**Consequence:** the loyalty-liability vs money-owed boundary is blurred;
liability reporting (spec §12) and creator-payout reconciliation cannot cleanly
separate the two, and a later `cents_per_point` change makes historical payout
liability unrecoverable. See task **LCR-5**.

### F-6 (P2) — WooCommerce webhook idempotency not enforced

**Unchanged.** `x-wc-webhook-delivery-id` is read but never stored/checked, and
processing is fire-and-forget after an immediate 200. Duplicate deliveries
(common on WooCommerce retry) can double-award or double-reverse points. The
earn path also uses a hardcoded points-per-dollar rather than `EarnRateConfig`.
See task **LCR-6**.

### F-7 (P2) — Generic webhook verifier fails open when secret is unset

**Unchanged.** The generic webhook verifier returns `true` when
`RRR_WEBHOOK_SECRET` is unconfigured (stub mode), so unsigned webhooks are
accepted in any environment lacking the secret. Should fail closed in
production. See task **LCR-7**.

### F-8 (P2) — Affiliate bonus has no ledger entry / audit trail

**Unchanged.** `AffiliateService.resolveBonus` computes bonus points in-memory
(`affiliate.service.ts:45-73`) with no dedicated ledger entry tagged
`reason=AFFILIATE_BONUS` + `affiliate_id`, no idempotency key, and **no caller**
that turns the result into a credit. Affiliate qualification
(`platform: 'chatnow' | 'synthimate' | 'redroompleasures'`,
`affiliate-link.model.ts`) is therefore invisible to balances and
reconciliation. See task **LCR-8**.

### F-9 (P2) — Critical launch features are stubs (ChatNow.Zone model gifting)

**Unchanged.** `CreatorGiftingService.createPromotion` →
`LedgerService.createGiftingPromotion` only logs (`ledger.service.ts:717-728`).
`CreatorGiftingPanelService.getPanelState` returns hardcoded zero balances.
`VipDfspHookService.notifyDfsp` is a stub
(`delivered:false, skipped_reason:'stub'`). No inbound ChatNow.Zone event
handler exists — `events.controller.ts` is a generic queue intake with no
`chatnow.*` event types. Model gifting is the launch-critical feature (spec §8).
Track as known-incomplete, not a regression. See task **LCR-9**.

---

## 4. Invariant scorecard

| Invariant                                                    | Status     | Evidence                                                                                                |
| ------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| Append-only ledger (insert-only, corrections as new entries) | ✅ Pass    | `ledger.service.ts:54-165`; immutability specs                                                          |
| Balance unified on a single source of truth                  | ⚠️ Partial | `creditPoints`/`deductPoints` ✅ (#395); accrual+escrow writes still bypass (F-1); two read paths (F-4) |
| Balance = derived by summing deltas                          | ⚠️ Partial | snapshot reads last `balanceAfter` (F-4)                                                                |
| Three-bucket spend ordering (promo → membership → purchased) | ❌ Fail    | not implemented; no lot store (F-2)                                                                     |
| Per-lot expiry + redeemable excludes ineligible lots         | ❌ Fail    | expiry in metadata only (F-2)                                                                           |
| No silent/direct balance edits outside transactions          | ⚠️ Partial | credit/deduct ✅; accrual + escrow non-atomic (F-3)                                                     |
| Idempotency on all mutating ops                              | ⚠️ Partial | core ✅; WooCommerce/affiliate gaps (F-6, F-8)                                                          |
| Loyalty ↔ financial domain separation                        | ⚠️ Partial | earned/settlement mixing; `ValuationConfig` unused (F-5)                                                |
| Tier caps & earn rates effective-dated, config-driven        | ✅ Pass    | `point-redemption.service.ts:280-306`, `point-accrual.service.ts:376-404`                               |
| Webhook signature verification                               | ⚠️ Partial | WooCommerce ✅; generic fails open (F-7)                                                                |

---

## 5. Test coverage gaps

- **Cross-path consistency partially covered.**
  `balance-source-unification.spec.ts` asserts convergence for
  `creditPoints`/`deductPoints`/`awardPoints`/`getUserBalance` against one
  `WalletModel` fake. **Missing:** a test that interleaves an escrow movement
  with a ledger-path credit and asserts `getUserBalance` == `getBalanceSnapshot`
  (F-4).
- **No spend-ordering tests.** Spec acceptance tests §19.5 (earliest-expiry then
  FIFO) and §19.4 (micro top-up near threshold) cannot pass because the
  behaviour is absent (F-2).
- **No expiry-exclusion test.** `redeemable_points` excluding expired/ineligible
  lots (spec §5) is untested because lots don't exist.
- **No atomicity/fault-injection test on accrual/escrow.** No test simulates
  ledger-insert failure after a wallet mutation on `awardPoints` or the escrow
  methods to prove rollback (F-3).
- **No negative-balance paydown test** for the scalar path (spec §7 / §19.6).
- **WooCommerce duplicate-delivery test** (same `delivery-id` twice → single
  award) missing (F-6).
- **Generic webhook fail-closed test** when secret unset (F-7) missing.
- **Settlement valuation test** (earned points × `cents_per_point` → payout,
  recorded in ledger) missing (F-5).

---

## 6. Recommended fixes / backlog (small, reviewable tasks)

| ID         | Title                                                   | Sev   | Status         | Outline                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------- | ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LCR-1**  | Unify balance source of truth (credit/deduct)           | P0    | ✅ Done (#395) | `creditPoints`/`deductPoints` now mutate `WalletModel` atomically; cross-path test added.                                                                                                                                                                             |
| **LCR-1b** | Finish unification: accrual + escrow + single read path | P0→P1 | Open           | Route `awardPoints`/`deductFromAvailable` and all `WalletService` escrow mutations through `WalletModel` inside `withTransaction`; expose one balance read (drop `getBalanceSnapshot`-as-source or rebuild it by summing deltas). Add escrow↔ledger convergence test. |
| **LCR-2**  | Reintroduce point lots + bucket-ordered consumption     | P1    | Open           | Add a lot store; consume honouring `SpendOrderConfig.point_type_priority` (promo→membership→purchased) then `within_type_order` (earliest-expiry/FIFO); compute `redeemable_points` excluding expired/ineligible lots.                                                |
| **LCR-3**  | Make wallet+ledger writes atomic (accrual + escrow)     | P1    | Open           | Wrap `awardPoints`/`deductFromAvailable` and the four escrow methods in `LedgerService.withTransaction`, passing the session to `createEntry`. Add fault-injection rollback tests. (Pairs with LCR-1b.)                                                               |
| **LCR-4**  | Sum-based, single balance read                          | P1    | Open           | Derive balances from `Σ amount` per state with a deterministic tie-break; keep `balanceAfter` only as an audit annotation; make `getUserBalance` and the balance API agree. (Fold into LCR-1b.)                                                                       |
| **LCR-5**  | Separate loyalty vs financial settlement                | P2    | Open           | Consult active `ValuationConfig` at settlement, record point→cents conversion + snapshot `cents_per_point`; isolate creator-earnings/settlement from loyalty point liability in reporting.                                                                            |
| **LCR-6**  | WooCommerce webhook idempotency + config earn rate      | P2    | Open           | Persist + check `x-wc-webhook-delivery-id` before processing; source earn rate from `EarnRateConfig`.                                                                                                                                                                 |
| **LCR-7**  | Fail closed on missing webhook secret                   | P2    | Open           | Throw when `RRR_WEBHOOK_SECRET` is unset in production; allow stub only behind an explicit non-prod flag.                                                                                                                                                             |
| **LCR-8**  | Affiliate bonus ledger entry + idempotency              | P2    | Open           | Emit a dedicated ledger entry (`reason=AFFILIATE_BONUS`, `affiliate_id` in metadata) with an idempotency key for every resolved bonus; add the missing caller that applies it.                                                                                        |
| **LCR-9**  | Complete model gifting (spec §8)                        | P2    | Open           | Replace `createGiftingPromotion` stub with real debit-model-allocation / credit-user-gifted (30-day expiry) transfer; wire `creator-gifting-panel` to real balances; add ChatNow.Zone inbound event handler.                                                          |

Suggested sequencing: **LCR-1b (+ LCR-3, LCR-4)** as one integrity work-stream
on top of the #395 foundation, then **LCR-2** (spend ordering on a trustworthy
balance), then the P2 boundary/hardening items (**LCR-5 → LCR-9**).

---

## 7. Compliance health summary

The loyalty engine has a **solid append-only ledger core** and, since #395, a
**correctly unified and atomic credit/deduct path** with a passing cross-path
convergence test. That closes the worst of the original split-brain risk for
catalogue, WooCommerce, and compliance credits.

Three structural issues still prevent full points-as-money compliance:

1. **Unification is incomplete (F-1/F-3/F-4):** the high-volume accrual paths
   (signup/referral/promo/ admin) and **all** escrow movements still mutate the
   wallet and write the ledger **non-atomically**, and the product still has
   **two divergent balance reads** (`WalletModel` vs ledger snapshot). Until
   LCR-1b/3/4 land, balance integrity is guaranteed only on the credit/deduct
   path.
2. **Missing spend ordering & lots (F-2):** the promo → membership → purchased
   invariant and per-lot expiry are not implemented (no `PointLot` store), so
   several spec acceptance tests cannot pass.
3. **Loyalty/financial boundary (F-5):** settlement never applies
   `ValuationConfig`, so points and money owed share one ledger with no recorded
   conversion.

Plus the P2 hardening items F-6–F-9 (webhook idempotency/fail-open, affiliate
audit trail, gifting stubs).

**Overall: AMBER.** Materially improved by #395, but **not yet** safe to treat
_all_ point balances as a reconciled financial liability. Closing **LCR-1b +
LCR-3 + LCR-4** (one integrity work-stream) plus **LCR-2** moves the system to
GREEN on the three core invariants.
