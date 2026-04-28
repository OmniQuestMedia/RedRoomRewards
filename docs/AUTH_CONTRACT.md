# AUTH CONTRACT — RedRoomRewards

**Audience:** integrators building service-to-service connections to RRR — initial Phase-1 targets are the WordPress plugin for RedRoomPleasures and the Cyrano server stack. Future merchants follow the same contract.

**Status:** Alpha-frozen for the duration of the Alpha test. Changes require a CHORE/SECURITY ticket.

**Authority:** this document deferes to `docs/DOMAIN_GLOSSARY.md` (canonical naming) and `src/middleware/` (live implementation). On any conflict, the live code wins and this document gets a follow-up.

---

## 0. The two auth legs

RRR authenticates two completely different kinds of traffic. Don't mix them.

| Leg                    | Who's calling                                               | Auth scheme                                                        |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| **Service-to-service** | Merchant backends (WordPress plugin, Cyrano server, etc.)   | **Per-tenant HMAC-SHA256 request signing** (this document)         |
| **User-bound**         | A real human's browser/app calling RRR through an SSO flow  | **Keycloak-issued JWT bearer** (single realm for Alpha)            |

Webhooks (inbound and outbound) use the HMAC scheme — they are service-to-service traffic.

The rest of this document specifies the HMAC scheme. The Keycloak/JWT leg is governed by the existing `AuthMiddleware` (see `src/middleware/auth.middleware.ts`) and Keycloak realm config (separate document, post-Alpha).

---

## 1. Why HMAC and not JWT for service-to-service

Short version: rotation, replay protection, and field-of-fire.

- HMAC keys can be rotated per-tenant without coordinating user sessions.
- Built-in replay protection via signed timestamp + nonce.
- Body hash is part of the signature — a man-in-the-middle can't swap the payload.
- WordPress plugin error logs leak request bodies regularly. A leaked HMAC-signed request is useless after the replay window closes; a leaked JWT lives until expiry.
- The current inbound webhook handler already uses HMAC-SHA256 (`src/webhooks/webhook-receive.service.ts`); this contract generalises that pattern to all service-to-service traffic.

---

## 2. Credentials

Each merchant tenant gets:

- **`tenant_id`** — public; appears in headers and webhook payloads.
- **`api_key_id`** — public; identifies which key was used to sign (so we can rotate without breaking in-flight requests).
- **`api_secret`** — secret; 64 hex chars (256 bits). Never appears in any request, log, or response. Stored in a managed secret store (AWS Secrets Manager / DigitalOcean equivalent), never in repo or plaintext on disk.

Key issuance is OQMI-controlled. For Alpha:
- RedRoomPleasures and Cyrano each get a single active key pair.
- Keys rotate every **90 days** by default, or immediately on suspected compromise.
- Rotation is overlap-style: the new key becomes valid before the old key is revoked, so integrators have a window to swap.

---

## 3. Request envelope

Every service-to-service request (whether to RRR, or a webhook delivered by RRR) carries:

| Header              | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| `X-RRR-Tenant`      | the calling tenant's `tenant_id`                           |
| `X-RRR-Key-Id`      | the `api_key_id` of the active key being used to sign      |
| `X-RRR-Timestamp`   | RFC 3339 UTC timestamp of the request, e.g. `2026-04-28T13:42:00Z` |
| `X-RRR-Nonce`       | a unique opaque string per request (UUID v4 recommended)   |
| `X-RRR-Signature`   | hex-encoded HMAC-SHA256 of the canonical signing string (§4) |
| `Content-Type`      | `application/json` for any body-bearing request            |
| `X-Idempotency-Key` | required for state-changing operations (see §6)            |
| `X-Request-ID`      | optional; if absent, RRR generates one and returns it      |

Requests missing any required header MUST be rejected with `401 AUTH_REQUIRED` (no signature attempted) or `401 AUTH_INVALID` (signature attempted but failed).

---

## 4. Canonical signing string

The string that gets HMAC-signed is:

```
{HTTP_METHOD}\n
{REQUEST_PATH}\n
{X-RRR-Timestamp}\n
{X-RRR-Nonce}\n
{SHA256_HEX(request_body)}\n
```

Rules:
- `HTTP_METHOD` is uppercase (`POST`, `GET`, etc.).
- `REQUEST_PATH` is the path-and-query as the server sees it, including `/api/v1` prefix and any query string. No host, no scheme. Example: `/api/v1/earn?merchant=redroompleasures`.
- The two values from headers (`X-RRR-Timestamp`, `X-RRR-Nonce`) must match the headers byte-for-byte.
- `SHA256_HEX(request_body)` is the lowercase hex SHA-256 of the **raw bytes** of the request body. For an empty body, hash the empty string (`e3b0c44298fc1c14...`).
- `\n` is a literal newline (LF, 0x0A). No trailing newline after the body hash.

