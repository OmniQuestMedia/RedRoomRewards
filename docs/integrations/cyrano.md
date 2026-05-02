# Cyrano — Integration Packet

**Audience:** Cyrano backend team building the Cyrano ↔ RRR loyalty integration.

**Status:** draft — Alpha integration.

**Authority:** defers to `docs/AUTH_CONTRACT.md`, `docs/UX_INTEGRATION_BRIEF.md`, `docs/UX_CROSS_STACK_ALIGNMENT.md`, and `api/openapi.yaml`. On any conflict, those win.

---

## 1. The deal in one paragraph

Cyrano is a session-shaped product (chat-now / performance / chip-menu surfaces). RRR is the loyalty wallet: it holds members' RRR Points, holds escrow during in-flight performances, and settles or refunds based on what happens in the session. Cyrano owns the user identity, the session/queue, and the chance-or-deterministic gameplay logic; RRR owns the wallet, the ledger, and the redemption math. The two services talk over signed HTTP per `docs/AUTH_CONTRACT.md` and exchange webhooks for events that cross stack boundaries.

---

## 2. What you're building

A Cyrano-side integration layer (Node/TypeScript) that:

1. Signs outbound HTTP to RRR using HMAC-SHA256 per the auth contract.
2. Calls `POST /wallets/{userId}/escrow/hold` when a member commits points to a performance/chip-menu action.
3. Calls `POST /wallets/escrow/{escrowId}/settle` (or `refund` / `partial-settle`) when the session resolves.
4. Calls `POST /redeem` when a member spends points on instant features (chip-menu purchase, spin-wheel pay-with-points).
5. Calls `POST /models/{modelId}/earn` (gift) when models gift their allocation to members.
6. Receives signed inbound webhooks from RRR (settlement, fraud-signal, recon-mismatch) and verifies their signatures.
7. Maintains a Cyrano-side cache of members' RRR Points balances, refreshed on session entry and after every wallet-mutating call.

For Alpha, Cyrano does **not** need:

