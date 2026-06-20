# Loyalty Compliance Review — RedRoomRewards Core Loyalty Engine

| Field       | Value                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Review date | 2026-06-20 (revision 3)                                                                                                                                                  |
| Reviewer    | Engineering collaborator (DAILY WORKING AGREEMENT)                                                                                                                       |
| Scope       | Core loyalty/points logic: ledger, wallet, escrow, accrual, redemption, burn catalogue, and integration boundaries                                                       |
| Branch      | `claude/busy-darwin-gjezr0`                                                                                                                                              |
| Source spec | `docs/RRR_LOYALTY_ENGINE_SPEC_v1.1.md`                                                                                                                                   |
| Status      | **AMBER** — balance derivation is now sound (LCR-1 #395 + LCR-4 #396), but the accrual and escrow write paths remain non-atomic and spend-ordering lots are still absent |

> **Revision note (rev 3).** Rev 1 (#385) flagged F-1 (split-brain balances) as
> a single P0. Rev 2 re-audited after **#395** (LCR-1) unified
> `creditPoints`/`deductPoints` onto `WalletModel`. This rev 3 reconciles with
> `main` merged into the branch, which also brought **#396** (LCR-4 —
> `getBalanceSnapshot` now derives balance by summing signed deltas, closing
> F-4) and **#398** (hygiene cleanup; removed `architecture.md` and two unused
> controllers). Net effect: the balance-projection invariant is now satisfied;
> the dominant residual risk is the **non-atomic accrual + escrow write paths**
> (F-1 residual / F-3) and the **missing spend-ordering lots** (F-2).

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
  transactions, `creditPoints`/`deductPoints`, `getBalanceSnapshot`
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
- **Idempotency gate.** `claimIdempotency` (`ledger.service.ts:458`) uses a
  unique index on `(pointsIdempotencyKey, eventScope)` as a hard single-winner
  concurrency gate.
- **PII guard on metadata.** `createEntry` rejects PII field names and inline
  email patterns (`ledger.service.ts:67-87`).
- **Transaction primitive available and used on the credit/deduct path.**
  `withTransaction` / `withTransactionSafety` (`ledger.service.ts:526-569`)
  wraps writes in a Mongoose session on a replica set, with a safe standalone
  fallback for tests.
