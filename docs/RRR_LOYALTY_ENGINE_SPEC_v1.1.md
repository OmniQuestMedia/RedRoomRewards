# RedRoomRewards Loyalty Engine Specification (XXXChatNow Launch)

Owner: OmniQuest Media Inc.  
Primary Launch Tenant: XXXChatNow.com  
Planned Expansion: RedRoomRewards network plus third-party tenants (target 12 to 18 months after launch)

---

## 1) Objectives and scope

### Program goals
- Launch the first branded loyalty rewards points program in adult entertainment on XXXChatNow.
- Increase retention, repeat token-pack purchases, and VIP tier progression.
- Enable model-driven loyalty: models receive monthly point allocations and gift points to fans in-stream.
- Provide near real-time balances and deterministic, auditable earn and redeem decisions.

### Product scope
- All product types are in scope for eligibility, but earning and redemption eligibility is configurable per product, per action, per tier, and per time window.
- Launch priority: token pack purchases and points redemption against token pack purchases.

---

## 2) Actors, roles, tiers, identities

### Roles
- Consumer User: earns points and can redeem points subject to configuration.
- Model: receives point allocations and can gift points to users; model does not redeem points.
- Admin: full configuration and adjustment authority.

### Tiers (confirmed)
- Guest
- Member
- VIP Bronze
- VIP Silver
- VIP Gold

Tier policies must be configured via effective-dated tables, no hard-coded caps or rates.

### Identity linking
- One loyalty account can link multiple XXXChatNow usernames.
- Engine must resolve: loyalty_account_id ⇄ {tenant_id, site_username}, role, current tier.

---

## 3) Wallets, balances, point types

### Wallets
- Consumer Points Wallet: redeemable point balance for users.
- Model Allocation Wallet: non-redeemable balance for models intended solely for gifting to users.

No cash wallet. Tokens remain outside RRR.

### Point types and expiry rules
The engine must track points as lots (award batches) to support expiry ordering and audit.

1) Purchase-earned points (Consumer)
- Awarded after confirmed payment.
- Expiry: 1 year from award time.
- Earn calculation: before taxes, after discounts.

2) Promotional points (Consumer)
- Awarded via promotions.
- Expiry: per promotion (commonly 30 to 45 days).

3) Model allocation points (Model)
- Awarded monthly based on prior pay period net earnings and admin grants.
- Expiry: end-of-month in model wallet.
- Intended to be gifted.

4) Gifted-to-user points (Consumer)
- Created when a model gifts points to a user.
- Expiry: 30 days from gift time.

### Chargebacks and reversals
- Chargebacks reverse earned points from the underlying purchase.
- If clawback of redeemed value fails, negative balances are allowed (see Section 7).

---

## 4) Baseline earn rules (confirmed)

### Default earn rate (effective-dated, admin-configurable)
- 12 points per $1.00 USD spent
- Basis: order subtotal after discounts, before taxes and fees

No points earned on:
- taxes
- processing fees
- chargebacks

Points posting:
- Near instant after payment confirmation is preferred.
- Max acceptable delay: 24 hours.

---

## 5) Redemption valuation and thresholds (confirmed)

### Valuation (effective-dated, admin-configurable)
- 1000 points = $1.00 USD discount value
- Minimum redemption threshold: 5000 points = $5.00 USD

Valuation formula:
- discount_value_usd = points_redeemed / 1000

### Tier redemption caps (effective-dated)
- max_discount_percent is configurable per tier with effective dates.
- Caps are applied to order subtotal after discounts, before taxes.

Redemption must never create a negative balance under normal conditions.
Negative balances only occur through reversals or clawback failure.

---

## 6) Spend ordering: consume points that expire first (confirmed)

When redeeming points, the engine MUST consume points in this order:
1) Earliest expiry date first
2) If same expiry, FIFO by award timestamp

Only consume lots that are eligible for redemption.

This ensures micro top-up points from today are spent before micro top-up points from tomorrow.

---

## 7) Negative balance behavior (confirmed)

### When negative balances occur
- Only via reversals, chargebacks, fraud remediation, or clawback failures.

### Automatic paydown (confirmed)
If points_balance < 0 and the user earns points:
- earned points are applied to reduce the negative balance first
- redemption is not available until balance >= 0 and minimum redemption is met

Recommended default:
- block redemption while balance < 0

---

## 8) Model gifting (critical feature)

### UX requirement (XXXChatNow)
In the model dashboard:
- Model sees points available to award.
- Model selects a viewer currently in the stream.
- Model enters points amount and confirms.

### Engine requirements
- Validate model has sufficient allocation balance.
- Transfer points:
  - debit model allocation wallet
  - credit user wallet as gifted-to-user points (30-day expiry)
- Must be idempotent and auditable.
- Must support stream context metadata.

---

## 9) Promotions and multipliers