- A Cyrano admin UI for RRR adjustments (use the OQMI Operator console).
- Reporting integration (Cyrano queries RRR's reporting endpoints directly when needed; no syndication into Cyrano UI for Alpha).
- AV gating logic (RRR enforces GateGuard; Cyrano trusts RRR's verdict).
- Cross-merchant redemption surfaces (deferred to v2).

---

## 3. Credentials you'll be issued

When you're ready to wire to staging, OQMI provisions:

- `tenant_id` — `cyrano`
- `api_key_id` — opaque string identifying the active key
- `api_secret` — 64 hex chars (256 bits)
- Staging API base URL — `https://api-staging.redroomrewards.com/api/v1`
- Webhook receive URL (yours, you supply this) — must be HTTPS

Store the secret in your secret manager (the same one Cyrano uses for its other secrets). **Never** in the repo. **Never** in the DB. **Never** in logs.

```ts
// config/rrr.ts
export const rrrConfig = {
  apiBase: process.env.RRR_API_BASE!,           // https://api-staging.redroomrewards.com/api/v1
  tenantId: 'cyrano',
  apiKeyId: process.env.RRR_API_KEY_ID!,        // 'cyr-key-2026-01'
  apiSecret: process.env.RRR_API_SECRET!,       // from secret manager
  webhookPath: '/webhooks/rrr',                 // your inbound endpoint
};
```

Rotation: every 90 days, OQMI issues a new key pair with a 7-day overlap window.

---

## 4. Operations you'll perform

### 4.1 Escrow hold (chip-menu purchase / performance request)

When a member commits points to an in-flight action, hold them in escrow before any work happens:

```http
POST /wallets/{userId}/escrow/hold
Content-Type: application/json
X-RRR-Tenant: cyrano
X-RRR-Key-Id: cyr-key-2026-01
X-RRR-Timestamp: 2026-05-02T13:42:00Z
X-RRR-Nonce: <UUID v4>
X-RRR-Signature: <hex HMAC-SHA256>
X-Idempotency-Key: <UUID v4 — generated once per session-action; persist on the queue item>

{
  "tenant_id": "cyrano",
  "merchant_id": "cyrano",
  "user_id": "cyrano-member-9f8e",
  "amount": 500,
  "reason_code": "CHIP_MENU_PURCHASE",   // or PERFORMANCE_REQUEST
  "external_ref": {
    "type": "queue_item",
    "id": "queue-7a8b9c"
  }
}
```

Response (201 Created):

```json
{
  "escrow_id": "esc-2a3b4c5d",
  "amount_held": 500,
  "available_balance_after": 1250,
  "escrow_balance_after": 700,
  "request_id": "req-1f2e3d4c"
}
```

The escrow stays HELD until you call settle, refund, or partial-settle. **Don't lose the `escrow_id`** — it's the handle for everything that follows.

### 4.2 Escrow settle (performance completed)

When the session completes successfully and the model earned the points:

```http
POST /wallets/escrow/{escrowId}/settle
X-Idempotency-Key: <UUID v4 — fresh per settlement attempt>

{
  "tenant_id": "cyrano",
  "model_id": "cyrano-model-3d2c",
  "amount": 500,
  "reason_code": "PERFORMANCE_COMPLETED",
  "external_ref": { "type": "queue_item", "id": "queue-7a8b9c" }
}
```

Settles the escrow → model's allocation wallet. Member balance is unchanged at this point (it was deducted at hold time).

### 4.3 Escrow refund

When the session aborts and the member should get points back:

```http
POST /wallets/escrow/{escrowId}/refund
X-Idempotency-Key: <UUID v4>

{
  "tenant_id": "cyrano",
  "reason_code": "PERFORMANCE_ABANDONED",   // or USER_DISCONNECTED, MODEL_INITIATED_REFUND, ROPE_DROP_TIMEOUT
  "external_ref": { "type": "queue_item", "id": "queue-7a8b9c" }
}
```

Returns full escrowed amount → member's available balance.

### 4.4 Escrow partial-settle (split outcomes)

For partial completion (e.g. session ended halfway):

```http
POST /wallets/escrow/{escrowId}/partial-settle
X-Idempotency-Key: <UUID v4>

{
  "tenant_id": "cyrano",
  "model_id": "cyrano-model-3d2c",
  "settle_amount": 300,
  "refund_amount": 200,
  "settle_reason_code": "PARTIAL_PERFORMANCE",
  "refund_reason_code": "USER_DISCONNECTED",
  "external_ref": { "type": "queue_item", "id": "queue-7a8b9c" }
}
```

Server-side rule: `settle_amount + refund_amount` must equal the original escrow amount. Mismatch → 400 `VALIDATION_ERROR`.

### 4.5 Direct redeem (no escrow)

For instant-resolve features (e.g. spin-wheel pay-with-points where the spin happens immediately):

```http
POST /redeem
X-Idempotency-Key: <UUID v4>

{
  "tenant_id": "cyrano",
  "merchant_id": "cyrano",
  "user_id": "cyrano-member-9f8e",
  "points_to_redeem": 100,
  "transaction_value": 0.10,           // USD valuation, optional context
  "currency": "USD",
  "reason_code": "SPIN_WHEEL_PLAY",     // or CHIP_MENU_PURCHASE for instant chip
  "external_ref": { "type": "spin_play", "id": "spin-9c8b" }
}
```

> **Architectural note:** `SPIN_WHEEL_PLAY` is an audit label classifying that the debit originated from CNZ's spin-wheel feature. The chance-based logic (RNG, prize wheel, animation) lives entirely on Cyrano / CNZ. RRR's role is wallet validation + debit only. CEO D1 retires chance-based game logic *living in RRR*; it does not retire RRR's ability to record that a member spent points on a connected merchant's chance-based feature. See `docs/UX_INTEGRATION_BRIEF.md` §7.2 notes.

### 4.6 Model gifting

When a model gifts their allocation to a member:

```http
POST /models/{modelId}/earn
X-Idempotency-Key: <UUID v4>

{
  "tenant_id": "cyrano",
  "merchant_id": "cyrano",
  "recipient_user_id": "cyrano-member-9f8e",
  "amount": 250,
  "reason_code": "MODEL_GIFT",
  "external_ref": { "type": "gift_session", "id": "gift-3a4b" }
}
```

Subject to creator-gifting-panel rules (see `creator-gifting.controller.ts`). The model's allocation balance decrements; the member's available balance increments.

### 4.7 Read balance (member or model)

```http
GET /wallets/{userId}/balance        # member
GET /models/{modelId}/wallet          # model allocation
```

Both signed; no idempotency key (GETs).

---

## 5. Webhooks you'll receive

RRR posts signed webhooks to your registered receive URL. For Alpha, Cyrano subscribes to:

| Event                  | When                                                                    | What you do                                                    |
| ---------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| `escrow.settled`       | An escrow you held was settled (confirmation; covers async settlement)  | Update Cyrano-side queue item state to SETTLED                 |
| `escrow.refunded`      | An escrow you held was refunded                                         | Update Cyrano-side queue item state to REFUNDED                |
| `escrow.partial`       | An escrow you held was partial-settled                                  | Update both legs                                               |
| `fraud.signal`         | RRR's `FraudSignalService` flagged a velocity / immediate-redemption / idempotency-reuse signal | Surface to Cyrano fraud workflow; may trigger session pause |
| `recon.mismatch`       | RRR's reconciliation job flagged a balance mismatch involving a Cyrano member | Pause the affected member's wallet-mutating actions on Cyrano side until cleared |
| `expiration.warning`   | A Cyrano member has points expiring within 30 days                      | Surface to Cyrano member-account UI                            |
| `refund.applied`       | OQMI Operator issued a refund affecting a Cyrano member                 | Update local cache; notify member if appropriate              |

### 5.1 Verifying inbound signatures

Same envelope as `docs/AUTH_CONTRACT.md` §4, but you're the verifier:

```ts
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export function verifyRrrWebhook(req: {
  method: string;
  path: string;
  body: string;
  headers: Record<string, string>;
}): boolean {
  const ts = req.headers['x-rrr-timestamp'];
  const nonce = req.headers['x-rrr-nonce'];
  const sig = req.headers['x-rrr-signature'];
  const tenant = req.headers['x-rrr-tenant'];
  if (!ts || !nonce || !sig || tenant !== 'cyrano') return false;

  const tsMs = Date.parse(ts);
  if (Number.isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) return false;

  const bodyHash = createHash('sha256').update(req.body).digest('hex');
  const canonical = ['POST', req.path, ts, nonce, bodyHash].join('\n');
  const expected = createHmac('sha256', process.env.RRR_API_SECRET!)
    .update(canonical)
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
```

Use `timingSafeEqual` — never `===`.

### 5.2 Webhook idempotency on your side

RRR retries failed deliveries with exponential backoff (1m, 5m, 30m, 2h, 12h) for up to 24h. Stable `X-Idempotency-Key` and `X-RRR-Nonce` across retries. Your endpoint must dedupe on `event_id` for at least 7 days.

---

## 6. Reason-code reference

Codes Cyrano sends to RRR (subset of the catalog in `docs/UX_INTEGRATION_BRIEF.md` §7.2):

| Code                        | Direction       | Operation                                                |
| --------------------------- | --------------- | -------------------------------------------------------- |
| `CHIP_MENU_PURCHASE`        | escrow / debit  | Member commits points to a chip-menu action              |
| `PERFORMANCE_REQUEST`       | escrow          | Member commits points for a performance request          |
| `SPIN_WHEEL_PLAY`           | debit           | Member pays for a spin with points (instant)             |
| `PERFORMANCE_COMPLETED`     | settle          | Performance ended successfully                           |
| `PARTIAL_PERFORMANCE`       | partial-settle  | Performance ended partway                                |
| `PERFORMANCE_ABANDONED`     | refund          | Performance abandoned by model                           |
| `USER_DISCONNECTED`         | refund          | User dropped before performance finished                 |
| `MODEL_INITIATED_REFUND`    | refund          | Model voluntarily refunded                               |
| `ROPE_DROP_TIMEOUT`         | refund          | Queue/handshake timeout                                  |
| `MODEL_GIFT`                | credit          | Model gifts allocation to a member                       |

Codes Cyrano receives (in webhooks) but never sends:

| Code                 | Source                                       |
| -------------------- | -------------------------------------------- |
| `ADMIN_REFUND`       | OQMI Operator issued a refund                |
| `ADMIN_CREDIT`       | OQMI Operator issued a manual credit         |
| `ADMIN_DEBIT`        | OQMI Operator issued a manual debit          |
| `POINT_EXPIRY`       | A member's PointLot expired                  |
| `STEP_UP_GRANTED`    | Audit-only — operator step-up succeeded      |
| `STEP_UP_DENIED`     | Audit-only — operator step-up denied         |

---

## 7. Error handling matrix

Full catalog: `docs/UX_INTEGRATION_BRIEF.md` §7. The codes Cyrano will see most often:

| HTTP | Code                       | What you do                                                                                       |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`         | Cyrano bug — log with `request_id`, alert dev. Do not retry.                                      |
| 400  | `IDEMPOTENCY_KEY_MISMATCH` | Cyrano bug — same key, different payload. Do not retry; investigate.                              |
| 401  | `AUTH_REQUIRED` / `AUTH_INVALID` | Check key rotation status. May be on a revoked key. Page on-call.                            |
| 403  | `TENANT_SCOPE_VIOLATION`   | Cyrano bug — sent a tenant_id you don't own.                                                      |
| 403  | `TIER_CAP_EXCEEDED`        | Member tried to redeem above their tier cap. Surface to Cyrano UI; auto-clamp.                    |
| 403  | `INSUFFICIENT_BALANCE`     | Member doesn't have enough points. Surface to Cyrano UI as a clean error state.                   |
| 404  | `WALLET_NOT_FOUND`         | Member has no wallet. Treat as zero balance for read; on first earn RRR auto-creates.             |
| 404  | `ESCROW_NOT_FOUND`         | Escrow ID is wrong or no longer accessible. Cyrano-side bug — investigate.                        |
| 409  | `ESCROW_ALREADY_TERMINAL`  | Trying to settle/refund an already-resolved escrow. Cyrano-side state bug — investigate.          |
| 409  | `RECON_MISMATCH`           | RRR paused this for a safety check. **Do not auto-retry**. Pause Cyrano-side member operations and surface to ops. |
| 422  | `EARN_NOT_ALLOWED`         | Diamond Concierge zero-earn rule. Don't surface as error — silently skip the earn.                |
| 429  | `RATE_LIMITED`             | Honour `Retry-After`. Never silent-retry on state-changing ops.                                   |
| 500  | `INTERNAL_ERROR`           | Quote `request_id` in your logs and to user (if user-facing). Don't retry state-changing ops.     |

Every response carries `X-Request-ID`. Log it. It's the only thread that connects a Cyrano session log to an RRR ledger entry when something goes wrong.

---

## 8. Cross-stack vocabulary alignment

Cyrano UIs that surface RRR data must use the canonical vocabulary from `docs/DOMAIN_GLOSSARY.md`. Quick reference:

- **RRR Points** — never "credits", "tokens" (CZT is Cyrano-side, not RRR), "coins."
- **Wallet** — never "account."
- **Escrow** — never "pending balance" or "frozen funds."
- **PointLot** — RRR's award-batch concept; surfaces in expiration warnings.
- **LedgerEntry** — never "transaction record."
- **Tier** — RRR uses `merchant_tier` (PLATINUM / GOLD / SILVER / MEMBER / GUEST). Cyrano uses VIP tiers (GUEST / VIP / VIP_SILVER / VIP_GOLD / VIP_PLATINUM / VIP_DIAMOND). The `TierBadge` shared component takes the tier name as a prop — it doesn't bake in either set. See `docs/ux/00-shared-components.md`.
- **Diamond Concierge** — tier attribute (RRR side); zero earn (CEO D3). On the Cyrano side it's also surfaced as a high-tier service offering — keep the data model and the UI label aligned.

The full cross-stack alignment record lives at `docs/UX_CROSS_STACK_ALIGNMENT.md`.

---

## 9. Smoke-test checklist (run against staging)

Before declaring the integration Alpha-ready, run through these against `https://api-staging.redroomrewards.com`:

- [ ] **Auth: signed GET succeeds.** `GET /health` (no signature) → 200. `GET /wallets/test-cy-001/balance` with full HMAC envelope → 200 or 404.
- [ ] **Auth: bad signature rejected.** Tampered signature → 401 `AUTH_INVALID`.
- [ ] **Auth: replay window enforced.** Timestamp 10 min stale → 401.
- [ ] **Escrow hold happy path.** `POST /wallets/{userId}/escrow/hold` → 201. Verify `escrow_id` returned, balance moved from available → escrow.
- [ ] **Escrow settle.** `POST /wallets/escrow/{escrowId}/settle` → 201. Verify escrow → model wallet.
- [ ] **Escrow refund.** Hold a fresh escrow, refund it → verify member's available balance restored.
- [ ] **Escrow partial-settle.** Hold a fresh escrow, partial-settle → verify split.
- [ ] **Escrow already-terminal.** Try to settle a refunded escrow → 409 `ESCROW_ALREADY_TERMINAL`.
- [ ] **Escrow idempotent settle.** Settle the same escrow twice with the same idempotency key → 200 on second, no double-credit on model.
- [ ] **Direct redeem (spin-wheel pattern).** `POST /redeem` with `reason_code: SPIN_WHEEL_PLAY` → 201, debit applied.
- [ ] **Tier-cap enforcement.** Redeem above the user's tier cap → 403 `TIER_CAP_EXCEEDED`.
- [ ] **Insufficient balance.** Redeem more than user has → 403 `INSUFFICIENT_BALANCE`.
- [ ] **Diamond Concierge zero-earn.** Earn for a Diamond Concierge member → 422 `EARN_NOT_ALLOWED`. Verify Cyrano UI does not show this as a hard error.
- [ ] **Model gift.** `POST /models/{modelId}/earn` with `reason_code: MODEL_GIFT` → 201, model allocation decrement, member balance increment.
- [ ] **Webhook receive: settlement event.** OQMI fires a test `escrow.settled` to your endpoint → your endpoint accepts.
- [ ] **Webhook receive: tampered signature rejected.** Fired with bad signature → 401.
- [ ] **Webhook receive: replay drift rejected.** Fired with stale timestamp → 401.
- [ ] **Webhook idempotency.** Same event twice → processed once.
- [ ] **Recon mismatch surface.** OQMI fires a `recon.mismatch` for a test member → Cyrano pauses that member's wallet-mutating actions.
- [ ] **Rate limit honoured.** Burst > 100 req/min/IP → 429 with `Retry-After`. Don't auto-retry.

When all checked, ping OQMI for Alpha test scheduling.

---

## 10. Operational notes

- **Logging:** never log the secret, signature, or full request bodies on state-changing operations. Log `tenant_id`, `key_id`, `request_id`, verdict, escrow_id (if applicable), reason_code.
- **Time sync:** clock drift > 5 min breaks the integration entirely. Run NTP. Don't paper over with "send timestamp 10 min ahead."
- **HTTPS only.** Both outbound and inbound webhook URL must be HTTPS. Refuse to start if not.
- **Reconciliation pauses.** When you receive `recon.mismatch`, treat it as a hard pause for that user/wallet on the Cyrano side until OQMI clears it. Don't auto-clear on a timer.
- **Welfare Guardian.** Cyrano owns Welfare Guardian Score logic; RRR doesn't see it. If WGS forces a hard-decline on a Cyrano session, Cyrano simply doesn't make the RRR call. RRR has no opinion on it.

---

## 11. Out of scope for Alpha

- **Layer 3+ Cyrano surfaces** — only Layer 2 (whisper console) integrates with RRR for Alpha.
- **Cross-merchant redemption** — service exists at 1:1 (CEO B4); not surfaced in Cyrano UI for Alpha.
- **Real-time NATS bridge to RRR** — RRR is REST + webhook only. If Cyrano needs live updates, poll on focus or subscribe to webhooks. No NATS-to-RRR direct.
- **GGS (Global Gift System)** — deferred (CEO D5). Webhook-receive only on RRR side; nothing Cyrano needs to wire.
- **`rrr_member_tier`** — architected, nullable, not surfaced (CEO B2). Use only `merchant_tier`.

---

_This packet is Alpha-bound. Updates require a CHORE: commit and a note in the production schedule under ALP-7._
