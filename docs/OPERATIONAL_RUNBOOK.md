# Operational Runbook — RedRoomRewards

**Audience:** OQMI ops / on-call engineers responsible for staging and
(post-Alpha) production. Also useful for integrators when they need to know how
their ticket gets handled.

**Status:** draft. Living document — refined after every real incident.

**Authority:** defers to `docs/AUTH_CONTRACT.md`, `docs/STAGING_DEPLOY_SPEC.md`,
`docs/ALPHA_TEST_PACK.md`, and the live invariants in
`.github/PRODUCTION_SCHEDULE.md`. On any conflict, those win.

---

## 0. Invariants — never violate these, even under pressure

Before any procedure below, internalize these. If a remediation step would break
one, **stop and escalate**.

- **The ledger is append-only.** Never `UPDATE` or `DELETE` a `LedgerEntry` row.
  Reversals are new entries linked by `correlation_id`.
- **`Wallet.balance == sum(PointLot.remaining) == sum(LedgerEntry.delta)`** at
  all times. If you find a mismatch, the answer is _not_ to "fix" the wallet
  field — the answer is to author a compensating ledger entry with
  `reason_code: REVERSAL` and a documented reason.
- **No hardcoded balance values in `src/`** outside test files. CI guards this.
- **Every Model query in services/wallets/ledger includes `tenant_id`** filter.
  CI guards this.
- **`mongoose.startSession` transactions only** for multi-model wallet
  mutations.
- **Slot machine + chance-based game logic stays retired** (CEO D1).
- **Diamond Concierge tier earns zero** (CEO D3).

---

## 1. Severity classification

| Severity | Definition                                                                       | Response time     | Examples                                                                                                     |
| -------- | -------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| **P0**   | Invariant breach, data loss, or full outage. Money is or could be wrong.         | < 15 min          | `RECON_MISMATCH` flag fires; wallet balance ≠ ledger sum; auth fails open; full DB outage                    |
| **P1**   | Major feature broken; one tenant's integration down; meaningful customer impact. | < 1 hour          | A Phase-1 merchant can't earn or redeem; webhook delivery has been failing > 1 hour; signup endpoint flooded |
| **P2**   | Degraded but functional; small subset affected.                                  | < 4 hours         | One member's wallet stuck; rate-limit too tight for legitimate burst; logging gap                            |
| **P3**   | Cosmetic / informational; not blocking anything.                                 | next business day | Documentation drift; non-critical metric missing; copy slot reads weird                                      |

**Escalation rule:** when in doubt, classify higher and de-escalate later.
Better to over-react to a P0 that's actually a P2 than the inverse.

---

## 2. On-call basics

**For Alpha:** there is no formal on-call rotation. Kevin is on-call by default.
Add this section to the runbook when a second engineer joins the rotation.

**Contact tree (Alpha):**

1. Kevin Hartley (CEO / acting on-call) — all P0 / P1.
2. Phase-1 integrators (RedRoomPleasures plugin author, Cyrano backend lead) —
   only when their tenant is the affected one.
3. DigitalOcean support — for infra-side outages on staging compute / Spaces.
4. MongoDB Atlas support — for DB-side outages.

**What to grab on receiving an alert:**

- The `request_id` (or `event_id` for webhook deliveries) that triggered it.
- The affected `tenant_id` and (if applicable) `user_id`.
- The relevant log slice (90-day hot tier — see §10).
- The current state of `/health`.

---

## 3. Procedure — `RECON_MISMATCH` fires

**Severity:** P0 by default.

A reconciliation mismatch means the ledger and the wallet projection diverged.
RRR has paused mutating operations on the affected wallet pending investigation.

1. Confirm the alarm:
   ```bash
   npm run reconcile -- --tenant-id=<tenant> --user-id=<user>
   ```
   Should reproduce the mismatch report. If it doesn't, the issue may have
   self-resolved — but **do not** clear the pause until you understand why.
2. Identify the divergence:
   - Run `GET /admin/transactions/{id}/audit` for the most recent few entries on
     the affected wallet.
   - Compare `LedgerEntry.delta` running sum against `Wallet.balance`.
   - Compare `sum(PointLot.remaining)` against both.
   - Identify which is wrong.
3. Author a compensating ledger entry:
   - **Never** `UPDATE` the `Wallet.balance` field directly.
   - File a CHORE/FIZ ticket documenting the divergence and the proposed
     reversal entry's `reason_code` and `correlation_id`.
   - Apply via `POST /admin/adjustments` with the compensating delta and
     `reason_code: REVERSAL`.