### Supported promo types
- Bonus points: example, renew gold membership and receive 500 points.
- Earn multiplier: example, weekend 2 points per $1.
- Tier multipliers: tier-specific earn multipliers.
- Model segment multipliers: example, Pride week model multiplier 1.5 points per $1 earned (for next allocation).
- Admin grants: contests, birthdays, special events.

### Promo configuration requirements
- Start and end date and time, scheduled in Eastern Time.
- Segmentation: tier, role, country, tags, birthday window, other profile fields.
- Caps: per-user, per-day, total budget, first purchase only, renewal only.
- Promo point expiry policy per promo.

### Precedence rule (confirmed)
If multiple promos apply, select the promo that yields the most value to the user.
Tie-break must be deterministic (configured rule, then earliest end time, then promo id).

---

## 10) Micro top-up (moment utility) (confirmed)

Micro top-up exists to unblock redemption when the user is within a few points of a threshold.
It is not positioned as savings.

### Trigger condition
Show micro top-up popup only when:
- user attempts redemption, and
- user is below the next threshold, and
- shortfall_to_next_threshold_points <= near_threshold_window_points

Default:
- near_threshold_window_points = 5

### Threshold list
Default thresholds:
- 5000
- 10000
Admin may extend the list.

### Offer bundle options (effective-dated)
Provide exactly these options in the popup:

Option A
- 250 points at $0.011 per point
- price: $2.75

Option B
- 500 points at $0.010 per point
- price: $5.00

Rules:
- Only shown in the near-threshold popup, not a general points store.
- Overshoot is allowed, leftover points remain on account.
- Micro top-up points expire in 1 year and follow the spend ordering rules (earliest expiry then FIFO).

### Example acceptance scenario
- User has 4995 points, threshold 5000, shortfall 5
- Popup appears with 250 and 500 options
- User buys 250
- New balance 5245
- User redeems 5000 for $5
- Remaining 245 points stay on account

---

## 11) Admin capabilities (must-have)

Admins can:
- Configure tiers, earn multipliers, redemption caps, and valuation tables with effective dates.
- Configure product eligibility and action eligibility for earning and redemption.
- Create promotions with scheduling, segmentation, caps, and expiry rules.
- Set model allocation rules and apply monthly allocations.
- Grant, deduct, freeze, lock, and merge accounts with reason codes.
- View full audit trails and export CSV reports.
- Monitor liabilities in near real time.

---

## 12) Liability reporting (must-have)

Provide near real-time liability reporting for:
- outstanding points by tenant and total
- breakdown by point type and expiry buckets
- equivalent USD value using active valuation configuration

Liability value:
- liability_usd = outstanding_points / 1000

---

## 13) Data model (recommended)

### Core tables

LoyaltyAccount
- loyalty_account_id (pk)
- created_at
- status (active, locked, frozen)

IdentityLink
- loyalty_account_id
- tenant_id
- site_username
- role (user, model, admin)
- tier (Guest, Member, VIP Bronze, VIP Silver, VIP Gold)
- effective_at
- last_seen_at

Wallet
- wallet_id (pk)
- loyalty_account_id
- wallet_type (consumer_points, model_allocation)
- current_balance_points (can be negative for consumer_points)

PointLot
- lot_id (pk)
- wallet_id
- point_type (purchase, promo, gifted, model_allocation)
- points_awarded
- points_remaining
- awarded_at
- expires_at
- source_event_id
- promo_id nullable

LedgerEntry (append-only)
- ledger_id (pk)
- tenant_id
- correlation_id
- idempotency_key
- event_type (earn, redeem_reserve, redeem_commit, redeem_release, reverse, gift, allocation, adjustment, micro_topup_purchase)
- wallet_id
- points_delta
- lot_id nullable
- reason_code
- created_at
- metadata json (ip, country, device, model_name, stream_id, order_id, etc.)

### Config tables (effective-dated)

ValuationConfig
- tenant_id
- currency
- points_per_usd (default 1000)
- min_redemption_points (default 5000)
- effective_start_at (ET)
- effective_end_at (ET, nullable)

EarnRateConfig
- tenant_id
- points_per_usd_spend (default 12)
- applies_to (product ids or action types)
- effective_start_at
- effective_end_at

TierCapConfig
- tenant_id
- tier
- max_discount_percent
- effective_start_at
- effective_end_at

MicroTopupConfig
- tenant_id
- enabled
- near_threshold_window_points (default 5)
- threshold_points_list (default 5000, 10000)
- bundle_options json (250@$0.011, 500@$0.010)
- effective_start_at
- effective_end_at

SpendOrderConfig
- tenant_id
- strategy (EARLIEST_EXPIRY_THEN_FIFO)
- effective_start_at
- effective_end_at

---

## 14) API surface (tenant-aware)

All endpoints require:
- tenant_id
- correlation_id
- idempotency_key for all mutating operations
- signed requests and signed webhooks

