# RedRoomPleasures — WordPress Plugin Integration Packet

**Audience:** WordPress plugin developer building the RedRoomPleasures ↔ RRR
loyalty integration.

**Status:** draft — Alpha integration.

**Authority:** defers to `docs/AUTH_CONTRACT.md`,
`docs/UX_INTEGRATION_BRIEF.md`, and `api/openapi.yaml`. On any conflict, those
win.

---

## 1. The deal in one paragraph

RedRoomPleasures is a WordPress / WooCommerce-shaped storefront. When a customer
completes a purchase, the plugin earns RRR Points for that customer. When a
customer chooses to apply RRR Points at checkout, the plugin asks RRR to
validate and debit. RedRoomPleasures owns the customer identity, cart, and
checkout flow; RRR owns the loyalty wallet, the ledger, and the redemption math.
The plugin is the bridge.

---

## 2. What you're building

A WordPress plugin (PHP, no admin UI for Alpha) that:

1. Signs outbound HTTP requests to RRR using HMAC-SHA256 per the auth contract.
2. Calls `POST /earn` on order completion.
3. Calls `POST /redeem` when a customer chooses to apply points at checkout.
4. Receives signed inbound webhooks from RRR (earn-confirmed, refund-applied)
   and verifies their signatures.
5. Stores the customer's RRR Points balance for display, refreshing on every
   page load on member-account pages.

For Alpha, the plugin does **not** need:

- A merchant admin UI (use the OQMI Operator console for refunds / adjustments).
- A reporting dashboard (same).
- Cross-merchant redemption (deferred — CEO B4 default 1:1 lives in RRR but not
  surfaced in WP UI for Alpha).
- AV gating (handled by RRR's GateGuard; the plugin trusts RRR's verdict).

---

## 3. Credentials you'll be issued

When you're ready to wire to staging, OQMI provisions:

- `tenant_id` — `redroompleasures`
- `api_key_id` — opaque string identifying the active key
- `api_secret` — 64 hex chars (256 bits)
- Staging API base URL — `https://api-staging.redroomrewards.com/api/v1`
- Webhook receive URL (yours, you supply this) — must be HTTPS

Store the secret in `wp-config.php` via a constant or in the WordPress secret
store; **never** in plugin options stored in the DB. Never log the secret. Never
include it in error messages.

```php
// wp-config.php
define('RRR_API_KEY_ID', 'rrp-key-2026-01');
define('RRR_API_SECRET', getenv('RRR_API_SECRET'));  // from server env
define('RRR_API_BASE', 'https://api-staging.redroomrewards.com/api/v1');
define('RRR_WEBHOOK_URL', 'https://www.redroompleasures.com/wp-json/rrr/v1/webhook');
```

Rotation: every 90 days, OQMI issues a new key pair and gives you a 7-day
overlap window to swap. New key valid before old is revoked.

---

## 4. Operations you'll perform

### 4.1 Earn on purchase complete

When a WooCommerce order moves to `completed` (or your equivalent post-payment
state):

```http
POST /earn
Content-Type: application/json
X-RRR-Tenant: redroompleasures
X-RRR-Key-Id: rrp-key-2026-01
X-RRR-Timestamp: 2026-05-02T13:42:00Z
X-RRR-Nonce: 7b9c4f3e-5d2a-4c1f-8b3e-9f1a2b3c4d5e
X-RRR-Signature: <hex HMAC-SHA256>
X-Idempotency-Key: <UUID v4 — generated once per order, persisted on the order record>

{
  "tenant_id": "redroompleasures",
  "merchant_id": "redroompleasures",
  "user_id": "wp-user-abc123",          // WordPress user ID, prefixed
  "amount_currency": "USD",
  "amount": 42.00,
  "reason_code": "MERCHANT_ORDER_REDEMPTION",  // see catalog below
  "external_ref": {
    "type": "wc_order",
    "id": "12345"
  }
}
```

Important rules:

- **`reason_code`** for an earn driven by a merchant order should be
  `PROMOTIONAL_AWARD` for Alpha (the `MERCHANT_ORDER_REDEMPTION` code is for the
  _redeem_ direction, not earn). See §6 below.