4. Re-run `npm run reconcile`. Expect zero discrepancies.
5. Clear the pause via the OQMI Operator console.
6. **Post-incident:** write a 1-page note in `docs/history/` with date, root
   cause, and the compensating entry's `correlation_id`. This is the audit
   trail.

**Never bypass the pause to "ship a fix."** The pause exists because the ledger
is the source of truth and divergence indicates either a code bug or data
tampering.

---

## 4. Procedure — Auth failing open or auth wedged closed

### 4.1 Auth failing open (a request without valid signature succeeded)

**Severity:** P0.

This violates the fail-closed wiring landed in #312–#314. The system should
never accept an unsigned or invalid-signature request on a non-public route.

1. **Pull the affected route off the load balancer immediately** (DigitalOcean
   App Platform → roll back to the previous deploy).
2. Identify the offending PR/commit:
   ```bash
   git log --oneline src/middleware/ src/config/route-policy.ts
   ```
3. Verify CI guard `B-9` from the Alpha test pack still passes against `main`.
4. Cut a P0 fix on a fresh branch; do not let it auto-merge.
5. After deploy: re-run the entire Bucket B (auth boundary) test pack against
   staging.
6. Post-incident note in `docs/history/`.

### 4.2 Auth wedged closed (legitimate signed requests rejected)

**Severity:** P1 if a tenant is fully blocked, P2 otherwise.

1. Verify the integrator's clock — > 5 min skew is the most common cause.
2. Verify the integrator's `api_key_id` matches an active key (not revoked, not
   expired-out-of-overlap-window).
3. Verify the canonical signing string the integrator constructs matches the
   spec (`docs/AUTH_CONTRACT.md` §4) — most common bug is a missing trailing
   newline or wrong path (excluding `/api/v1` prefix).
4. Have the integrator log the canonical string they sign and compare
   byte-for-byte with what RRR computes (logged under `tenant_id`, `key_id`,
   verdict — never the secret).
5. If still wedged after the above, rotate the key (overlap-style) — RRR-side
   bug is unlikely but possible.

---

## 5. Procedure — Key rotation

### 5.1 Per-tenant HMAC key rotation (90-day cadence)

1. Generate a new `api_key_id` and `api_secret`:
   ```bash
   openssl rand -hex 32  # secret
   uuidgen               # key_id, or use a memorable suffix
   ```
2. Insert the new key into the `merchant_api_keys` collection with
   `status: active`, `valid_from: now`, `valid_until: null` for the new key.
   Mark the old key `status: rotating`, `valid_until: now + 7 days`.
3. Hand the new credentials to the integrator over a secure channel — never
   email, never Slack DM. Use a one-time-link service, an in-person handoff, or
   PGP-encrypted file.
4. Confirm the integrator has switched (their first request signed with the new
   `api_key_id` is the signal).
5. After 7 days (the overlap window), revoke the old key:
   ```
   merchant_api_keys.update({ key_id: <old> }, { status: revoked })
   ```
6. Verify revocation: integrator clients still configured with the old key now
   get `401 AUTH_INVALID`.

### 5.2 `RRR_WEBHOOK_SECRET` rotation (quarterly, until per-tenant migration lands)

This is the system-level fallback per `docs/AUTH_CONTRACT.md` §8.

1. Generate a new secret.
2. Set `RRR_WEBHOOK_SECRET_NEW` in DO App Platform env vars (alongside the old
   one).
3. Update `WebhookReceiveService.verifySignature` to accept either secret during
   the transition window (separate small PR).
4. Have integrators switch to the new secret.
5. After confirmation, remove the old secret env var and the dual-accept code.

### 5.3 Keycloak realm signing keys

Managed by Keycloak itself. Default rotation: 90 days, automatic. Procedure:

1. In the Keycloak admin console, generate a new key for the `rrr-alpha` realm.
2. Promote it to the active signing key.
3. Wait one full session-token TTL (8 hours per `STAGING_DEPLOY_SPEC.md` §5.3)
   before deactivating the old key.