- **`creditPoints` / `deductPoints` are atomic and balance-unified (LCR-1,
  #395).** `creditPoints` upserts `$inc availableBalance` and writes the ledger
  entry in the **same** session (`ledger.service.ts:597`). `deductPoints` uses a
  single conditional `findOneAndUpdate` (`availableBalance >= amount`) —
  race-free, never drives the balance negative — then writes the entry
  in-session (`ledger.service.ts:665`). Cross-path convergence is covered by
  `src/ledger/__tests__/balance-source-unification.spec.ts`.
- **Balance projection now sums signed deltas (LCR-4, #396).**
  `getBalanceSnapshot` computes `balances[state] += entry.amount` over all
  entries (`ledger.service.ts:311-324`) instead of trusting the last entry's
  `balanceAfter`. This is the correct order-independent append-only projection;
  a single bad `balanceAfter` annotation can no longer poison the read. Covered
  by `src/ledger/__tests__/balance-source-unification.spec.ts`.
- **Escrow lifecycle is state-guarded.** Hold→settle/refund/partial-settle
  transitions use an intermediate status
  (`settling`/`refunding`/`partial_settling`) and conditional `findOneAndUpdate`
  to prevent double-processing (`wallet.service.ts:266-309, 444-487`).
- **Tier caps & earn rates are effective-dated and config-driven.**
  `validateTierCap` (`point-redemption.service.ts:280-306`) requires an active
  `TierCapConfig` row — no platform default. `calculateEarnRate` requires an
  active `EarnRateConfig` (`point-accrual.service.ts:376-404`).
- **WooCommerce webhook signatures verified.** HMAC-SHA256 + timing-safe compare
  against the raw body
  (`src/integrations/woocommerce/woocommerce-webhook.controller.ts`).

### 2.2 Architecture as-built (post #395 / #396)

`WalletModel.availableBalance` is the intended live balance, and the ledger is
the immutable audit log from which `getBalanceSnapshot` now derives balance by
summing deltas. Two write paths still mutate the wallet and write the ledger
**without a shared session**, so on partial failure the live wallet and the
ledger-derived balance can diverge:

| Path                                                                                              | Balance write                                                     | Atomic w/ ledger?                                                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `LedgerService.creditPoints` / `deductPoints` (catalogue burn, WooCommerce, RedRoom compliance)   | `WalletModel.availableBalance` via `$inc` / conditional decrement | ✅ shared session                                                                          |
| `PointAccrualService.awardPoints` / `deductFromAvailable` (signup, referral, promo, admin)        | `WalletModel.availableBalance` via optimistic `version` `$inc`    | ❌ ledger entry written after, no shared session (`point-accrual.service.ts:130, 421`)     |
| `WalletService` escrow (`holdInEscrow` / `settleEscrow` / `refundEscrow` / `partialSettleEscrow`) | `WalletModel`/`ModelWalletModel` balances                         | ❌ ledger entries written after, no shared session (`wallet.service.ts:91, 266, 444, 591`) |

Reads: `WalletService.getUserBalance` reads `WalletModel`
(`wallet.service.ts:814-834`); the balance API `GET …/balance` reads
`getBalanceSnapshot` (`api/ledger.controller.ts:229`). After #396 these agree
whenever writes are atomic; they can still diverge precisely on the two
non-atomic paths above (F-3).

---

## 3. Findings and risks

Severity: **P0** = points-as-money integrity risk; **P1** = invariant/spec
violation; **P2** = boundary/hardening. Status reflects the current branch as of
the `main` merge (includes #395, #396, #398).

### F-1 (residual, P1) — Balance unification incomplete: accrual + escrow writes still bypass it

**Partially resolved (#395 + #396).** The credit/deduct path is atomic and the
balance projection now sums deltas. The two largest write surfaces were **not**
migrated:

- `PointAccrualService.awardPoints`/`deductFromAvailable` mutate `WalletModel`
  with optimistic locking and then call `createEntry` with **no shared session**
  (`point-accrual.service.ts:130, 421`).
- All four `WalletService` escrow methods mutate
  `WalletModel`/`ModelWalletModel` and then call `createEntry` outside any
  shared transaction (`wallet.service.ts:91, 266, 444, 591`). The file header
  still documents the gap (`wallet.service.ts:7-28`), and `partialSettleEscrow`
  notes an un-rolled-back user-wallet mutation.

**Consequence:** points-as-money integrity holds for
catalogue/WooCommerce/compliance credits but **not** for
signup/referral/promo/admin earns or any escrow movement. A ledger insert
failing after a wallet `$inc` (or vice versa) silently diverges the live wallet
from the ledger-derived balance on those paths. See **LCR-1b** / **LCR-3**.

### F-2 (P1) — Three-bucket spend ordering (promo → membership → purchased) not implemented

**Unchanged.** The invariant requires lot-aware consumption (spec §6;
`SpendOrderConfig.point_type_priority` + `within_type_order`). As built, **no
redemption path consumes points by lot or bucket**:

- `BurnCatalogueService.redeemItem` calls `ledger.deductPoints` against a single
  scalar available balance.
- `WalletService.holdInEscrow` decrements one scalar `availableBalance`.
- `awardPoints` stores `expiresAt` only in **metadata**, never as a consumable
  lot (`point-accrual.service.ts:130`).
- There is **no `PointLot` model** in the codebase (`grep -rn PointLot src` →
  empty). `SpendOrderConfig` and `ValuationConfig` exist as config models with
  **no runtime consumer** (only `src/db/models/index.ts` references them).

**Consequence:** promo/gifted points (short expiry) are not preferentially
consumed before purchased points; per-lot expiry (spec §3) cannot be enforced;
`redeemable_points` excluding ineligible/expired lots (spec §5, §14) cannot be
computed. Direct violation of the spend-ordering invariant. See **LCR-2**.

### F-3 (P1) — Balance edits and ledger writes are not atomic on the accrual + escrow paths

**Unchanged (now the dominant residual of F-1).**
`awardPoints`/`deductFromAvailable` and all `WalletService` escrow flows update
the wallet first and then call `createEntry` without a shared session
(`point-accrual.service.ts:130, 421`; `wallet.service.ts:91, 266, 444, 591`).
The transaction primitive (`withTransaction`) exists and is already used by
`creditPoints`/`deductPoints`, proving the pattern — these paths have not
adopted it. See **LCR-3**.

### F-4 (P1) — `getBalanceSnapshot` reads last `balanceAfter` instead of summing deltas — **RESOLVED (#396)**

**Closed.** `getBalanceSnapshot` now derives each state's balance by summing
signed `amount` deltas (`ledger.service.ts:311-324`), keeping `balanceAfter`
only as an audit annotation. The order-independent projection removes the "one
bad snapshot poisons every read" risk. The remaining cross-store divergence
concern (wallet vs ledger sum) is now wholly a function of the non-atomic write
paths and is tracked under F-1/F-3, not here.

### F-5 (P2) — Domain boundary: loyalty points mixed with financial (earned/settlement) balance

**Unchanged.** `settleEscrow` settles user loyalty points into
`ModelWalletModel.earnedBalance` (`wallet.service.ts:266`), which feeds creator
settlement/payouts (AccountFinanceZone). The same `LedgerEntry` model and
`currency: 'points'` carry both abstract loyalty points and cash-equivalent
creator earnings. `SettlementService.settlePeriod` creates a record with
`total_redeemed: 0` and **never consults `ValuationConfig.cents_per_point`**
(`settlement.service.ts:29`), so no point→currency conversion is recorded and
`ValuationConfig` is effectively dead config.
`RedRoomLedgerService.awardPointsWithCompliance` mixes external compliance
gating (GateGuard AV, Welfare Guardian Score) directly into the award path. See
**LCR-5**.

### F-6 (P2) — WooCommerce webhook idempotency not enforced

**Unchanged.** `x-wc-webhook-delivery-id` is read but never stored/checked;
processing is fire-and-forget after an immediate 200. Duplicate deliveries
(common on WooCommerce retry) can double-award or double-reverse points. The
earn path also uses a hardcoded points-per-dollar rather than `EarnRateConfig`.
See **LCR-6**.

### F-7 (P2) — Generic webhook verifier fails open when secret is unset

**Unchanged.** The generic webhook verifier returns `true` when
`RRR_WEBHOOK_SECRET` is unconfigured (stub mode), so unsigned webhooks are
accepted in any environment lacking the secret. Should fail closed in
production. See **LCR-7**.

### F-8 (P2) — Affiliate bonus has no ledger entry / audit trail

**Unchanged.** `AffiliateService.resolveBonus` computes bonus points in-memory
(`affiliate.service.ts:45`) with no dedicated ledger entry tagged
`reason=AFFILIATE_BONUS` + `affiliate_id`, no idempotency key, and **no caller**
that turns the result into a credit. Affiliate qualification
(`platform: 'chatnow' | 'synthimate' | 'redroompleasures'`) is invisible to
balances and reconciliation. See **LCR-8**.

### F-9 (P2) — Critical launch features are stubs (ChatNow.Zone model gifting)

**Unchanged.** `CreatorGiftingService.createPromotion` →
`LedgerService.createGiftingPromotion` only logs (`ledger.service.ts:724`).
`CreatorGiftingPanelService.getPanelState` returns hardcoded zero balances.
`VipDfspHookService.notifyDfsp` is a stub. No inbound ChatNow.Zone event handler
exists — `events.controller.ts` is a generic queue intake with no `chatnow.*`
event types. Model gifting is the launch-critical feature (spec §8). Track as
known-incomplete, not a regression. See **LCR-9**.

---

## 4. Invariant scorecard

| Invariant                                                    | Status     | Evidence                                                                     |
| ------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------- |
| Append-only ledger (insert-only, corrections as new entries) | ✅ Pass    | `ledger.service.ts:54-165`; immutability specs                               |
| Balance = derived by summing deltas                          | ✅ Pass    | `getBalanceSnapshot` sums `amount` (LCR-4 #396; `ledger.service.ts:311-324`) |
| Balance unified on a single source of truth                  | ⚠️ Partial | credit/deduct ✅ (#395); accrual + escrow writes still bypass (F-1)          |
| Three-bucket spend ordering (promo → membership → purchased) | ❌ Fail    | not implemented; no lot store (F-2)                                          |
| Per-lot expiry + redeemable excludes ineligible lots         | ❌ Fail    | expiry in metadata only (F-2)                                                |
| No silent/direct balance edits outside transactions          | ⚠️ Partial | credit/deduct ✅; accrual + escrow non-atomic (F-3)                          |
| Idempotency on all mutating ops                              | ⚠️ Partial | core ✅; WooCommerce/affiliate gaps (F-6, F-8)                               |
| Loyalty ↔ financial domain separation                        | ⚠️ Partial | earned/settlement mixing; `ValuationConfig` unused (F-5)                     |
| Tier caps & earn rates effective-dated, config-driven        | ✅ Pass    | `point-redemption.service.ts:280-306`, `point-accrual.service.ts:376-404`    |
| Webhook signature verification                               | ⚠️ Partial | WooCommerce ✅; generic fails open (F-7)                                     |

---

## 5. Test coverage gaps

- **Cross-path consistency partially covered.**
  `balance-source-unification.spec.ts` asserts convergence for
  `creditPoints`/`deductPoints`/`awardPoints`/`getUserBalance` and the sum-based
  snapshot. **Missing:** a test that interleaves an escrow movement with a
  ledger-path credit and asserts `getUserBalance` == `getBalanceSnapshot`.
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

| ID         | Title                                               | Sev | Status         | Outline                                                                                                                                                                                                                |
| ---------- | --------------------------------------------------- | --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LCR-1**  | Unify balance source of truth (credit/deduct)       | P0  | ✅ Done (#395) | `creditPoints`/`deductPoints` mutate `WalletModel` atomically; cross-path test added.                                                                                                                                  |
| **LCR-4**  | Sum-based balance projection                        | P1  | ✅ Done (#396) | `getBalanceSnapshot` derives balance by summing signed deltas; `balanceAfter` kept as audit annotation only.                                                                                                           |
| **LCR-1b** | Finish unification: accrual + escrow writes         | P1  | Open           | Route `awardPoints`/`deductFromAvailable` and all `WalletService` escrow mutations through `WalletModel` inside `withTransaction`, passing the session to `createEntry`. Add escrow↔ledger convergence test.           |
| **LCR-2**  | Reintroduce point lots + bucket-ordered consumption | P1  | Open           | Add a lot store; consume honouring `SpendOrderConfig.point_type_priority` (promo→membership→purchased) then `within_type_order` (earliest-expiry/FIFO); compute `redeemable_points` excluding expired/ineligible lots. |
| **LCR-3**  | Make wallet+ledger writes atomic (accrual + escrow) | P1  | Open           | Wrap the accrual and four escrow methods in `LedgerService.withTransaction`; add fault-injection rollback tests. (Pairs with LCR-1b.)                                                                                  |
| **LCR-5**  | Separate loyalty vs financial settlement            | P2  | Open           | Consult active `ValuationConfig` at settlement, record point→cents conversion + snapshot `cents_per_point`; isolate creator-earnings/settlement from loyalty point liability in reporting.                             |
| **LCR-6**  | WooCommerce webhook idempotency + config earn rate  | P2  | Open           | Persist + check `x-wc-webhook-delivery-id` before processing; source earn rate from `EarnRateConfig`.                                                                                                                  |
| **LCR-7**  | Fail closed on missing webhook secret               | P2  | Open           | Throw when `RRR_WEBHOOK_SECRET` is unset in production; allow stub only behind an explicit non-prod flag.                                                                                                              |
| **LCR-8**  | Affiliate bonus ledger entry + idempotency          | P2  | Open           | Emit a dedicated ledger entry (`reason=AFFILIATE_BONUS`, `affiliate_id` in metadata) with an idempotency key for every resolved bonus; add the missing caller that applies it.                                         |
| **LCR-9**  | Complete model gifting (spec §8)                    | P2  | Open           | Replace `createGiftingPromotion` stub with real debit-model-allocation / credit-user-gifted (30-day expiry) transfer; wire `creator-gifting-panel` to real balances; add ChatNow.Zone inbound event handler.           |

Suggested sequencing: **LCR-1b + LCR-3** (finish the integrity foundation on top
of #395/#396), then **LCR-2** (spend ordering on a trustworthy balance), then
the P2 boundary/hardening items (**LCR-5 → LCR-9**).

---

## 7. Compliance health summary

The loyalty engine has a **solid append-only ledger core**. Following PRs #395
and #396 it now has a **correctly unified atomic credit/deduct path** and a
**sum-based balance projection** — closing the original split-brain (F-1 core)
and snapshot-poisoning (F-4) risks, backed by a passing cross-path convergence
test.

Two structural issues still prevent full points-as-money compliance:

1. **Unification is incomplete (F-1 residual / F-3):** the high-volume accrual
   paths (signup/referral/promo/admin) and **all** escrow movements still mutate
   the wallet and write the ledger **non-atomically**. Until LCR-1b/3 land,
   balance integrity under partial failure is guaranteed only on the
   credit/deduct path.
2. **Missing spend ordering & lots (F-2):** the promo → membership → purchased
   invariant and per-lot expiry are not implemented (no `PointLot` store), so
   several spec acceptance tests cannot pass.

Plus the P2 items: loyalty/financial boundary at settlement (F-5) and hardening
F-6–F-9.

**Overall: AMBER.** Materially improved by #395 and #396 — balance derivation is
now sound. **Not yet** safe to treat _all_ point balances as a reconciled
financial liability until the accrual + escrow paths are made atomic (LCR-1b/3)
and spend-ordering lots land (LCR-2). Closing those moves the system to GREEN on
the three core invariants.