- **`X-Idempotency-Key`** must be persisted on the WC order record. If your
  retry logic re-fires this call, send the same key. Do **not** generate a fresh
  UUID per retry.
- **Earn rate** is server-computed. Don't try to compute "200 points for $42"
  client-side. RRR reads `EarnRateConfig` and applies
  `base_points_per_unit * inferno_multiplier * amount`.

Response shape (success, 201 Created):

```json
{
  "ledger_entry_id": "ledger-9f8e7d6c",
  "points_credited": 504,
  "wallet_balance_after": 1754,
  "request_id": "req-3a4b5c6d"
}
```

Response shape (idempotent replay, 200 OK):

Same body. Treat 200 as "we already did this, here's what happened the first
time." Don't double-credit on the WC order.

### 4.2 Redeem at checkout

When a customer applies RRR Points to reduce their cart total:

1. **Pre-flight: read balance.** `GET /wallets/{userId}/balance` — show the
   customer their available balance and tier cap.
2. **User chooses an amount** (slider or stepper, bounded to
   `min(available, floor(cart_total * cap_pct / 100))`).
3. **On checkout submit:** `POST /redeem`:

```http
POST /redeem
Content-Type: application/json
X-RRR-Tenant: redroompleasures
X-RRR-Key-Id: rrp-key-2026-01
X-RRR-Timestamp: 2026-05-02T13:42:00Z
X-RRR-Nonce: <UUID v4>
X-RRR-Signature: <hex HMAC-SHA256>
X-Idempotency-Key: <UUID v4 — generated once per checkout attempt>

{
  "tenant_id": "redroompleasures",
  "merchant_id": "redroompleasures",
  "user_id": "wp-user-abc123",
  "points_to_redeem": 500,
  "transaction_value": 42.00,
  "currency": "USD",
  "reason_code": "MERCHANT_ORDER_REDEMPTION",
  "external_ref": {
    "type": "wc_order",
    "id": "12345"
  }
}
```

Response shape (success, 201 Created):

```json
{
  "ledger_entry_id": "ledger-2a3b4c5d",
  "points_redeemed": 500,
  "discount_applied": 0.5,
  "wallet_balance_after": 1254,
  "request_id": "req-7e8f9a0b"
}
```

Apply `discount_applied` to the cart total. Reject the order if RRR returns 4xx
(see error matrix in §7).

### 4.3 Read balance

`GET /wallets/{userId}/balance` — used on the customer's account page and at
checkout pre-flight. No `X-Idempotency-Key` required (GETs are idempotent by
definition). Still HMAC-signed.

```http
GET /wallets/wp-user-abc123/balance
X-RRR-Tenant: redroompleasures
X-RRR-Key-Id: rrp-key-2026-01
X-RRR-Timestamp: 2026-05-02T13:42:00Z
X-RRR-Nonce: <UUID v4>
X-RRR-Signature: <hex HMAC-SHA256>  // body hash is sha256('') for empty body
```

---

## 5. Webhooks you'll receive

RRR posts signed webhooks to your `RRR_WEBHOOK_URL` for events relevant to your
tenant. For Alpha, you subscribe to:

| Event                | When                                                | What you do                                          |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `earn.confirmed`     | An earn was credited (typically just confirms 4.1)  | Optional — update local cache, no UI change required |
| `refund.applied`     | An OQMI Operator issued a refund affecting a member | Email the member, update local order record          |
| `expiration.warning` | A member has points expiring within 30 days         | Email the member with the affected amount            |

Concrete sample payload bodies for `refund.applied` and `expiration.warning`
live in
[`docs/contracts/examples/outbound-webhooks/`](../contracts/examples/outbound-webhooks/).
Use them as fixtures in `tests/run-tests.php` so the parser doesn't drift from
the live shape. (`earn.confirmed` is currently a confirmation-only event with no
body shape pinned — RRR may upgrade it to a fuller envelope in a later wave; the
WP plugin should treat unknown fields as a no-op.)

### 5.1 Verifying inbound webhook signatures

