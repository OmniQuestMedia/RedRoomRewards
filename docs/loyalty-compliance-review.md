# Loyalty Compliance Review — RedRoomRewards Core Loyalty Engine

| Field | Value |
| --- | --- |
| Review date | 2026-06-20 |
| Reviewer | Engineering collaborator (DAILY WORKING AGREEMENT) |
| Scope | Core loyalty/points logic: ledger, wallet, escrow, accrual, redemption, burn catalogue, and integration boundaries |
| Branch | `claude/funny-tesla-dohq9j` |
| Source spec | `docs/RRR_LOYALTY_ENGINE_SPEC_v1.1.md` |
| Status | **AMBER** — core ledger primitives are sound, but two structural invariant gaps must be closed before points-as-money guarantees hold |

---

## 1. Scope and method

This review audits the loyalty engine against three stated invariants:

1. **Append-only ledger** for all points movements.
2. **Three-bucket spend ordering** (promo → membership → purchased), i.e. point-type
   priority + earliest-expiry/FIFO within a type.
3. **No silent or direct balance edits** outside of transactions.

It also documents integration boundaries with ChatNow.Zone rewards, affiliate
qualification, eCommsZone (WooCommerce), and AccountFinanceZone (settlement/payouts),
and flags places where loyalty logic mixes with financial-ledger (real-money) logic.

Files reviewed (primary):

- `src/ledger/ledger.service.ts` — append-only ledger, idempotency, transactions
- `src/wallets/wallet.service.ts` — escrow hold/settle/refund/partial-settle
- `src/services/point-accrual.service.ts` — earn paths
- `src/services/point-redemption.service.ts` — escrow-based redemption + tier caps
- `src/services/burn-catalogue.service.ts` — catalogue burn redemption
- `src/services/redroom-ledger.service.ts`, `creator-gifting.service.ts`, `affiliate.service.ts`
- `src/integrations/woocommerce/*`, `src/webhooks/*`, `src/services/settlement.service.ts`
- `src/db/models/spend-order-config.model.ts`, `valuation-config.model.ts`, `tier-cap-config.model.ts`

---

## 2. Current-state assessment

### 2.1 What is working (compliant)

- **Append-only ledger entries.** `LedgerService.createEntry` only ever *inserts*
  (`src/ledger/ledger.service.ts:53-164`). There is no update/delete path on
  `LedgerEntryModel`. Corrections are new entries. Invariant tests exist
  (`src/ledger/ledger.service.invariants.spec.ts`: append-only reflection, monotonic
  sequence, balance projection, non-null `correlation_id` + `reason_code`).
- **Idempotency gate.** `claimIdempotency` (`ledger.service.ts:450-474`) uses a unique
  index on `(pointsIdempotencyKey, eventScope)` as a hard single-winner concurrency
  gate. All escrow mutations claim before mutating (`wallet.service.ts:94, 279, 457, 604`).
- **PII guard on metadata.** `createEntry` rejects PII field names and inline email
  patterns (`ledger.service.ts:66-86`).
- **Transaction primitive available.** `withTransaction` / `withTransactionSafety`
  (`ledger.service.ts:518-568`) wraps writes in a Mongoose session when connected to a
  replica set, with a safe standalone fallback for tests. `creditPoints`/`deductPoints`
  use it (`ledger.service.ts:582-670`).
- **Escrow lifecycle is state-guarded.** Hold→settle/refund/partial-settle transitions
  use an intermediate status (`settling`/`refunding`/`partial_settling`) and conditional
  `findOneAndUpdate` to prevent double-processing (`wallet.service.ts:288-309, 466-487`).
- **Tier caps are effective-dated and config-driven.** `validateTierCap`
  (`point-redemption.service.ts:280-306`) requires an active `TierCapConfig` row — no
  platform default (CEO Decision B5). Earn rates likewise (`point-accrual.service.ts:376-404`).
- **WooCommerce webhook signatures verified.** HMAC-SHA256 + timing-safe compare against
  the raw body (`src/integrations/woocommerce/woocommerce-webhook.controller.ts`).

### 2.2 Architecture as-built

Two distinct balance mechanisms coexist:

| Path | Balance source of truth | Used by |
| --- | --- | --- |
| **Mutable-field path** | `WalletModel.availableBalance` / `escrowBalance` and `ModelWalletModel.earnedBalance` (mutated via `$inc`/`$set` + optimistic `version`) | `PointAccrualService.awardPoints` / `deductFromAvailable`, `WalletService` escrow flows |
| **Ledger-derived path** | `getBalanceSnapshot` (reads `balanceAfter` of the latest ledger entry per state) | `LedgerService.creditPoints` / `deductPoints` → `BurnCatalogueService`, WooCommerce earn/refund, `RedRoomLedgerService` |

