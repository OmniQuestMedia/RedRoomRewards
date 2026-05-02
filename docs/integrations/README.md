# Merchant Integration Packets

Per-merchant integration handoff packets for Phase-1 Alpha. Each packet tells one integrator team exactly what to build, with code samples bound to the live API surface and a smoke-test checklist they can run against staging.

**Read first:**

- `docs/AUTH_CONTRACT.md` — HMAC service-to-service auth (the auth model both merchants implement)
- `docs/UX_INTEGRATION_BRIEF.md` — error codes, idempotency, rate-limit envelope, reason-code catalog
- `api/openapi.yaml` — full API contract (Alpha-frozen)

**Phase-1 merchants (in this directory):**

| Merchant         | Packet                                          | Status |
| ---------------- | ----------------------------------------------- | ------ |
| RedRoomPleasures | [`redroompleasures-wordpress.md`](./redroompleasures-wordpress.md) | draft  |
| Cyrano           | [`cyrano.md`](./cyrano.md)                      | draft  |

**Phase-2 (deferred — out of Alpha scope):** ChatNow.Zone — separate packet authored when CNZ Alpha is closer to integration.

---

## What's the same across both packets

- HMAC-SHA256 service-to-service signing per `docs/AUTH_CONTRACT.md` §4.
- `X-Idempotency-Key` required on every state-changing POST.
- `X-Request-ID` echoed in every response for support quoting.
- Same error-code catalog (`docs/UX_INTEGRATION_BRIEF.md` §7).
- Webhook delivery shape is identical regardless of which merchant receives it.
- Same key rotation cadence: 90 days, overlap-style.

## What's different

- **Operational surface** — RedRoomPleasures is e-commerce-shaped (purchase → earn, checkout → redeem). Cyrano is session-shaped (chip-menu purchase → escrow hold → settle on completion).
- **Hosting profile** — RedRoomPleasures is a WordPress plugin running on the merchant's PHP host. Cyrano is a Node/TypeScript backend running on its own infra.
- **Webhook surface** — Cyrano subscribes to settlement, fraud-signal, and reconciliation webhooks. RedRoomPleasures subscribes to a smaller set (earn-confirmed, refund-applied).
- **Test fixtures** — different sample payloads suited to each merchant's domain.

## How to use these packets

For each integrator team:

1. Read the packet end-to-end before writing code.
2. Run the smoke-test checklist against staging when staging is provisioned.
3. File integration questions as GitHub issues against `OmniQuestMediaInc/RedRoomRewards` with the `integration:<merchant>` label.
4. When ready for Alpha test, ping the OQMI Operator console for the per-tenant HMAC key pair.