Same envelope as §4 of `docs/AUTH_CONTRACT.md`, but in reverse — RRR signs, you
verify. Reject any delivery whose timestamp drifts > ±5 min, whose
`X-RRR-Tenant` isn't `redroompleasures`, or whose signature doesn't validate.

```php
function rrp_verify_webhook(WP_REST_Request $request): bool {
    $tenant   = $request->get_header('X-RRR-Tenant');
    $key_id   = $request->get_header('X-RRR-Key-Id');
    $ts       = $request->get_header('X-RRR-Timestamp');
    $nonce    = $request->get_header('X-RRR-Nonce');
    $sig      = $request->get_header('X-RRR-Signature');
    $body     = $request->get_body();

    if ($tenant !== 'redroompleasures') return false;
    if (!$ts || abs(time() - strtotime($ts)) > 300) return false;

    $body_hash = hash('sha256', $body);
    $canonical = implode("\n", ['POST', '/wp-json/rrr/v1/webhook', $ts, $nonce, $body_hash]);
    $expected = hash_hmac('sha256', $canonical, RRR_API_SECRET);

    return hash_equals($sig, $expected);
}
```

`hash_equals` is PHP's constant-time comparison. **Do not** use `===` to compare
signatures.

### 5.2 Webhook idempotency

RRR retries failed deliveries with exponential backoff (1m, 5m, 30m, 2h, 12h)
for up to 24h. The `X-Idempotency-Key` and `X-RRR-Nonce` are stable across
retries — your endpoint must be idempotent. Store seen `event_id`s for at least
7 days and skip duplicates.

---

## 6. Reason-code reference (the codes you'll send)

For Alpha, the WP plugin uses a small subset of the full catalog (see
`docs/UX_INTEGRATION_BRIEF.md` §7.2):

| Code                        | Direction | When                                                              |
| --------------------------- | --------- | ----------------------------------------------------------------- |
| `PROMOTIONAL_AWARD`         | earn      | A merchant order completes and earns RRR Points                   |
| `USER_SIGNUP_BONUS`         | earn      | (Optional) a new WordPress user enrolls and gets a welcome credit |
| `REFERRAL_BONUS`            | earn      | (Optional) a referral attribution credit                          |
| `MERCHANT_ORDER_REDEMPTION` | debit     | A customer applies points at checkout                             |

Codes you'll see in webhook payloads but never send:

| Code                  | Source                                   |
| --------------------- | ---------------------------------------- |
| `ADMIN_REFUND`        | OQMI Operator issued a refund            |
| `ADMIN_CREDIT`        | OQMI Operator issued a manual credit     |
| `POINT_EXPIRY`        | A member's PointLot expired              |
| `CHARGEBACK_REVERSAL` | Future — payment-rails wave (post-Alpha) |

---

## 7. Error handling

Full catalog: `docs/UX_INTEGRATION_BRIEF.md` §7. The codes you'll most commonly
see and how to handle them:

| HTTP | Code                             | What you do                                                                                             |
| ---- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`               | Plugin bug — log and alert dev. Do not retry.                                                           |
| 400  | `IDEMPOTENCY_KEY_MISMATCH`       | Plugin bug — same key, different payload. Log; do not retry; investigate.                               |
| 401  | `AUTH_REQUIRED` / `AUTH_INVALID` | Check key rotation status; you may be on a revoked key. Surface to admin.                               |
| 403  | `TENANT_SCOPE_VIOLATION`         | You sent a tenant_id you don't own. Plugin bug — log and alert.                                         |
| 403  | `TIER_CAP_EXCEEDED`              | Customer tried to redeem more than their tier allows. Show user-friendly copy; auto-clamp.              |
| 403  | `INSUFFICIENT_BALANCE`           | Customer doesn't have enough points. Show user-friendly copy.                                           |
| 404  | `WALLET_NOT_FOUND`               | Customer has no wallet yet. Treat as "no points" for read; for earn, RRR auto-creates.                  |
| 422  | `EARN_NOT_ALLOWED`               | Diamond Concierge tier or other zero-earn rule. Don't surface as error — just don't show points earned. |
| 429  | `RATE_LIMITED`                   | Honour `Retry-After`. Never silently retry on state-changing operations; surface to user.               |
| 500  | `INTERNAL_ERROR`                 | Quote `request_id` to user; log with full request_id; consider retry only if endpoint is GET.           |

Every response (success or error) carries `X-Request-ID`. Always log it. When a
customer contacts support, that's the only piece of info that lets OQMI find
their request in the logs.

---

## 8. Smoke-test checklist (run against staging)

Before declaring the plugin Alpha-ready, run through these against
`https://api-staging.redroomrewards.com`:

