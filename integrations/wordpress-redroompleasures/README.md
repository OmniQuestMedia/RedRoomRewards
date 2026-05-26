# RedRoomRewards — RedRoomPleasures WordPress Plugin

Loyalty-points integration for the RedRoomPleasures storefront. Bridges
WooCommerce to the RRR loyalty engine via HMAC-signed service-to-service
requests.

**Status:** Alpha (`v0.1.0-alpha`). Not for WP.org submission. Internal OQMI use
only.

**Authority:** this plugin implements the contract defined in:

- [`docs/AUTH_CONTRACT.md`](../../docs/AUTH_CONTRACT.md) — HMAC envelope spec
- [`docs/UX_INTEGRATION_BRIEF.md`](../../docs/UX_INTEGRATION_BRIEF.md) — error
  codes, idempotency, rate-limit envelope
- [`docs/integrations/redroompleasures-wordpress.md`](../../docs/integrations/redroompleasures-wordpress.md)
  — what this plugin must do

If the code and the docs disagree, the docs win and the code gets a fix.

---

## What it does

- **On WC order completion:** signs and POSTs to `/earn` so the customer accrues
  RRR Points.
- **At checkout:** exposes `RRR_WooCommerce_Hooks::apply_redeem(...)` for the
  front-end to apply points against the order. Idempotent.
- **Account page:** `[rrr_balance]` shortcode renders the customer's current
  balance.
- **Inbound webhooks:** registers `POST /wp-json/rrr/v1/webhook` for RRR to
  deliver `earn.confirmed`, `refund.applied`, and `expiration.warning` events.
  Verifies HMAC signatures with `hash_equals` (constant-time).

## What it doesn't do (Alpha scope)

- No merchant admin UI — refunds and adjustments go through the OQMI Operator
  console.
- No reporting dashboard — same.
- No cross-merchant redemption surface.
- No translations / i18n — English only for Alpha.
- No client-side balance caching — every page render reads fresh from RRR.
- No background retry of failed earns — TODO via Action Scheduler.

---

## Installation

1. Zip the `wordpress-redroompleasures/` directory.
2. WP admin → Plugins → Add New → Upload Plugin → choose the zip.
3. Activate.
4. Configure (next section).

The plugin will refuse to bootstrap (and surface an admin notice) if any
required config is missing.

---

## Configuration

All configuration lives in `wp-config.php`. **Never** in the WP options table —
secrets do not belong in the database.

```php
// wp-config.php

// Provided by OQMI when the integration is provisioned.
define('RRR_API_KEY_ID',  'rrp-key-2026-01');
define('RRR_API_SECRET',  getenv('RRR_API_SECRET'));   // 64-hex from server env
define('RRR_API_BASE',    'https://api-staging.redroomrewards.com/api/v1');
define('RRR_WEBHOOK_URL', 'https://www.redroompleasures.com/wp-json/rrr/v1/webhook');
define('RRR_TENANT_ID',   'redroompleasures');
```

### Constraints enforced by the plugin

- `RRR_API_BASE` and `RRR_WEBHOOK_URL` must use HTTPS (or `localhost` for dev).
- `RRR_API_SECRET` must be **exactly 64 hexadecimal characters** (256 bits) per
  [`docs/AUTH_CONTRACT.md`](../../docs/AUTH_CONTRACT.md) §2. The plugin uses
  `ctype_xdigit()` to validate hex; an admin notice surfaces if the secret
  doesn't conform.
- All five constants are required; missing any produces an admin notice and the
  plugin refuses to wire any hooks.

### Where the secret comes from

The recommended pattern is to source it from the server environment:

```sh
# /etc/environment or your equivalent
RRR_API_SECRET=<64 hex chars>
```

```php
// wp-config.php
define('RRR_API_SECRET', getenv('RRR_API_SECRET'));
```

If your hosting environment doesn't expose env vars to PHP, drop the secret into
`wp-config.php` directly with `chmod 600` on the file. **Never** check
`wp-config.php` (or the secret) into version control.

### Key rotation

OQMI rotates HMAC keys every 90 days, with a 7-day overlap window. When you
receive new credentials, update `RRR_API_KEY_ID` and `RRR_API_SECRET`; no plugin
restart required (constants are read on each request).

---

## How earn / redeem work

### Earn (automatic)

The plugin hooks `woocommerce_order_status_completed` and
`woocommerce_order_status_processing`. On either, it:

1. Reads the WC order's `_rrr_earn_idempotency_key` meta. Generates one if
   absent (UUID v4).
2. POSTs to `/earn` with `reason_code: PROMOTIONAL_AWARD`, the order total as
   `amount`, and `external_ref: { type: wc_order, id }`.
3. On success: stores `_rrr_earn_ledger_entry_id` on the order and adds an order
   note.
4. On failure: adds an order note with the error code and `request_id`. **Does
   not retry on 4xx** (those are deterministic — e.g. `EARN_NOT_ALLOWED` for a
   Diamond Concierge member).

