# DOMAIN GLOSSARY — RedRoomRewards

**Authority:** Kevin B. Hartley, CEO — OmniQuest Media Inc. **Repo:**
OmniQuestMedia/RedRoomRewards **Last updated:** 2026-05-03

This file is the canonical naming authority for all code, comments,
documentation, and identifiers in the RedRoomRewards codebase. Agents must check
this file before naming any domain concept. If a required term is absent:
HARD_STOP and raise a naming question to Program Control. Do not invent terms.

HOW TO USE:

- Exact casing is required in all code, comments, and docs
- Database identifiers use snake_case equivalents
- Terms marked RETIRED must not appear in any new code
- If you see a RETIRED term in existing code, flag it in your report-back

---

## PLATFORM

| Term                 | Definition                             | Code identifier            |
| -------------------- | -------------------------------------- | -------------------------- |
| RedRoomRewards       | OQMInc SaaS loyalty and rewards engine | RedRoomRewards, RRR        |
| RRR                  | RedRoomRewards abbreviation            | RRR                        |
| OmniQuest Media Inc. | Parent company                         | OmniQuestMedia, OQMI       |
| ChatNow.Zone         | Primary merchant tenant                | ChatNow.Zone, chatnow_zone |
| RedRoomPleasures     | Merchant tenant (Phase 1)              | RedRoomPleasures           |
| Cyrano               | Merchant tenant (Phase 1)              | Cyrano                     |

---

## USERS AND ROLES

| Term               | Definition                                              | Code identifier                        |
| ------------------ | ------------------------------------------------------- | -------------------------------------- |
| Members            | RRR loyalty program participants (consumers)            | members, member_id, loyalty_account_id |
| Guests             | Consumers on connected merchant platforms               | guests, guest_id                       |
| Models             | Content creators on connected platforms                 | models, model_id                       |
| Operators / Admins | Administrative users with elevated access               | operators, admin                       |
| Merchants          | Platform tenants using RRR as SaaS                      | merchants, tenant_id                   |
| RRR Account Rep    | OQMInc staff who authorize merchant program activations | rrr_account_rep                        |

---

## LOYALTY ECONOMY

| Term                    | Definition                                                    | Code identifier         |
| ----------------------- | ------------------------------------------------------------- | ----------------------- |
| RRR Points              | Loyalty currency awarded to members                           | rrr_points, points      |
| Earn event              | Action that awards points to a member                         | earn_event              |
| Redemption              | Application of points to reduce purchase cost                 | redemption              |
| PointLot                | Individual award batch with its own expiry                    | point_lot, lot_id       |
| Wallet                  | Current point balance record for a member                     | wallet, wallet_id       |
| Consumer Points Wallet  | Member wallet for redeemable points                           | consumer_points         |
| Model Allocation Wallet | Non-redeemable balance for models to gift                     | model_allocation        |
| LedgerEntry             | Immutable append-only record of one point movement            | ledger_entry, ledger_id |
| Idempotency key         | Unique key preventing duplicate transactions                  | idempotency_key         |
| Escrow                  | Points held pending confirmation of an event                  | escrow, escrow_item     |
| Correlation ID          | Tracing identifier linking related operations                 | correlation_id          |
| Reason code             | Audit code classifying why a ledger entry was created         | reason_code             |
| Spend ordering          | EARLIEST_EXPIRY_THEN_FIFO consumption rule                    | spend_ordering          |
| Micro top-up            | Small point purchase to unblock a redemption threshold        | micro_topup             |
| Model gifting           | Transfer of points from a model allocation wallet to a member | model_gift              |

---

## MERCHANT CONFIGURATION

| Term                   | Definition                                                                | Code identifier                      |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------ |
| Earn rate              | Points awarded per $1.00 USD spent (default 12)                           | earn_rate, points_per_usd_spend      |
| Redemption cap         | Maximum percentage of order value redeemable in points, by tier           | max_discount_percent                 |
| Valuation              | Points-to-USD conversion rate (default 1000 pts = $1.00)                  | valuation, points_per_usd            |
| Effective-dated config | Configuration with a start/end date, replacing prior config on activation | effective_start_at, effective_end_at |
| Merchant tier          | Merchant-defined membership level for their customers                     | merchant_tier                        |
| RRR member tier        | Cross-merchant loyalty level (future — architecture must support)         | rrr_member_tier                      |
| Inferno multiplier     | Earn rate multiplier for qualifying Room-Heat Inferno sessions            | inferno_multiplier                   |
| Standard template      | Pre-built earn/burn configuration merchants select                        | standard_template                    |
| Custom template        | Merchant-configured earn/burn program requiring RRR rep authorization     | custom_template                      |

