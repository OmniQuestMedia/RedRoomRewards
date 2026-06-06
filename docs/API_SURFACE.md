# RedRoomRewards — API Surface Audit

**Generated:** 2026-06-06  
**Baseline tests:** 597 passing  
**Global prefix:** `api/v1` (health routes exempt)

---

## HTTP Endpoints

### Public (no auth required)

| Method | Path                       | Description                                                                  |
| ------ | -------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/health`                  | Combined health summary — DB state + version                                 |
| GET    | `/health/live`             | Liveness probe (always 200 if process is up)                                 |
| GET    | `/health/ready`            | Readiness probe — 200 if DB connected, 503 otherwise                         |
| POST   | `/api/v1/members/signup`   | Member signup with mandatory GateGuard 18+ AV; issues 1,000-pt welcome bonus |
| POST   | `/api/v1/webhooks/receive` | Inbound webhook receiver — HMAC-SHA256 verified via `RRR_WEBHOOK_SECRET`     |

### Auth + Tenant Scoped (JWT required + `tenant_id` claim)

| Method | Path                                           | Description                                                             |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| POST   | `/api/v1/wallet/credit`                        | Credit points to a loyalty account                                      |
| POST   | `/api/v1/wallet/deduct`                        | Deduct points from a loyalty account                                    |
| POST   | `/api/v1/burn/redeem`                          | Burn points for a catalogue item                                        |
| POST   | `/api/v1/burn/gift`                            | Burn points as a creator gift (25% platform commission applied)         |
| POST   | `/api/v1/merchants/awarding-wallet/upload-csv` | Bulk CSV award to creators                                              |
| POST   | `/api/v1/white-label/config`                   | Save white-label brand config for a merchant                            |
| GET    | `/api/v1/white-label/config/:merchantId`       | Retrieve white-label config                                             |
| GET    | `/api/v1/creator/gifting-panel/state`          | Get creator's gifting panel state (promotional balance + recent promos) |
| POST   | `/api/v1/redemptions`                          | Member redeems RRR points against a merchant order (idempotent)         |
| GET    | `/api/v1/redemptions/eligible`                 | Returns available balance + tier-cap metadata for the redemption slider |

### Auth Only (JWT required, no tenant scope)

| Method | Path                                       | Description                                                                    |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------ |
| GET    | `/api/v1/reports/liability`                | Cross-tenant liability report (points issued vs burned)                        |
| POST   | `/api/v1/admin/earn`                       | Award promotional bonus points; requires step-up auth (`step_up: true` in JWT) |
| GET    | `/api/v1/ledger/transactions`              | Paginated ledger transaction history; filterable by date/reason_code           |
| GET    | `/api/v1/ledger/transactions/:entryId`     | Full audit detail for a single ledger entry                                    |
| GET    | `/api/v1/wallets/:userId/escrow/:escrowId` | Single escrow item detail                                                      |

---

## Webhook Events

### Consumed (inbound via `POST /api/v1/webhooks/receive`)

Verified by HMAC-SHA256 signature in `x-webhook-signature` header using
`RRR_WEBHOOK_SECRET`.  
Idempotency enforced via `x-webhook-timestamp` + event ID.

| Event             | Source                          | Action                               |
| ----------------- | ------------------------------- | ------------------------------------ |
| `order.completed` | External merchant / WooCommerce | Earn points for completed order      |
| `order.refunded`  | External merchant / WooCommerce | Reverse earn (append debit record)   |
| Any               | Any                             | DLQ on failure, ACK delivery tracked |

### Published (outbound via `WalletEventPublisher` / internal `EventBus`)

| Event Type                      | Trigger                         |
| ------------------------------- | ------------------------------- |
| `wallet.balance_updated`        | Any credit or debit to a wallet |
| `wallet.escrow_held`            | Funds moved to escrow           |
| `wallet.escrow_settled`         | Escrow settled to model         |
| `wallet.escrow_refunded`        | Escrow refunded to user         |
| `wallet.escrow_partial_settled` | Partial escrow settlement       |
| `ledger.entry_created`          | Every ledger write              |

> NATS transport is not yet wired — the `EventBus` is an in-process pub/sub.
> External NATS topics (`points.earned`, `points.redeemed`, `tier.upgraded`) are
> planned per the roadmap.

---

## Tenant Configuration Structure

Tenants are stored in the `Tenant` Mongoose model
(`src/db/models/tenant.model.ts`).

Current tenants: **ChatNowZone**, **SynthiMatesAi**, **RedRoomPleasures**

White-label config per merchant (`WhiteLabelConfig`):

```ts
{
  merchantId: string;
  brandName: string;
  logoUrl?: string;
  primaryColor: string;
  serviceBureauMode: boolean; // true = RRR-hosted multi-tenant
}
```

Tenant scope is enforced at the middleware layer — all `TENANT_SCOPED_ROUTES`
require a `tenant_id` JWT claim, injected onto `req.tenantId` by
`TenantScopeMiddleware`.

---

## Point Earn Mechanics (as implemented)

| Trigger                      | Points Awarded            | Bucket            | Notes                                        |
| ---------------------------- | ------------------------- | ----------------- | -------------------------------------------- |
| Signup welcome bonus         | 1,000                     | Promotional Bonus | Spec-locked (F-008)                          |
| Admin `POST /admin/earn`     | Variable                  | Promotional Bonus | Step-up auth required                        |
| `POST /api/v1/wallet/credit` | Variable                  | Per request       | Tenant-scoped                                |
| CSV bulk upload              | Variable per row          | Per row reason    | Merchant admin                               |
| Creator gifting gift         | Token value (model earns) | Earned            | 25% platform commission deducted from sender |

### Tier Thresholds (CEO Decision D3 — immutable)

| Tier          | Min Points | Earning Multiplier |
| ------------- | ---------- | ------------------ |
| RED_DESIRE    | 0          | 1.0×               |
| RED_PASSION   | 5,000      | (configured)       |
| RED_OBSESSION | 25,000     | (configured)       |
| RED_REIGN     | 100,000    | (configured)       |

---

## Point Burn Mechanics (as implemented)

| Trigger                    | Points Deducted                          | Notes                                                                         |
| -------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| `POST /api/v1/burn/redeem` | `pointsSpent` (must be positive integer) | Routes through `RedRoomLedgerService`; reason*code: `BURN*<itemId>\_<reason>` |
| `POST /api/v1/burn/gift`   | `tokenValue + 25% commission`            | reason*code: `GIFT*<giftId>[_ANON]`                                           |
| `POST /api/v1/redemptions` | `redemptionAmount`                       | Tier-cap enforced; idempotent via `idempotencyKey`                            |

All burns are **append-only debit records** — original earn records are never
deleted or modified.

---

## Required Environment Variables

| Variable                       | Required     | Description                                                       |
| ------------------------------ | ------------ | ----------------------------------------------------------------- |
| `NODE_ENV`                     | Yes          | `development` \| `test` \| `production`                           |
| `MONGODB_URI`                  | Yes          | MongoDB connection string (replica set required for transactions) |
| `DATABASE_URL`                 | Yes          | Same as `MONGODB_URI` (alias for Payload #11 clients)             |
| `JWT_SECRET`                   | **REQUIRED** | JWT signing secret (min 32 chars)                                 |
| `QUEUE_AUTH_SECRET`            | **REQUIRED** | Queue/settlement auth token secret (min 32 chars)                 |
| `RRR_WEBHOOK_SECRET`           | **REQUIRED** | Inbound webhook HMAC verification secret (min 32 chars)           |
| `PORT`                         | No           | Service port (default: 3000)                                      |
| `TOKEN_EXPIRY_SECONDS`         | No           | JWT expiry in seconds (default: 900)                              |
| `LOG_LEVEL`                    | No           | `debug` \| `info` \| `warn` \| `error` (default: info)            |
| `LOG_FORMAT`                   | No           | `json` (default)                                                  |
| `RATE_LIMIT_PER_MINUTE`        | No           | General rate limit per IP (default: 100)                          |
| `SIGNUP_RATE_LIMIT_PER_MINUTE` | No           | Signup rate limit per IP (default: 5)                             |
| `CORS_ORIGINS`                 | No           | Comma-separated allowed origins                                   |
| `GATEGUARD_AV_API_KEY`         | Yes (prod)   | GateGuard Sentinel 18+ AV API key                                 |
| `GATEGUARD_AV_ENDPOINT`        | Yes (prod)   | GateGuard API endpoint URL                                        |
| `SERVICE_BUREAU_ENABLED`       | No           | `true` = multi-tenant hosted mode (default: true)                 |
| `DEBUG_MODE`                   | No           | Never `true` in production                                        |
| `VERBOSE_LOGGING`              | No           | Never `true` in production                                        |

---

## Test Coverage Summary

**Suite:** Jest + ts-jest  
**Total tests:** 597 passing, 0 failing  
**Test suites:** 64

| Area             | Test Files                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger service   | `ledger.service.spec.ts`, `ledger.service.invariants.spec.ts`, `ledger.service.comprehensive.spec.ts`, `ledger-credit-deduct.spec.ts`                             |
| Wallet service   | `wallet.service.comprehensive.spec.ts`, `wallet.service.concurrency.spec.ts`, `escrow-race-conditions.spec.ts`                                                    |
| Member service   | `member.service.spec.ts`                                                                                                                                          |
| Burn catalog     | `burn-catalog.spec.ts`                                                                                                                                            |
| Redemption       | `redemption.service.spec.ts`                                                                                                                                      |
| Admin earn       | `admin-earn.service.spec.ts`                                                                                                                                      |
| Tier engine      | `tier-engine.spec.ts`                                                                                                                                             |
| Auth service     | `auth.service.spec.ts`                                                                                                                                            |
| Fraud/welfare    | `fraud-signal.service.spec.ts`, `welfare-guardian-score.spec.ts`                                                                                                  |
| Point accrual    | `point-accrual.service.spec.ts`, `point-accrual-retry.spec.ts`                                                                                                    |
| Point expiration | `point-expiration.service.comprehensive.spec.ts`                                                                                                                  |
| Point redemption | `point-redemption.service.spec.ts`                                                                                                                                |
| Settlement       | `settlement.service.spec.ts`                                                                                                                                      |
| Reconciliation   | `reconciliation.service.spec.ts`                                                                                                                                  |
| Webhooks         | `webhook-receive.service.spec.ts`                                                                                                                                 |
| Middleware       | `auth.middleware.spec.ts`, `rate-limit.middleware.spec.ts`, `signup-rate-limit.middleware.spec.ts`, `tenant-scope.middleware.spec.ts`                             |
| Models           | `LoyaltyAccount.spec.ts`, `Merchant.spec.ts`, `Tenant.spec.ts`, `IdentityLink.spec.ts`, `ledger-entry.immutability.spec.ts`, `merchant-pair-config.model.spec.ts` |
| Health           | `health.controller.spec.ts`                                                                                                                                       |
| Config/env       | `validate-env.spec.ts`                                                                                                                                            |
| E2E              | `reservation.e2e.spec.ts`, `security-wiring.spec.ts`                                                                                                              |
| Security         | `security.test.ts`                                                                                                                                                |
| OpenAPI          | `openapi.spec.ts`                                                                                                                                                 |
| ZK oracle        | `zk-oracle.service.spec.ts`                                                                                                                                       |

**Notable invariants tested:**

- Ledger entries are immutable after creation
- Negative balances are rejected
- Idempotency keys prevent duplicate transactions
- Tier-cap enforcement on redemptions
- Step-up auth enforcement on admin earn
- HMAC signature verification on webhooks
- GateGuard AV mandatory on all member actions