Re-running the hook on the same order is a no-op once
`_rrr_earn_ledger_entry_id` is set.

### Redeem (manual)

The plugin exposes
`RRR_WooCommerce_Hooks::apply_redeem(WC_Order $order, int $points_to_redeem)`.
Call it from your checkout handler / block:

```php
$result = RRR_WooCommerce_Hooks::apply_redeem($order, 500);
if ($result['ok']) {
    $discount = $result['body']['discount_applied'] ?? 0;
    // apply $discount to the cart total
} else {
    // map $result['error_code'] to user-facing copy per UX_INTEGRATION_BRIEF §7
}
```

Idempotent — same order can call this multiple times safely; the second call
returns the cached result.

The plugin does **not** ship a checkout UI. That's a host-theme concern. The
packet (`docs/integrations/redroompleasures-wordpress.md`) shows the expected
slider/stepper shape and the cap-bounded maximum calculation.

---

## Webhooks (inbound)

`POST /wp-json/rrr/v1/webhook` is registered automatically. RRR delivers signed
events here. The plugin verifies the signature, dedupes by `event_id` (7-day TTL
via WP transient), and dispatches:

| Event                | Plugin behavior                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `earn.confirmed`     | Fires `do_action('rrr_earn_confirmed', $payload)` — host theme can hook in.                                                                               |
| `refund.applied`     | Adds a WC order note if `external_ref.type == wc_order`. Fires `do_action('rrr_refund_applied', $payload)` for the host theme to send the customer email. |
| `expiration.warning` | Fires `do_action('rrr_expiration_warning', $payload)` — host theme handles email.                                                                         |

Unknown event types are accepted with 200 (so RRR doesn't retry future event
types we haven't subscribed to).

### Verifying a webhook end-to-end

The plugin's webhook receiver:

1. Validates `X-RRR-Tenant` matches `RRR_TENANT_ID`.
2. Validates `X-RRR-Timestamp` is within ±5 min of now.
3. Reconstructs the canonical signing string (per `docs/AUTH_CONTRACT.md` §4)
   and HMAC-SHA256s it with `RRR_API_SECRET`.
4. Compares using `hash_equals` (constant-time — never `===`).
5. Decodes the body, dedupes on `event_id`, dispatches.

Anything that fails 1–4 returns 401 `AUTH_INVALID`. RRR will retry per its
backoff schedule.

---

## Logging

The plugin logs **only** path, http_code, reason, and `request_id` on failures.
Never:

- the secret
- the signature (full or partial)
- request bodies for state-changing operations
- bearer tokens (none used by this plugin)

If you find any of those in your `error_log`, file a bug — that's a leak and a
P0 per `docs/OPERATIONAL_RUNBOOK.md` §10.

---

## Tests

A self-contained test runner that doesn't need composer or PHPUnit:

```bash
php tests/run-tests.php
```

Covers HMAC signing-string construction, signature determinism + key
sensitivity, UUID v4 nonce randomness + format, and webhook signature
verification (happy path + tampered sig + wrong tenant + tampered body + stale
timestamp + null headers + malformed timestamp).

18 tests; all must pass before deploy.

---

## Operational notes

- **Time sync.** If your WP host's clock drifts > 5 min from UTC, every signed
  call fails with `AUTH_INVALID`. Run NTP. Don't try to "fix" this with offset
  tricks.
- **HTTPS only.** The plugin refuses to bootstrap if `RRR_API_BASE` or
  `RRR_WEBHOOK_URL` is plain HTTP (except `localhost` for dev).
- **No DB-backed config.** Secrets live in `wp-config.php` constants; the plugin
  never reads or writes options-table entries for sensitive values.
- **Idempotency keys persist on WC order meta.** `_rrr_earn_idempotency_key` and
  `_rrr_redeem_idempotency_key`. Survives retries. Don't manually reset these
  without understanding the consequences.

---

## What to do when something fails

1. Note the `request_id` from the order note (or `error_log`).
2. Hand it to OQMI ops via the `integration:redroompleasures` GitHub label on
   the RRR repo.
3. OQMI walks back from `request_id` → server-side log → verdict + reason.

Common failure modes and what they mean: see
`docs/integrations/redroompleasures-wordpress.md` §7.

---

## File layout

```
wordpress-redroompleasures/
├── redroomrewards.php                       # main plugin file with WP header
├── README.md                                # this file
├── includes/
│   ├── class-rrr-config.php                 # config helper (reads wp-config constants)
│   ├── class-rrr-client.php                 # HMAC-signed HTTP client
│   ├── class-rrr-woocommerce-hooks.php      # WC order completion + redeem entry point
│   ├── class-rrr-webhook-handler.php        # /wp-json/rrr/v1/webhook receiver
│   └── class-rrr-account-display.php        # [rrr_balance] shortcode
└── tests/
    └── run-tests.php                        # standalone PHP test runner (no composer)
```

---

## License

UNLICENSED — OmniQuest Media Inc. internal use only.