Then:

```
X-RRR-Signature = hex( HMAC_SHA256( api_secret, canonical_signing_string ) )
```

The verifier reconstructs the canonical string from the request and compares signatures using a **constant-time** comparison (`crypto.timingSafeEqual`). Plain `===` is forbidden — it leaks signature bytes through timing.

---

## 5. Replay window + nonce

- The verifier rejects any request whose `X-RRR-Timestamp` is more than **±5 minutes** from server time. This blunts replay attacks at the time axis.
- The verifier rejects any request whose `(tenant_id, nonce)` tuple has been seen before within a sliding window of the same length. This blunts replay attacks at the body axis.
- Clients with clocks more than 5 minutes out of sync MUST sync to NTP before integrating. The contract does not negotiate clock skew.

The nonce-seen cache lives in the same idempotency store as `X-Idempotency-Key` (see §6) but in a separate namespace.

---

## 6. Idempotency

Service-to-service callers MUST include `X-Idempotency-Key` on every state-changing request (any non-GET that mutates ledger or wallet state). Specifically:

- `POST /earn`
- `POST /redeem`
- `POST /wallets/{userId}/escrow/hold`
- `POST /wallets/escrow/{escrowId}/settle`
- `POST /wallets/escrow/{escrowId}/refund`
- `POST /wallets/escrow/{escrowId}/partial-settle`
- `POST /admin/refunds`
- `POST /admin/adjustments`
- `POST /webhooks/external/award`

Behaviour:

- Same key + identical payload → returns the original response. HTTP status reflects the original outcome (201 Created vs 200 OK).
- Same key + different payload → `400 IDEMPOTENCY_KEY_MISMATCH`. The client has a bug; do not retry blindly.
- Idempotency keys are scoped **per `tenant_id`**. Two tenants may legitimately use the same UUID; they don't collide.
- Idempotency keys persist for **7 days** by default (configurable). After that the key is forgotten and the same key may be reused without conflict, but in practice clients should always generate fresh UUIDs.

---

## 7. Webhook delivery (outbound, RRR → merchant)

When RRR emits a webhook to a merchant-registered endpoint, it signs the delivery using the same envelope as §3, with the merchant's `api_secret`. Implementation lives in `src/webhooks/webhook-emit.service.ts` (the in-flight HMAC-signing TODO closes against this spec).

Merchants verifying inbound deliveries from RRR:

1. Reject deliveries with timestamp drift > ±5 min.
2. Reconstruct the canonical signing string from §4.
3. Compute HMAC-SHA256 with the local copy of the `api_secret`.
4. Constant-time compare with `X-RRR-Signature`.
5. On mismatch: log the `X-Request-ID` and return 401. **Do not** echo the expected signature.

RRR retries failed deliveries with exponential backoff (1m, 5m, 30m, 2h, 12h) for up to 24 hours, using the **same** `X-Idempotency-Key` and `X-RRR-Nonce` so the receiver can deduplicate. After 24 hours the delivery is dead-lettered and surfaced via the OQMI Operator console.

---

## 8. Webhook receive (inbound, merchant → RRR)

The current implementation accepts inbound webhooks via `POST /webhooks/external/award` and verifies HMAC against `RRR_WEBHOOK_SECRET` (single system-level key). This is **Alpha-acceptable but not Alpha-final**: the Alpha-final state requires per-tenant keys.

Migration path (tracked as ALP-2 follow-up):
1. Add a `merchant_api_keys` collection (tenant_id, key_id, secret_hash, status, rotated_at).
2. Update `WebhookReceiveService.verifySignature` to look up the key by `(X-RRR-Tenant, X-RRR-Key-Id)` instead of a single env var.
3. Keep `RRR_WEBHOOK_SECRET` as a fallback for the system-level "platform → tenant" channel only.

Until that migration lands, Phase-1 merchants share a single `RRR_WEBHOOK_SECRET` rotated quarterly, with the explicit understanding that this is a transient state.

---

## 9. What this contract does NOT cover

- **Real human auth** — Keycloak / JWT bearer; see §0.
- **Internal service-to-service auth inside RRR** — handled at the deployment-network layer (private VPC, no exposed internal endpoints).
- **mTLS** — not in Alpha scope. May be revisited if compliance posture demands it post-Alpha.
- **OAuth flows** — not used. RRR doesn't broker third-party OAuth.

---