- [ ] **Auth: signed GET succeeds.** Hit `/health` (no signature required) —
      should return 200 and confirm version. Then hit
      `GET /wallets/test-user-001/balance` with full HMAC envelope — should
      return 200 or 404 (404 OK if no wallet yet).
- [ ] **Auth: bad signature rejected.** Send the same request with a tampered
      signature. Must return 401 `AUTH_INVALID`.
- [ ] **Auth: replay window enforced.** Send a request with a timestamp 10
      minutes in the past. Must return 401 `AUTH_INVALID`.
- [ ] **Earn happy path.** `POST /earn` with a fresh idempotency key. Verify
      201, ledger entry returned, balance increments.
- [ ] **Earn idempotent replay.** Send the same `POST /earn` with the same
      idempotency key. Verify 200, same ledger entry, balance unchanged.
- [ ] **Earn idempotency mismatch.** Same key, different `amount`. Verify 400
      `IDEMPOTENCY_KEY_MISMATCH`.
- [ ] **Balance read.** `GET /wallets/{userId}/balance` returns the expected
      breakdown.
- [ ] **Redeem within cap.** Trigger a redeem at 30% of order value (within GOLD
      tier's 35% cap). Verify success.
- [ ] **Redeem above cap.** Trigger a redeem at 40% of order value with a
      GOLD-tier user. Verify 403 `TIER_CAP_EXCEEDED`.
- [ ] **Redeem insufficient balance.** Trigger a redeem with a user whose
      balance is below the request. Verify 403 `INSUFFICIENT_BALANCE`.
- [ ] **Webhook receive: signed delivery.** OQMI fires a test webhook to your
      endpoint; verify your endpoint accepts it.
- [ ] **Webhook receive: bad signature.** OQMI fires a tampered webhook; verify
      your endpoint rejects with 401.
- [ ] **Webhook receive: replay drift.** OQMI fires with stale timestamp; verify
      rejection.
- [ ] **Webhook idempotency.** OQMI fires same delivery twice; verify your
      endpoint processes once.
- [ ] **Rate limit honoured.** Burst > 100 req/min/IP; verify 429 with
      `Retry-After`. Don't auto-retry.

When all checked, ping OQMI for Alpha test scheduling.

---

## 9. Operational notes

- **Logging:** never log the secret, the signature, or full request bodies for
  state-changing operations. Log only `tenant_id`, `key_id`, `request_id`, and
  verdict.
- **Time sync:** if your WP host has clock drift > 5 min the entire integration
  breaks. Run NTP. Don't try to fix this with a "send timestamp 10 min in the
  future" workaround.
- **HTTPS only:** the plugin must reject any non-HTTPS configuration of
  `RRR_API_BASE` or `RRR_WEBHOOK_URL`. Refuse to start if either is `http://`.
- **PHP version:** target PHP 8.1+. The reference snippets use named functions;
  modify if your codebase uses classes.

---

## 10. Open items / not in this packet

- **Plugin packaging / WP.org submission** — out of scope for Alpha; Alpha is a
  private deploy on RedRoomPleasures' WP host.
- **Translations / i18n** — Alpha is English-only.
- **Per-store tenant isolation** — RedRoomPleasures is single-tenant for Alpha.
  If you ever resell the plugin, that's a different conversation.
- **Cross-merchant redemption** — service exists at 1:1 (CEO B4); not surfaced
  in WP UI for Alpha. Defer to v2.

---

_This packet is Alpha-bound. Updates require a CHORE: commit and a note in the
production schedule under ALP-7._