### Balances
GET /v1/balance?tenant_id=...&loyalty_account_id=...
Returns:
- current_balance_points
- redeemable_points (after excluding ineligible lots and if balance negative)
- breakdown by point_type and expiry buckets

### Checkout quote
POST /v1/checkout/quote
Request:
- tenant_id
- loyalty_account_id
- tier
- order_subtotal_usd (after discounts, before tax)
- cart_context (product ids, quantities)
- attempted_redeem (boolean)

Response:
- active_valuation: points_per_usd, min_redemption_points
- active_tier_cap: max_discount_percent
- current_balance_points
- redeemable_points
- next_threshold_points
- shortfall_to_next_threshold_points
- micro_topup_eligible
- micro_topup_bundle_options [{points, price_per_point_usd, bundle_price_usd}]
- max_discount_usd_by_cap
- max_redeemable_points_for_order
- min_redemption_eligible (boolean)

### Redemption reserve
POST /v1/checkout/reserve
Request:
- tenant_id
- loyalty_account_id
- points_to_reserve
- order_id
Response:
- reservation_id
- reserved_points
- expires_at

### Redemption commit
POST /v1/checkout/commit
Request:
- tenant_id
- reservation_id
- order_id
- payment_status (success)
Response:
- committed_points
- discount_value_usd
- lot_consumption_breakdown [{lot_id, expires_at, points_consumed}]

### Redemption release
POST /v1/checkout/release
Request:
- tenant_id
- reservation_id
- order_id
- reason
Response:
- released_points

### Earn
POST /v1/earn
Request:
- tenant_id
- loyalty_account_id
- order_id
- confirmed_amount_usd (subtotal after discounts, before taxes)
- source (payment_confirmed)
- promo_context optional
Response:
- points_awarded
- posting_mode (immediate or async)

### Reverse (refund or chargeback)
POST /v1/reverse
Request:
- tenant_id
- loyalty_account_id
- order_id
- reverse_points_amount
- attempt_clawback (boolean)
Response:
- new_balance_points (may be negative)

### Model gifting
POST /v1/model/gift
Request:
- tenant_id
- model_loyalty_account_id
- target_loyalty_account_id
- points
- stream_context
Response:
- transfer_id
- model_remaining_points
- user_new_balance_points

### Admin controls
POST /v1/admin/promotions
POST /v1/admin/tiers
POST /v1/admin/allocations/models
POST /v1/admin/adjustments
All require role-based authorization and full audit metadata.

---

## 15) Security, fraud, and abuse controls (baseline)

- All webhook payloads signed, replay-protected.
- All mutating calls idempotent.
- Rate limits by account and IP for gifting, redemption, micro top-ups.
- Lock triggers: multiple IPs redeeming from one account, velocity anomalies, chargeback patterns.
- Account lock workflow integrated with support tooling.

---

## 16) Audit trail requirements (must-have)

Every wallet mutation must record:
- loyalty_account_id, tenant_id, linked username(s)
- role and tier at time of event
- event type and reason code
- promo_id if relevant
- model_name and stream context for gifts
- timestamp, IP, country, device fingerprint (if available)
- correlation_id and idempotency_key

Ledger is append-only. Corrections are new entries.

---

## 17) Reporting requirements

Minimum required exports:
- CSV exports for points issued, redeemed, expired, outstanding liability
- promo performance
- tier migration
- fraud and lock queue

Preferred:
- live dashboards for liability and key KPIs

---

## 18) Non-functional requirements

- Checkout quote and reserve must be low-latency.
- Points earn posting can be async up to 24 hours.
- Data retention:
  - hot storage: 90 days
  - archived ice storage: 7 years

Recommended baseline reliability targets:
- 99.9% monthly uptime for core APIs
- RPO in minutes, RTO under 1 hour for critical services

---

## 19) Acceptance tests (must pass)

1) Earn baseline
- Given subtotal $10.00 USD, no promo, earn rate 12 points per $1
- Award 120 points, expiry 1 year

2) Minimum redemption and valuation
- Given 5000 points, redeem yields $5.00 discount
- Below 5000 points cannot redeem

3) Tier cap application
- Given cap percent for tier, quote returns max redeemable points constrained by cap

4) Micro top-up near threshold
- Given 4995 points and threshold 5000, shortfall 5
- Popup offers 250@$0.011 and 500@$0.010
- Purchase 250, then redeem 5000, remaining 245 stays

5) Spend ordering
- Two micro top-ups on consecutive days
- Redemption consumes earlier-expiring lot first, then FIFO on ties

6) Negative balance paydown
- Chargeback creates balance -300
- Next earn awards 120
- New balance becomes -180, no redemption available until >= 0

7) Model gifting
- Model allocation debits correctly
- User receives gifted points with 30-day expiry
- Full audit metadata is recorded
