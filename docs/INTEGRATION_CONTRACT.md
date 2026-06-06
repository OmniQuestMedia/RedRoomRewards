# RedRoomRewards — Integration Contract

**Version:** 1.0  
**Owner:** OmniQuest Media Inc. — Architecture Team  
**Last updated:** 2026-06-06  
**Base URL:** `https://api.redroomrewards.omniquestmedia.com/api/v1`  
**Data residency:** Canada — ca-central-1 (Toronto)

---

## 1. Authentication

### 1a. Member / Platform JWT (Bearer)

All non-public endpoints require a Bearer JWT minted by **AccountsZone**.

```
Authorization: Bearer <jwt>
```

JWT payload must include:

- `sub` — user ID
- `tenant_id` — tenant identifier (required on TENANT_SCOPED routes)
- `step_up: true` — required on admin earn endpoints

JWT is verified with `JWT_SECRET` (HS256). Minimum 32-char secret.

### 1b. Service-to-Service HMAC-SHA256

Platform services calling RRR from the server side sign requests with
HMAC-SHA256.

**Algorithm:** HMAC-SHA256  
**Shared secret env var:** `RRR_WEBHOOK_SECRET` (inbound) or per-integration
secret  
**Encoding:** base64

**Signing example (TypeScript):**

```ts
import { createHmac } from 'crypto';

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64');
}

// Attach to outbound request:
const signature = sign(JSON.stringify(body), process.env.RRR_WEBHOOK_SECRET);
headers['x-webhook-signature'] = signature;
headers['x-webhook-timestamp'] = Date.now().toString();
```

**Verification:** RRR verifies using `timingSafeEqual` to prevent timing
attacks.

---

## 2. Tenant Onboarding

To add a new merchant tenant:

1. Insert a `Tenant` document into MongoDB:

   ```json
   {
     "tenant_id": "your-tenant-slug",
     "name": "Merchant Display Name",
     "status": "active"
   }
   ```

2. Configure the white-label brand:

   ```
   POST /api/v1/white-label/config
   Authorization: Bearer <admin-jwt>
   Content-Type: application/json

   {
     "merchantId": "your-tenant-slug",
     "brandName": "Merchant Display Name",
     "logoUrl": "https://cdn.example.com/logo.png",
     "primaryColor": "#C0392B",
     "serviceBureauMode": true
   }
   ```

3. Share the `JWT_SECRET` with AccountsZone so the IdP can mint tokens with
   `tenant_id` claim.

4. For WooCommerce tenants: generate and set `WOOCOMMERCE_WEBHOOK_SECRET` in
   both this service and the WooCommerce webhook settings.

---

## 3. Endpoint Reference

### 3a. Member Signup

**POST /api/v1/members/signup**  
Auth: None (public)

```json
// Request
{
  "email": "member@example.com",
  "billingAddress": { ... }
}

// Response 201
{
  "memberId": "rr-uuid",
  "tier": "RED_DESIRE",
  "totalPoints": 1000,
  "promotionalBalance": 1000,
  "verifiedAt": "2026-06-06T09:00:00.000Z"
}
```

> GateGuard 18+ AV is mandatory. Signup is blocked if verification fails.

---

### 3b. Point Earn — Credit Points

**POST /api/v1/wallet/credit**  
Auth: Bearer JWT + `tenant_id` claim

```json
// Request
{
  "accountId": "rr-uuid",
  "amount": 150,
  "reason": "Purchase #WC-1001",
  "idempotencyKey": "unique-key-per-operation",
  "source": "WOOCOMMERCE"
}

// Response 200
{
  "ok": true
}
```

---

### 3c. Point Earn — Member-specific Earn Event

**POST /api/v1/members/:id/earn** _(planned — use `/wallet/credit` today)_

Body:

```json
{
  "tenantId": "redroompleasures",
  "points": 150,
  "orderId": "WC-1001",
  "description": "WooCommerce order earn",
  "correlationId": "uuid"
}
```

---

### 3d. Point Burn — Redeem Catalogue Item

**POST /api/v1/catalogue/redeem**  
Auth: Bearer JWT + `tenant_id` claim

```json
// Request
{
  "itemId": "catalogue-item-uuid"
}

// Response 201
{
  "redemptionId": "uuid",
  "redemptionCode": "RRR-REDR-ABCDEF123456",
  "pointsSpent": 500,
  "itemTitle": "10% Off Coupon"
}
```

---

### 3e. Point Burn — Legacy Direct Burn

**POST /api/v1/burn/redeem**  
Auth: Bearer JWT + `tenant_id` claim

```json
// Request
{
  "memberId": "rr-uuid",
  "itemId": "product-sku",
  "pointsSpent": 500,
  "reason": "product-discount"
}

// Response 200
true
```

---

### 3f. Redemption Eligibility Check

**GET /api/v1/redemptions/eligible**  
Auth: Bearer JWT + `tenant_id` claim

```
?merchantId=your-merchant&transactionValue=100.00&tierName=RED_PASSION
```

```json
// Response 200
{
  "availableBalance": 3500,
  "maxRedeemable": 1750,
  "tierCapPct": 50,
  "tierName": "RED_PASSION"
}
```

---

### 3g. Admin — Award Promotional Points

**POST /api/v1/admin/earn**  
Auth: Bearer JWT (must carry `step_up: true`)

