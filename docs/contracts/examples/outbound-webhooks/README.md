# Outbound Webhook Delivery Samples

These JSON files are concrete examples of the webhook payloads RRR sends to a
merchant-registered receive URL. They mirror the live shape produced by
`src/webhooks/webhook-emit.service.ts` and the dispatching services
(`fraud-signal.service.ts`, the wallet escrow flows, the reconciliation job, and
the expiration-warning emitter).

**Audience:** Phase-1 integrators (RedRoomPleasures WordPress plugin, Cyrano
server stack) who need to build a verifier and a payload parser before staging
is up.

**Authority:** these samples are illustrative — the live wire format is what
`webhook-emit.service.ts` produces. If they diverge, the live code wins and this
directory gets a follow-up. The HMAC envelope these payloads ride under is
governed by [`docs/AUTH_CONTRACT.md`](../../../AUTH_CONTRACT.md); the body shape
is what's documented here.

## File index

| File                      | Event                | Emitted by                                                         |
| ------------------------- | -------------------- | ------------------------------------------------------------------ |
| `escrow-settled.json`     | `escrow.settled`     | `WalletService.settleEscrow` after a successful settle             |
| `escrow-refunded.json`    | `escrow.refunded`    | `WalletService.refundEscrow` after a refund                        |
| `escrow-partial.json`     | `escrow.partial`     | `WalletService.partialSettleEscrow` after a partial settle         |
| `fraud-signal.json`       | `fraud.signal`       | `FraudSignalService.detectFraud` when one or more patterns trigger |
| `recon-mismatch.json`     | `recon.mismatch`     | `ReconciliationService` when calculated ≠ actual balance           |
| `expiration-warning.json` | `expiration.warning` | Expiration job when a PointLot enters the warning window           |
| `refund-applied.json`     | `refund.applied`     | `AdminOpsService` when an operator-issued refund posts             |

## Envelope wrapper

Every delivery is wrapped in the canonical `WebhookPayload` envelope from
`src/webhooks/webhook-emit.service.ts`:

```json
{
  "event": "<dot.separated.event.type>",
  "emittedAt": "<ISO 8601 UTC timestamp>",
  "data": { ...event-specific payload... }
}
```

The HMAC signature in the `X-RRR-Signature` header is computed over the **raw
bytes** of the entire envelope. Don't reconstruct `data` after parsing and
re-stringify — small differences in key ordering or whitespace will break the
signature. Verify against the bytes you received.

## Verifying a sample locally

```bash
# Compute the body hash of escrow-settled.json
sha256sum docs/contracts/examples/outbound-webhooks/escrow-settled.json
```

The hex digest is what would appear in the §4 canonical signing string at the
body-hash position.

## What's intentionally not here

- **Headers** — those are envelope concerns governed by AUTH_CONTRACT §3.
- **Per-tenant variants** — `tenant_id` is always set to a placeholder
  (`tenant-example`) here. Live deliveries will use the actual tenant.
- **Retry metadata** — RRR retries with the same body and the same nonce; retry
  counters are out-of-band (look at the retry header set, not the body).