---

## FINANCIAL AND COMPLIANCE

| Term                      | Definition                                                                      | Code identifier                 |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------- |
| Append-only ledger        | Ledger where entries are written once and never modified                        | append_only                     |
| Compensating transaction  | Corrective ledger entry that offsets a prior entry                              | REVERSAL, reason_code: REVERSAL |
| Chargeback reversal       | Points clawback triggered by a payment chargeback                               | CHARGEBACK_REVERSAL             |
| Negative balance          | Allowed only via reversal, chargeback, or clawback failure                      | negative_balance                |
| Liability                 | Outstanding unredeemed points expressed as USD equivalent                       | liability_usd                   |
| Cross-merchant redemption | Redeeming points earned at one merchant at a different merchant                 | cross_merchant                  |
| Exchange rate             | Conversion factor between merchants for cross-merchant redemption (default 1:1) | cross_merchant_exchange_rate    |
| FIZ                       | Financial Integrity Zone — all ledger, wallet, escrow, and payout code paths    | FIZ                             |

---

## AUTH AND TRANSPORT

These terms are canonical for service-to-service traffic between RRR and
merchant tenants. The full contract lives in
[`docs/AUTH_CONTRACT.md`](./AUTH_CONTRACT.md). See also
`src/middleware/auth.middleware.ts` for the JWT (user-bound) leg and
`src/webhooks/webhook-receive.service.ts` for the live HMAC receive path.

| Term                       | Definition                                                                   | Code identifier                    |
| -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- |
| HMAC envelope              | Per-tenant HMAC-SHA256 signing scheme for service-to-service requests        | hmac, X-RRR-Signature              |
| `tenant_id`                | Public per-merchant identifier; appears in headers and webhook payloads      | tenant_id, X-RRR-Tenant            |
| `api_key_id`               | Public identifier for the active per-tenant key being used to sign           | api_key_id, X-RRR-Key-Id           |
| `api_secret`               | 256-bit per-tenant secret; never logged, never echoed                        | api_secret                         |
| Replay window              | ±5 minute timestamp drift allowance (target spec; enforced post-Alpha)       | replay_window                      |
| Nonce                      | Per-request opaque UUIDv4; (tenant, nonce) tuple is single-use within window | nonce, X-RRR-Nonce                 |
| Canonical signing string   | 5-line target: `METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256_HEX(body)`            | canonical, signing_string          |
| Idempotency key            | Per-tenant UUID that makes a state-changing call safe to retry               | idempotency_key, X-Idempotency-Key |
| Request ID                 | Per-request opaque trace identifier; safe to surface to integrators          | request_id, X-Request-ID           |
| Step-up auth               | Operator-only authentication tier required for awarding-wallet admin paths   | step_up, step_up_required          |
| Bearer JWT                 | Keycloak-issued user-bound token consumed by `AuthMiddleware`                | bearer, jwt, jsonwebtoken          |
| `AUTH_REQUIRED`            | 401 reason code: a required auth header is missing                           | AUTH_REQUIRED                      |
| `AUTH_INVALID`             | 401 reason code: signature, timestamp, nonce, or key was rejected            | AUTH_INVALID                       |
| `IDEMPOTENCY_KEY_MISMATCH` | 400 reason code: same idempotency key reused with a different payload        | IDEMPOTENCY_KEY_MISMATCH           |
| `TENANT_SCOPE_VIOLATION`   | 403 reason code: cross-tenant resource access attempted                      | TENANT_SCOPE_VIOLATION             |

---

## COMMIT PREFIXES

| Prefix | Scope                                                             |
| ------ | ----------------------------------------------------------------- |
| FIZ:   | Financial Integrity Zone — ledger, wallet, escrow, point balances |
| DB:    | Schema and MongoDB model changes                                  |
| API:   | Controller and endpoint changes                                   |
| SVC:   | Service layer changes                                             |
| INFRA: | Docker, config, environment, CI                                   |
| UI:    | Frontend surfaces — merchant portal, consumer portal              |
| GOV:   | Governance, compliance, security                                  |
| TEST:  | Test files only                                                   |
| CHORE: | Tooling, maintenance, documentation, renaming                     |

FIZ-scoped commits require REASON:, IMPACT:, CORRELATION_ID: in the commit body.

---

_This glossary is the naming authority. To add a term: CEO authorization
required._ _File a CHORE: commit with reason in the commit message._