These two paths do not share a single balance source. This is the root cause of the two
highest-severity findings below.

---

## 3. Findings and risks

Severity: **P0** = points-as-money integrity risk; **P1** = invariant/spec violation; **P2** = boundary/hardening.

### F-1 (P0) — Divergent balance sources of truth (split-brain ledger)

The mutable-field path and the ledger-derived path compute balances from different stores:

- `PointAccrualService.awardPoints` reads/writes `WalletModel.availableBalance` and
  derives `balanceBefore`/`balanceAfter` from it (`point-accrual.service.ts:172-219`).
- `LedgerService.creditPoints`/`deductPoints` ignore `WalletModel` entirely and derive
  balances from `getBalanceSnapshot` (`ledger.service.ts:593-614, 643-668`), which returns
  the **last entry's `balanceAfter`** for the state, not a sum of deltas
  (`ledger.service.ts:309-318`).
- The escrow redemption path checks `WalletService.getUserBalance`, which reads
  `WalletModel.availableBalance` (`wallet.service.ts:814-834`).

**Consequence:** points earned through the ledger path (e.g. WooCommerce orders, RedRoom
compliance awards, catalogue reversals) never increment `WalletModel.availableBalance`, and
points spent through the ledger path (catalogue burns) never decrement it. A member can
therefore (a) be unable to redeem via escrow despite a positive catalogue balance, or
(b) redeem via escrow points that the ledger has already spent. Because `getBalanceSnapshot`
trusts the latest `balanceAfter` rather than summing, interleaving the two paths also
corrupts the ledger's running balance for that account. This breaks the points-as-money
guarantee that one point = one consistent, auditable liability.

**Fix:** pick one source of truth. Recommended: make the ledger authoritative and derive
balances by **summing signed deltas** (not reading `balanceAfter`), then either (a) drop the
mutable `WalletModel` balance fields and treat them as a read-model/cache rebuilt from the
ledger, or (b) route every earn/spend/escrow mutation through a single service that updates
both stores inside one transaction. See task **LCR-1**.

### F-2 (P1) — Three-bucket spend ordering (promo → membership → purchased) not implemented

The invariant requires lot-aware consumption: point-type priority
(promo → membership → purchased) with earliest-expiry-then-FIFO within a type
(spec §6; `SpendOrderConfig.point_type_priority` + `within_type_order`,
`src/db/models/spend-order-config.model.ts:27-28`).

As built, **no redemption path consumes points by lot or bucket**:

- `BurnCatalogueService.redeemItem` calls `ledger.deductPoints` against a single scalar
  available balance (`burn-catalogue.service.ts:224-239`).
- `WalletService.holdInEscrow` decrements one scalar `availableBalance`
  (`wallet.service.ts:140-173`).
- `awardPoints` stores `expiresAt` only in **metadata**, never as a consumable lot
  (`point-accrual.service.ts:215-218`).