4. Deactivate (don't delete — keep for verification of historical tokens).
5. Export the realm config and commit the redacted JSON to a separate private
   repo for audit.

### 5.4 Compromise-induced rotation

If a secret is suspected leaked:

- **Immediate:** revoke the old key (skip the overlap window). Integrator goes
  down for the time it takes them to swap.
- **Within 1 hour:** new credentials in their hands.
- **Within 24 hours:** post-incident report covering how the leak happened, what
  was exposed, what was logged that shouldn't have been, and what guard rails
  get added.

---

## 6. Procedure — Webhook delivery failures

**Severity:** P1 if a tenant is missing webhooks > 1 hour; P2 otherwise.

RRR retries failed deliveries with exponential backoff (1m, 5m, 30m, 2h, 12h)
for up to 24h, then dead-letters.

1. Check the dead-letter queue for the affected tenant (post-Alpha: a real DLQ;
   for Alpha: a log query for `webhook delivery exhausted`).
2. Check if the receiver endpoint is reachable from staging:
   ```bash
   curl -I https://<merchant-webhook-url>
   ```
3. If receiver is down: notify the integrator. They fix their endpoint; you can
   re-fire dead-lettered events from the operator console after they confirm.
4. If receiver returns 4xx (probably auth-related on their side): walk them
   through verifying their HMAC implementation against §10 of
   `docs/AUTH_CONTRACT.md`. Most common bugs are listed in §4.2 above.
5. If receiver is silently 200-OK-but-not-processing: that's their bug. Their
   endpoint must be idempotent; their problem to debug.

**Never re-fire a dead-lettered webhook without confirming with the integrator**
— they may have processed it via a side channel and double-firing creates
duplicate side effects.

---

## 7. Procedure — Rate-limit issues

### 7.1 Legitimate burst hitting the limit

**Severity:** P2.

If a Phase-1 merchant is doing legitimate traffic that hits 100/min/IP:

1. Confirm legitimacy (look at the requests — are they real customer-driven, or
   a runaway loop?).
2. If a runaway loop: ask the integrator to fix their retry logic. Don't loosen
   the limit.
3. If genuine traffic growth: raise the per-tenant limit via env var
   (`RATE_LIMIT_PER_MINUTE`) in DO App Platform. Document the new value in this
   runbook.
4. Per-tenant limits are stored as env-vars-with-tenant-suffix; eventually move
   to a DB-backed config (ALP-7 follow-up, post-Alpha).

### 7.2 Signup-endpoint flood (RISK-002)

**Severity:** P0 if it's actually a credential-stuffing attack; P2 if it's just
bot noise.

The signup limit is 5/min/IP and intentionally tight. If you're seeing it trip:

1. Check the source IPs. Concentrated on a small range =
   bot/credential-stuffing.
2. Add the offending IP range to the WAF / Cloudflare blocklist (out of RRR's
   control; ops-side action).
3. Do **not** loosen `SIGNUP_RATE_LIMIT_PER_MINUTE` to make the alarm stop. The
   alarm is the feature.

---

## 8. Procedure — DB outage / Atlas issues

**Severity:** P0 if Atlas is fully unreachable.

1. Confirm via Atlas console. If yes, `/health` will already be returning 503
   (D-005).
2. Get the Atlas status URL and incident ID; surface it to integrators so they
   know it's not their fault.
3. Wait for Atlas to recover. Don't fail over manually unless you've practiced
   the procedure (Alpha hasn't — schedule a drill before production).
4. After recovery: run `npm run reconcile` against the affected tenant(s). Look
   for any in-flight transaction that was interrupted mid-write —
   `mongoose.startSession` should have rolled them back, but verify.

**Connection pool exhaustion** is a separate failure mode:

- Symptoms: requests time out without DB errors; staging stays at 100% CPU.
- Cause: usually a leaked transaction or a runaway aggregation.
- Fix: bounce the App Platform deploy. Then root-cause the leak.

---

## 9. Procedure — Deployment + rollback

### 9.1 Normal staging deploy

DO App Platform auto-deploys on push to `main`. CI must be green.

1. Watch the deploy in DO console.
2. After deploy completes, hit `/health` from a staging-reachable client.
3. Smoke-test the most recently changed surface manually (e.g. if the change
   touched escrow, run a hold→settle round trip).

### 9.2 Rollback

DO App Platform → Deployments → select previous deploy → "Rollback to this
deploy."

Rollback preserves DB state. If the rolled-back code is incompatible with a
schema change that landed in the bad deploy, you have a bigger problem — see
§11.

### 9.3 Production deploy (post-Alpha)

Production should be tag-based, not branch-based:

1. Cut `v0.X.Y` tag at a known-good `main` SHA.
2. CI builds against the tag.
3. Manual approval gate (CEO or designated approver).
4. Deploy to production.
5. Smoke-test against production immediately.

This procedure gets fleshed out as part of production-readiness, not Alpha.

---

## 10. Logging access

**Hot tier (90 days):** DO App Platform built-in log retention for the API;
`journalctl` on the Keycloak Droplet.

Search by:

- `request_id` — single-request trace.
- `tenant_id` — all activity for one merchant.
- `user_id` — all activity for one member (RRR will surface this only to
  operators with appropriate role).
- Severity (`error`, `warn`, `info`).

**Cold tier (1 year):** DigitalOcean Spaces bucket `rrr-cold-logs`, partitioned
by date. Restore via `mc cp` (Minio client) or the DO web UI. Decompress and
grep.

**What never gets logged:**

- Bearer tokens (full or partial).
- HMAC signatures (full or partial).
- `api_secret` values.
- Full request bodies for state-changing operations.
- PII beyond what's necessary for tracing.

If you find any of the above in logs, it's a P0 — see §4.1 procedure but for log
hygiene; redact, then investigate the source.

---

## 11. Procedure — Schema migration breaks an in-flight deploy

**Severity:** P0.

Mongoose schema changes can render the previous deploy incompatible with the
current data shape. If you've rolled back code but the schema is forward, you
may be unable to read records.

1. **Stop.** Don't roll back the schema reflexively — you may lose data.
2. Snapshot Atlas point-in-time (recovery to a sibling cluster, not in-place).
3. With the snapshot in hand, evaluate:
   - Can the previous code be patched to tolerate the new schema (additive
     change)? → patch it forward.
   - Is the schema change destructive (column dropped, type changed)? → restore
     from backup; cutover; redeploy the bad change after fixing.
4. Migration scripts live in `infra/migrations/` and should always be
   additive-then-cleanup, never destructive in one pass. If a migration tried to
   drop and add in one step, that's the bug.

---

## 12. Procedure — Integrator support requests

**Severity:** typically P2 / P3.

Integrators (RedRoomPleasures plugin author, Cyrano team) may file issues
against the RRR repo with the `integration:<merchant>` label.

Standard response shape:

1. Ask for the `request_id` from the failing call. Without it, no investigation
   is possible.
2. Look up the request in logs (§10). The verdict + reason will be there.
3. If it's a spec-deviation in their implementation: point them at the relevant
   `docs/integrations/<merchant>.md` section and the canonical reference
   (`AUTH_CONTRACT.md`, `UX_INTEGRATION_BRIEF.md`).
4. If it's a real RRR-side bug: file a CHORE / FIZ / SVC ticket against the
   repo, link it to the integrator's issue, and proceed normally.
5. Close the integrator's issue when their integration smoke-test
   (`docs/integrations/<merchant>.md` §smoke-test) passes for the affected case.

---

## 13. Backup + restore drill

Run quarterly until production go-live; monthly thereafter.

1. **Atlas:** trigger a PITR restore to a sibling cluster (≤ 30 min back).
   Verify schema and a sample of ledger entries.
2. **Keycloak:** export the realm config to JSON; verify against the spec in
   `docs/KEYCLOAK_REALM_SPEC.md`. Re-import into a sibling Keycloak instance and
   verify roles, groups, and one test user can sign in.
3. **DigitalOcean Droplet:** restore the most recent daily snapshot to a temp
   Droplet; verify Caddy config and Keycloak boots.
4. **Spaces:** download a sample log archive; verify decompression and content.

Document the drill timing in this runbook (§14 below).

---

## 14. Drill log

| Date         | What was drilled                        | Result | Notes |
| ------------ | --------------------------------------- | ------ | ----- |
| _(none yet)_ | _(first drill scheduled at staging-up)_ | _—_    | _—_   |

Append a row after every drill. Don't delete rows.

---

## 15. Open items

- **Real on-call rotation** — single-engineer Alpha. Plan a 2-person rotation as
  a precondition for production go-live.
- **Status page** — public status page (e.g. status.redroomrewards.com) deferred
  to production. For Alpha, status communication is direct to integrators.
- **Per-tenant HMAC key store migration** — currently Phase-1 merchants share
  `RRR_WEBHOOK_SECRET`; per-tenant store is ALP-7 follow-up. Until then, §5.2
  procedure applies.
- **Automated alerting** — for Alpha, alerts go to Kevin manually via DO uptime
  probe. Production needs PagerDuty / Better Uptime / equivalent.
- **Disaster-recovery runbook** — RPO/RTO targets, full-region-loss procedure.
  Production-readiness deliverable, not Alpha.
- **Audit log immutability proof** — periodic export-and-hash of the ledger to
  an external store. Compliance hardening, post-Alpha.

---

_This runbook is a living document. Updates require a CHORE: commit. Append,
don't rewrite, when a new incident teaches a new procedure._