## 10. Reference implementation snippets

### 10.1 Signing a request (Node.js, integrator side)

```ts
import { createHash, createHmac, randomUUID } from 'crypto';

export function signRequest(opts: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body: string; // raw body bytes as a string; '' for empty
  apiSecret: string;
}): {
  timestamp: string;
  nonce: string;
  signature: string;
} {
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const bodyHash = createHash('sha256').update(opts.body).digest('hex');
  const canonical = [
    opts.method.toUpperCase(),
    opts.path,
    timestamp,
    nonce,
    bodyHash,
  ].join('\n');
  const signature = createHmac('sha256', opts.apiSecret)
    .update(canonical)
    .digest('hex');
  return { timestamp, nonce, signature };
}
```

### 10.2 Verifying a request (RRR side, conceptual)

```ts
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export function verifyRequest(opts: {
  method: string;
  path: string;
  body: string;
  headers: Record<string, string>;
  apiSecret: string;
  serverTime: Date;
}): boolean {
  const ts = opts.headers['x-rrr-timestamp'];
  const nonce = opts.headers['x-rrr-nonce'];
  const sig = opts.headers['x-rrr-signature'];
  if (!ts || !nonce || !sig) return false;

  const tsMs = Date.parse(ts);
  if (Number.isNaN(tsMs)) return false;
  if (Math.abs(opts.serverTime.getTime() - tsMs) > 5 * 60 * 1000) return false;

  const bodyHash = createHash('sha256').update(opts.body).digest('hex');
  const canonical = [
    opts.method.toUpperCase(),
    opts.path,
    ts,
    nonce,
    bodyHash,
  ].join('\n');
  const expected = createHmac('sha256', opts.apiSecret)
    .update(canonical)
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
```

(Nonce-seen check elided — see `IdempotencyService` for the real persistence layer.)

### 10.3 cURL example

```bash
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NONCE=$(uuidgen)
BODY='{"member_id":"abc-123","merchant_id":"redroompleasures","amount":42.00,"currency":"USD"}'
BODY_HASH=$(printf "%s" "$BODY" | openssl dgst -sha256 -hex | awk '{print $2}')
CANON=$(printf "POST\n/api/v1/earn\n%s\n%s\n%s" "$TS" "$NONCE" "$BODY_HASH")
SIG=$(printf "%s" "$CANON" | openssl dgst -sha256 -hmac "$API_SECRET" -hex | awk '{print $2}')

curl -X POST https://api-staging.redroomrewards.com/api/v1/earn \
  -H "X-RRR-Tenant: redroompleasures" \
  -H "X-RRR-Key-Id: $API_KEY_ID" \
  -H "X-RRR-Timestamp: $TS" \
  -H "X-RRR-Nonce: $NONCE" \
  -H "X-RRR-Signature: $SIG" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

---

## 11. Failure modes (how RRR rejects)

| Reason                                        | HTTP | Code                       |
| --------------------------------------------- | ---- | -------------------------- |
| Missing required auth header                  | 401  | `AUTH_REQUIRED`            |
| Unknown `X-RRR-Tenant` or `X-RRR-Key-Id`      | 401  | `AUTH_INVALID`             |
| Timestamp out of window                       | 401  | `AUTH_INVALID`             |
| Nonce already seen for this tenant            | 401  | `AUTH_INVALID`             |
| Signature mismatch                            | 401  | `AUTH_INVALID`             |
| Body hash didn't match what was signed        | 401  | `AUTH_INVALID`             |
| Idempotency key reused with different payload | 400  | `IDEMPOTENCY_KEY_MISMATCH` |
| Tenant key revoked                            | 401  | `AUTH_INVALID`             |
| Tenant scope violation (cross-tenant access)  | 403  | `TENANT_SCOPE_VIOLATION`   |

Error responses include `X-Request-ID` so integrators can quote it to support without leaking detail to attackers.

---

## 12. Operational notes

- All HMAC verification is fail-closed (per the security wiring already shipped in #312–#314). A misconfigured server rejects rather than accepts.
- Logs MUST never contain the `api_secret`, the request signature, or full request bodies. Log only `tenant_id`, `key_id`, `request_id`, and verdict.
- Key rotation procedure lives in the operational runbook (post-Alpha deliverable).
- Integrator support: integrators failing repeatedly with `AUTH_INVALID` and a fresh `X-Request-ID` are the canonical "ask for help" signal. The OQMI Operator console (post-Alpha) will surface a per-tenant verification-failure dashboard.

---

_This contract is Alpha-frozen. Updates require a CHORE: commit and a note in the production schedule under the ALP-2 row._