```json
// Request
{
  "recipientId": "rr-uuid",
  "recipientType": "member",
  "amount": 500,
  "reasonCode": "PROMO_BONUS",
  "walletBucket": "promotional_bonus",
  "merchantId": "your-tenant-slug",
  "idempotencyKey": "unique-key"
}

// Response 201
{
  "ok": true,
  "ledgerEntryId": "uuid",
  "newBalance": 1500
}
```

---

### 3h. Burn Catalogue — Browse

**GET /api/v1/catalogue**  
Auth: Bearer JWT + `tenant_id` claim

```
?page=1&limit=20&redemption_type=DISCOUNT_CODE&max_points_cost=1000
```

```json
// Response 200
{
  "items": [
    {
      "item_id": "uuid",
      "tenant_id": "redroompleasures",
      "title": "10% Off Coupon",
      "description": "Get 10% off your next order",
      "points_cost": 500,
      "inventory_count": 100,
      "redemption_type": "DISCOUNT_CODE",
      "redemption_value": { "discount_pct": 10 },
      "is_active": true,
      "valid_until": "2026-12-31T23:59:59.000Z"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

---

### 3i. WooCommerce Webhook

**POST /api/v1/integrations/woocommerce/webhook**  
Auth: HMAC-SHA256 via `x-wc-webhook-signature` header  
Secret env var: `WOOCOMMERCE_WEBHOOK_SECRET`

**Headers:**

```
x-wc-webhook-topic: order.completed
x-wc-webhook-signature: <base64-hmac-sha256>
x-wc-webhook-delivery-id: <wc-delivery-uuid>
Content-Type: application/json
```

**Body (WooCommerce order object):**

```json
{
  "id": 1001,
  "number": "1001",
  "status": "completed",
  "total": "99.00",
  "shipping_total": "9.00",
  "billing": {
    "email": "customer@example.com",
    "first_name": "Jane",
    "last_name": "Doe"
  }
}
```

```json
// Response 200 (always immediate — processing is async)
{
  "received": true
}
```

**Supported topics:** | Topic | Action | |-------|--------| | `order.completed`
| Earn 1 pt / $1 CAD (after shipping deducted) | | `order.refunded` | Reverse
earn — append offsetting debit |

**Point calculation:**

```
points = floor(order_total - shipping_total) * 1
```

---

### 3j. Ledger — Transaction History

**GET /api/v1/ledger/transactions**  
Auth: Bearer JWT

```
?accountId=rr-uuid&page=1&limit=20&from=2026-01-01&to=2026-12-31
```

```json
// Response 200
{
  "entries": [
    {
      "entryId": "uuid",
      "type": "credit",
      "amount": 150,
      "reason": "WooCommerce order #1001",
      "timestamp": "2026-06-06T09:00:00.000Z",
      "correlationId": "uuid"
    }
  ],
  "total": 47,
  "page": 1
}
```

---

### 3k. Health Probes

| Endpoint            | Auth | Use                        |
| ------------------- | ---- | -------------------------- |
| `GET /health`       | None | Combined summary           |
| `GET /health/live`  | None | Liveness probe             |
| `GET /health/ready` | None | Readiness probe (DB-aware) |

---

## 4. NATS / Event Bus

> The internal `EventBus` is in-process. External NATS integration is planned.
> The topics below will be the canonical external event names.

| Topic             | Trigger                         | Payload                                                                            |
| ----------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `points.earned`   | Any credit to a loyalty account | `{ memberId, tenantId, points, reason, correlationId, timestamp }`                 |
| `points.redeemed` | Any debit / burn                | `{ memberId, tenantId, points, itemId, redemptionCode, correlationId, timestamp }` |
| `tier.upgraded`   | Member crosses tier threshold   | `{ memberId, tenantId, fromTier, toTier, totalPoints, timestamp }`                 |

Internal `WalletEventType` events (already live in-process):

- `wallet.balance_updated`
- `wallet.escrow_held` / `wallet.escrow_settled` / `wallet.escrow_refunded`
- `ledger.entry_created`

---

## 5. Error Responses

All errors follow:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description"
}
```

| HTTP Status | Meaning                                                  |
| ----------- | -------------------------------------------------------- |
| 400         | Bad request — missing or invalid field                   |
| 401         | Authentication required                                  |
| 402         | Insufficient points balance                              |
| 403         | Step-up auth required (`step_up: true` missing from JWT) |
| 404         | Resource not found                                       |
| 422         | Tier cap exceeded or invalid reason code                 |
| 503         | Database not ready                                       |

---

## 6. Idempotency

All financial write endpoints accept an `idempotencyKey` field. Duplicate
requests with the same key return the original response without re-executing the
operation. Keys are stored for 7 days minimum.

---

## 7. Data Residency

All data is stored in MongoDB (Canada — ca-central-1, Toronto). No member PII
leaves Canadian infrastructure. Metadata fields must not contain email addresses
or other PII — the ledger service enforces this at write time.

---

## 8. Rate Limits

| Surface              | Limit                                                              |
| -------------------- | ------------------------------------------------------------------ |
| General API (per IP) | 100 req/min (configurable via `RATE_LIMIT_PER_MINUTE`)             |
| Signup               | 5 req/min per IP (configurable via `SIGNUP_RATE_LIMIT_PER_MINUTE`) |