- `PointLotModel` was removed (commit #381 "remove unused PointLotModel"), so there is no
  lot store at all. `SpendOrderConfig` is config with no consumer.

**Consequence:** promo/gifted points (short expiry) are not preferentially consumed before
purchased points; per-lot expiry (spec §3) cannot be enforced; `redeemable_points` excluding
ineligible/expired lots (spec §5, §14 `GET /v1/balance`) cannot be computed. This is a direct
violation of the stated spend-ordering invariant. See task **LCR-2**.

### F-3 (P1) — Balance edits and ledger writes are not atomic on the mutable-field path

`PointAccrualService.awardPoints`/`deductFromAvailable` and the `WalletService` escrow flows
update `WalletModel`/`ModelWalletModel` first and then call `createEntry` **without a shared
session** (`point-accrual.service.ts:177-219, 460-501`; `wallet.service.ts:160-225`,
`328-406`). The transaction primitive (`withTransaction`, B-006) exists but these paths do
not use it. The file header even documents the gap (`wallet.service.ts:1-29`).

**Consequence:** if the ledger insert fails after the balance update (or vice versa), balance
and ledger silently diverge — a "silent direct balance edit outside of a transaction," which
the invariant forbids. The partial-settle path explicitly notes an un-rolled-back user-wallet
mutation on a later failure (`wallet.service.ts:706-714`). See task **LCR-3**.

### F-4 (P1) — `getBalanceSnapshot` reads last `balanceAfter` instead of summing deltas

`getBalanceSnapshot` sets `balances[state] = entry.balanceAfter` for the chronologically last
entry (`ledger.service.ts:309-318`). A pure append-only ledger should derive balance by
summing signed `amount` deltas. Trusting a stored snapshot means one incorrect `balanceAfter`
(e.g. from the F-1 cross-path race) silently poisons every subsequent read and the
reconciliation report built on top of it (`ledger.service.ts:341-407`). See task **LCR-4**
(can be folded into LCR-1).

### F-5 (P2) — Domain boundary: loyalty points mixed with financial (earned/settlement) balance

`escrow→earned` settles user loyalty points into `ModelWalletModel.earnedBalance`
(`wallet.service.ts:323-406`), which feeds creator settlement/payouts (AccountFinanceZone) via
`SettlementService`. The same `LedgerEntry` model, `currency: 'points'`, and balance fields
carry both abstract loyalty points and cash-equivalent creator earnings. `ValuationConfig`
(`cents_per_point`) is **not consulted** at settlement, so no point→currency conversion is
recorded on the financial side. `RedRoomLedgerService.awardPointsWithCompliance` further mixes
external compliance gating (GateGuard AV, Welfare Guardian Score) directly into the award path
(`redroom-ledger.service.ts:14-41`).

**Consequence:** the points-as-loyalty vs money/settlement boundary is blurred; liability
reporting (spec §12) and financial reconciliation cannot cleanly separate the two. See task
**LCR-5**.

### F-6 (P2) — WooCommerce webhook idempotency not enforced

`x-wc-webhook-delivery-id` is read but never stored/checked, and processing is
fire-and-forget after an immediate 200 (per integration audit of
`src/integrations/woocommerce/woocommerce.service.ts` / `*-webhook.controller.ts`). Duplicate
deliveries (common on WooCommerce retry) can double-award or double-reverse points. The earn
path also uses a hardcoded `POINTS_PER_DOLLAR` rather than `EarnRateConfig`. See task **LCR-6**.

### F-7 (P2) — Generic webhook verifier fails open when secret is unset

The generic webhook verifier returns `true` when `RRR_WEBHOOK_SECRET` is unconfigured (stub
mode), so unsigned webhooks are accepted in any environment lacking the secret. Should fail
closed in production. See task **LCR-7**.

### F-8 (P2) — Affiliate bonus has no ledger entry / audit trail

`AffiliateService.resolveBonus` computes bonus points in-memory
(`affiliate.service.ts:45-73`) with no dedicated ledger entry tagged
`reason=AFFILIATE_BONUS` + `affiliate_id`, and no idempotency. Historical reconciliation of
affiliate-driven liability is therefore impossible if `bonus_points_pct` changes. See task
**LCR-8**.

### F-9 (P2) — Critical launch features are stubs

`CreatorGiftingService.createPromotion` → `LedgerService.createGiftingPromotion` is a stub
that only logs (`ledger.service.ts:682-693`; `creator-gifting.service.ts`). Model gifting is
the launch-critical feature (spec §8). `creator-gifting-panel.service.ts` returns hardcoded
zero balances. Track as known-incomplete, not a regression. See task **LCR-9**.

---

## 4. Invariant scorecard

| Invariant | Status | Evidence |
| --- | --- | --- |
| Append-only ledger (insert-only, corrections as new entries) | ✅ Pass | `ledger.service.ts:53-164`; invariants spec |
| Balance = derived by summing deltas | ⚠️ Partial | reads last `balanceAfter` (F-4); two stores (F-1) |
| Three-bucket spend ordering (promo → membership → purchased) | ❌ Fail | not implemented; no lot store (F-2) |
| Per-lot expiry + redeemable excludes ineligible lots | ❌ Fail | expiry in metadata only (F-2) |
| No silent/direct balance edits outside transactions | ⚠️ Partial | mutable-field path non-atomic (F-3) |
| Idempotency on all mutating ops | ⚠️ Partial | core ✅; WooCommerce/affiliate gaps (F-6, F-8) |
| Loyalty ↔ financial domain separation | ⚠️ Partial | earned/settlement mixing (F-5) |
| Tier caps & earn rates effective-dated, config-driven | ✅ Pass | `point-redemption.service.ts:280-306`, `point-accrual.service.ts:376-404` |
| Webhook signature verification | ⚠️ Partial | WooCommerce ✅; generic fails open (F-7) |

---

## 5. Test coverage gaps

- **No cross-path consistency test.** Nothing asserts that a ledger-path credit
  (WooCommerce/catalogue) and a mutable-field credit (signup/admin) converge to the same
  balance for one account (F-1). Add an integration test that earns via both paths and asserts
  `getUserBalance` == ledger-derived balance.
- **No spend-ordering tests.** Spec acceptance tests §19.5 (earliest-expiry then FIFO) and §19.4
  (micro top-up near threshold) cannot pass because the behaviour is absent (F-2).
- **No expiry-exclusion test.** `redeemable_points` excluding expired/ineligible lots (spec §5)
  is untested because lots don't exist.
- **No atomicity/fault-injection test.** No test simulates ledger-insert failure after a wallet
  mutation to prove rollback (F-3).
- **No negative-balance paydown test** for the scalar path (spec §7 / §19.6): earn applied to a
  negative balance, redemption blocked while `< 0`.
- **WooCommerce duplicate-delivery test** (same `delivery-id` twice → single award) missing (F-6).
- **Generic webhook fail-closed test** when secret unset (F-7) missing.

---

## 6. Recommended fixes / backlog (small, reviewable tasks)

| ID | Title | Sev | Outline |
| --- | --- | --- | --- |
| **LCR-1** | Unify balance source of truth | P0 | Make the ledger authoritative; derive balance by summing deltas; treat `WalletModel` balances as a ledger-rebuilt read-model **or** route all mutations through one transactional service. Add cross-path convergence test. |
| **LCR-2** | Reintroduce point lots + bucket-ordered consumption | P1 | Reintroduce a lot store; implement consumption honouring `SpendOrderConfig.point_type_priority` (promo→membership→purchased) then `within_type_order` (earliest-expiry/FIFO); compute `redeemable_points` excluding expired/ineligible lots. |
| **LCR-3** | Make wallet+ledger writes atomic | P1 | Wrap `awardPoints`/`deductFromAvailable` and all `WalletService` escrow mutations in `LedgerService.withTransaction`, passing the session to `createEntry`. Add fault-injection rollback test. |
| **LCR-4** | Sum-based `getBalanceSnapshot` | P1 | Derive balances from `Σ amount` per state with a deterministic tie-break; keep `balanceAfter` only as an audit annotation. (Foldable into LCR-1.) |
| **LCR-5** | Separate loyalty vs financial settlement | P2 | Record `ValuationConfig` point→cents conversion at settlement; isolate creator-earnings/settlement from loyalty point liability in reporting; consider distinct reason/account typing. |
| **LCR-6** | WooCommerce webhook idempotency + config earn rate | P2 | Persist + check `x-wc-webhook-delivery-id` before processing; source earn rate from `EarnRateConfig` instead of hardcoded constant. |
| **LCR-7** | Fail closed on missing webhook secret | P2 | Throw when `RRR_WEBHOOK_SECRET` is unset in production; allow stub only behind an explicit non-prod flag. |
| **LCR-8** | Affiliate bonus ledger entry + idempotency | P2 | Emit a dedicated ledger entry (`reason=AFFILIATE_BONUS`, `affiliate_id` in metadata) with an idempotency key for every resolved bonus. |
| **LCR-9** | Complete model gifting (spec §8) | P2 | Replace `createGiftingPromotion` stub with real debit-model-allocation / credit-user-gifted (30-day expiry) transfer; wire `creator-gifting-panel` to real balances. |

Suggested sequencing: **LCR-1 → LCR-4 → LCR-3** (integrity foundation), then **LCR-2**
(spend ordering on top of a trustworthy balance), then the P2 boundary/hardening items.

---

## 7. Compliance health summary

The loyalty engine has a **solid append-only ledger core** — insert-only entries, a real
idempotency gate, PII guards, effective-dated config, and an available transaction primitive.
However, two structural issues prevent it from currently satisfying the points-as-money
invariants:

1. **Split-brain balances (F-1/F-4):** two un-reconciled sources of truth mean the "current
   balance" depends on which code path you ask. This is a P0 integrity risk.
2. **Missing spend ordering & lots (F-2):** the promo → membership → purchased invariant and
   per-lot expiry are not implemented, so several spec acceptance tests cannot pass.

Plus a P1 atomicity gap (F-3) and a set of P2 boundary/hardening items (F-5–F-9).

**Overall: AMBER.** Safe for continued build-out, **not** yet safe to treat point balances as a
reconciled financial liability. Closing LCR-1 through LCR-3 moves the system to GREEN on the
three core invariants.
