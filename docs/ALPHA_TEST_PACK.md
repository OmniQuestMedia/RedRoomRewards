# Alpha Test Pack — RedRoomRewards

**Audience:** whoever runs Alpha test against staging — likely a QA-shaped
engineer with light support from OQMI ops.

**Purpose:** describe exactly what gets exercised against staging before
`v0.1.0-alpha.1` is declared production-ready, and what the pass/fail bar is for
each test.

**Status:** draft. Becomes runnable when staging (per
`docs/STAGING_DEPLOY_SPEC.md`) is up and the Phase-1 merchant integration
packets (`docs/integrations/`) have been implemented.

**Authority:** defers to the live API contract (`api/openapi.yaml`), the auth
contract (`docs/AUTH_CONTRACT.md`), and the UX integration brief
(`docs/UX_INTEGRATION_BRIEF.md`).

---

## 1. What Alpha test is and isn't

**It is:**

- A staging exercise of the surfaces a real Phase-1 merchant will use.
- Verification of the financial-systems invariants that don't permit "we'll fix
  it later" failures.
- Verification that the security boundary holds — no cross-tenant access, no
  fail-open auth.
- A small enough scope that one engineer can run it end-to-end in a day or two.

**It is not:**

- A load test (deferred to production-readiness).
- A chaos test (deferred — staging doesn't have the topology for it).
- An exhaustive feature regression (the unit + integration suite in CI is the
  regression net).
- Anything that touches mainnet payment rails (none exist for Alpha).
- A UX usability test (the wireframes + creative-agency cycle handle that
  separately).

---

## 2. Pre-flight

Staging must be green before any test runs. From `docs/STAGING_DEPLOY_SPEC.md`
§9:

- [ ] DigitalOcean App Platform app deployed at `api-staging.redroomrewards.com`
- [ ] DigitalOcean Droplet running Keycloak at `auth-staging.redroomrewards.com`
- [ ] MongoDB Atlas cluster live in ca-central-1, replica set, network locked
- [ ] PrivateLink / VPC peering verified (no public DB exposure)
- [ ] All env vars wired from secret manager
- [ ] DNS records pointed at the right load balancers; TLS auto-renewing
- [ ] `GET /health` returns 200 with DB connectivity + version
- [ ] `GET /api/docs` is **not** reachable in production-mode staging (NODE_ENV
      gate)
- [ ] Phase-1 tenant rows seeded for `redroompleasures` and `cyrano` with HMAC
      keys generated
- [ ] CI green at HEAD: `npm run test:ci` + all File & Schema Checks

If any pre-flight item is red, **do not start the test pack**. Surface to ops
and unblock first.

---

## 3. Test fixtures

The test pack uses known-good fixtures seeded at staging-up. Re-seedable via
`npm run seed:alpha-staging` (script TBD as part of staging provisioning).

| Fixture                    | ID / value                | Notes                                     |
| -------------------------- | ------------------------- | ----------------------------------------- |
| Tenant: RedRoomPleasures   | `redroompleasures`        | Phase-1 merchant tier defaults            |
| Tenant: Cyrano             | `cyrano`                  | Phase-1 merchant tier defaults            |
| Member (GOLD tier)         | `test-member-gold-001`    | Starting balance: 5,000 RRR Points        |
| Member (PLATINUM tier)     | `test-member-plat-001`    | Starting balance: 10,000 RRR Points       |
| Member (Diamond Concierge) | `test-member-diamond-001` | Starting balance: 0; earn must be blocked |
| Member (zero balance)      | `test-member-empty-001`   | Starting balance: 0                       |
| Model                      | `test-model-001`          | Starting allocation: 2,500 RRR Points     |
| Operator (OQMI)            | `test-operator-oqmi-001`  | Cross-tenant role                         |
| Operator (RRP admin)       | `test-operator-rrp-001`   | Tenant-scoped to redroompleasures         |
| Operator (Cyrano admin)    | `test-operator-cyr-001`   | Tenant-scoped to cyrano                   |

All test member IDs are prefixed `test-` so production data filters can exclude
them post-Alpha.

---

## 4. Bucket A — Financial Invariants

**Goal:** verify that the wallet, ledger, and escrow invariants hold under the
operations a real merchant will perform. Anything that violates an invariant is
a **ship blocker**.

### A-1 — Earn happy path

| Step | Action                                                                               | Expected                                                                                   |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 1    | `GET /wallets/test-member-gold-001/balance` — record starting balance                | 200; `available = 5000`                                                                    |
| 2    | `POST /earn` from `redroompleasures` tenant, `amount: $42.00`, fresh idempotency key | 201; `points_credited > 0`; `request_id` set                                               |
| 3    | `GET /wallets/test-member-gold-001/balance` again                                    | 200; balance increased by exactly the credit                                               |
| 4    | `GET /ledger/transactions?user_id=test-member-gold-001`                              | new `LedgerEntry` present with `reason_code: PROMOTIONAL_AWARD`, non-null `correlation_id` |

**Pass criteria:** balance increment matches ledger delta exactly. Non-null
`correlation_id` and `reason_code` per the invariant.

### A-2 — Earn idempotent replay

| Step | Action                                              | Expected                                      |
| ---- | --------------------------------------------------- | --------------------------------------------- |
| 1    | Repeat A-1 step 2 with **same** `X-Idempotency-Key` | 200 (not 201); same `ledger_entry_id`         |
| 2    | `GET /wallets/.../balance`                          | balance unchanged from end of A-1             |
| 3    | `GET /ledger/transactions?...`                      | exactly **one** ledger entry from this action |

**Pass criteria:** zero duplicate side-effects.

### A-3 — Earn idempotency mismatch

| Step | Action                                               | Expected                       |
| ---- | ---------------------------------------------------- | ------------------------------ |
| 1    | Repeat A-1 step 2 with same key but `amount: $50.00` | 400 `IDEMPOTENCY_KEY_MISMATCH` |
| 2    | `GET /wallets/.../balance`                           | balance unchanged              |

**Pass criteria:** payload tampering is rejected without affecting state.

### A-4 — Redeem within tier cap

| Step | Action                                                                               | Expected                                                                      |
| ---- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1    | `POST /redeem` for GOLD member, points = 30% of `transaction_value` (within 35% cap) | 201; `points_redeemed > 0`                                                    |
| 2    | `GET /wallets/.../balance`                                                           | available decreased by exactly redeemed amount                                |
| 3    | `GET /ledger/transactions?...`                                                       | new entry with `reason_code: MERCHANT_ORDER_REDEMPTION`, `correlation_id` set |

**Pass criteria:** balance decrement matches ledger delta exactly.

### A-5 — Redeem above tier cap

| Step | Action                                                     | Expected                |
| ---- | ---------------------------------------------------------- | ----------------------- |
| 1    | `POST /redeem` for GOLD member at 40% of transaction_value | 403 `TIER_CAP_EXCEEDED` |
| 2    | `GET /wallets/.../balance`                                 | balance unchanged       |

### A-6 — Redeem with insufficient balance

| Step | Action                                                         | Expected                   |
| ---- | -------------------------------------------------------------- | -------------------------- |
| 1    | `POST /redeem` for `test-member-empty-001` with any amount > 0 | 403 `INSUFFICIENT_BALANCE` |
| 2    | balance read                                                   | still zero                 |

### A-7 — Escrow hold + settle (Cyrano shape)

| Step | Action                                                                                             | Expected                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1    | `POST /wallets/test-member-gold-001/escrow/hold` for 500 points, `reason_code: CHIP_MENU_PURCHASE` | 201; `escrow_id` returned; available decreased by 500; escrow_balance increased by 500     |
| 2    | `POST /wallets/escrow/{escrow_id}/settle` with `model_id: test-model-001`, `amount: 500`           | 201; escrow → SETTLED                                                                      |
| 3    | `GET /wallets/test-member-gold-001/balance`                                                        | escrow_balance back to prior; available unchanged from step 1                              |
| 4    | `GET /models/test-model-001/wallet`                                                                | allocation increased by 500                                                                |
| 5    | Ledger query filtered by escrow_id                                                                 | exactly two entries (hold + settle), both with non-null correlation_id matching each other |

### A-8 — Escrow hold + refund

| Step | Action                                                                          | Expected                             |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------ |
| 1    | Hold a fresh escrow of 300 points                                               | 201                                  |
| 2    | `POST /wallets/escrow/{escrow_id}/refund` with `reason_code: USER_DISCONNECTED` | 201; escrow → REFUNDED               |
| 3    | Member balance read                                                             | available restored to pre-hold value |
| 4    | Model allocation read                                                           | unchanged                            |

### A-9 — Escrow partial-settle

| Step | Action                                                                                            | Expected                                              |
| ---- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1    | Hold 1,000 points                                                                                 | 201                                                   |
| 2    | `POST /wallets/escrow/{escrow_id}/partial-settle` with `settle_amount: 700`, `refund_amount: 300` | 201; escrow → PARTIAL                                 |
| 3    | Member balance                                                                                    | available increased by 300 (refund); escrow back to 0 |
| 4    | Model allocation                                                                                  | increased by 700                                      |
| 5    | Partial-settle with mismatched amounts (e.g. 600 + 300 against 1000)                              | 400 `VALIDATION_ERROR`                                |

### A-10 — Escrow already-terminal protection

| Step | Action                           | Expected                      |
| ---- | -------------------------------- | ----------------------------- |
| 1    | Settle an already-settled escrow | 409 `ESCROW_ALREADY_TERMINAL` |
| 2    | Refund an already-settled escrow | 409 `ESCROW_ALREADY_TERMINAL` |
| 3    | Settle a refunded escrow         | 409 `ESCROW_ALREADY_TERMINAL` |

### A-11 — Diamond Concierge zero-earn

| Step | Action                                     | Expected               |
| ---- | ------------------------------------------ | ---------------------- |
| 1    | `POST /earn` for `test-member-diamond-001` | 422 `EARN_NOT_ALLOWED` |
| 2    | balance read                               | unchanged              |
| 3    | ledger query                               | no new entry           |

### A-12 — Reconciliation invariant

After all of A-1 through A-11 have run:

- [ ] For every test member:
      `wallet.available == sum(active PointLot.remaining) == sum(LedgerEntry.delta)`.
- [ ] No `RECON_MISMATCH` events fired during the run.
- [ ] Run `npm run reconcile` against the staging DB; result is zero
      discrepancies.

**Pass criteria for Bucket A:** every test passes. Any failure is a ship blocker
— investigate, fix, re-run the bucket.

---

## 5. Bucket B — Tenant + Auth Boundary

**Goal:** verify the security boundary holds. Failures here are also ship
blockers — they cannot ship behind a feature flag.

### B-1 — Unsigned request rejected

| Step | Action                                        | Expected            |
| ---- | --------------------------------------------- | ------------------- |
| 1    | `POST /earn` with no `X-RRR-Signature` header | 401 `AUTH_REQUIRED` |

### B-2 — Tampered signature rejected

| Step | Action                                                                         | Expected           |
| ---- | ------------------------------------------------------------------------------ | ------------------ |
| 1    | `POST /earn` with all headers correct except signature flipped to a wrong hash | 401 `AUTH_INVALID` |

### B-3 — Replay window enforcement

| Step | Action                                                                                   | Expected           |
| ---- | ---------------------------------------------------------------------------------------- | ------------------ |
| 1    | `POST /earn` with `X-RRR-Timestamp` 6 minutes in the past (correctly signed for that ts) | 401 `AUTH_INVALID` |
| 2    | Same with timestamp 6 minutes in the future                                              | 401 `AUTH_INVALID` |

### B-4 — Nonce reuse rejected

| Step | Action                                                                 | Expected                        |
| ---- | ---------------------------------------------------------------------- | ------------------------------- |
| 1    | `POST /earn` with valid envelope, succeeds                             | 201                             |
| 2    | Resubmit with **same** `X-RRR-Nonce` and `X-RRR-Timestamp` (re-signed) | 401 `AUTH_INVALID` (nonce seen) |

### B-5 — Body hash binding

| Step | Action                                                                                        | Expected           |
| ---- | --------------------------------------------------------------------------------------------- | ------------------ |
| 1    | Sign a request for `amount: 42.00`, then send the request body with `amount: 4200.00` instead | 401 `AUTH_INVALID` |

### B-6 — Cross-tenant access blocked

| Step | Action                                                                                                                                 | Expected                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1    | Sign a request as `tenant_id: redroompleasures` but query for a Cyrano-tenant member's wallet (`GET /wallets/cyrano-member-X/balance`) | 403 `TENANT_SCOPE_VIOLATION` |
| 2    | Same shape against `POST /earn` for a Cyrano member                                                                                    | 403 `TENANT_SCOPE_VIOLATION` |

### B-7 — Operator scope enforcement

| Step | Action                                                                                         | Expected                     |
| ---- | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| 1    | As `test-operator-rrp-001` (RRP-scoped), call `GET /admin/wallets` filtered to `cyrano` tenant | 403 `TENANT_SCOPE_VIOLATION` |
| 2    | As `test-operator-oqmi-001` (cross-tenant), same query                                         | 200; results returned        |

### B-8 — Public-route allowlist correctness

| Step | Action                                                           | Expected                                              |
| ---- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| 1    | `GET /health` with no auth                                       | 200                                                   |
| 2    | `POST /earn` with no auth                                        | 401 `AUTH_REQUIRED`                                   |
| 3    | Every other route in `api/openapi.yaml` (sample 10) with no auth | 401 `AUTH_REQUIRED` (except documented public routes) |

Verifies the fail-closed middleware stack from #312–#314.

### B-9 — Signup rate-limit (RISK-002)

| Step | Action                                              | Expected                                                                          |
| ---- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1    | Hit the signup endpoint 10× in 60s from the same IP | After 5 successful, subsequent calls return 429 `RATE_LIMITED` with `Retry-After` |

### B-10 — General rate-limit

| Step | Action                                                                 | Expected                                          |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| 1    | Burst > 100 requests / min from one IP against any non-signup endpoint | 429 with `Retry-After`; recovery after the window |

### B-11 — Revoked key rejected

| Step | Action                                                                                      | Expected           |
| ---- | ------------------------------------------------------------------------------------------- | ------------------ |
| 1    | OQMI revokes a test key. The test client signs with it and calls a state-changing endpoint. | 401 `AUTH_INVALID` |

### B-12 — Tenant-scope CI guard match

| Step | Action                                                                          | Expected                                |
| ---- | ------------------------------------------------------------------------------- | --------------------------------------- |
| 1    | Run `node scripts/ci/tenant-id-scope-check.js` against the deployed branch HEAD | exit 0; "0 new violations vs allowlist" |

**Pass criteria for Bucket B:** every test passes. Any failure is a ship
blocker.

---

## 6. Bucket C — Operational

**Goal:** verify the things that aren't strictly invariants but break Alpha if
broken.

### C-1 — Health probe

| Step | Action                                                           | Expected                                      |
| ---- | ---------------------------------------------------------------- | --------------------------------------------- |
| 1    | `GET /health`                                                    | 200; body includes `db: ok`, `version: <SHA>` |
| 2    | Stop the Atlas cluster from accepting connections; hit `/health` | 503; body indicates DB unreachable            |
| 3    | Restore connectivity; hit `/health`                              | 200                                           |

### C-2 — OpenAPI gating in production

| Step | Action                                                | Expected     |
| ---- | ----------------------------------------------------- | ------------ |
| 1    | `GET /api/docs` against staging (NODE_ENV=production) | 404 (or 401) |
| 2    | `GET /api/openapi.yaml`                               | 404 (or 401) |

Verifies #319 gating.

### C-3 — Webhook outbound delivery + signature

| Step | Action                                                              | Expected                                 |
| ---- | ------------------------------------------------------------------- | ---------------------------------------- |
| 1    | Trigger a settlement that should emit a webhook                     | webhook delivered to test endpoint       |
| 2    | Test endpoint verifies signature using its copy of the `api_secret` | signature validates                      |
| 3    | Test endpoint returns 500 once                                      | RRR retries per backoff schedule (1m...) |
| 4    | Test endpoint returns 200 on retry                                  | RRR stops retrying; delivery marked done |

### C-4 — Webhook inbound HMAC verification

| Step | Action                                                            | Expected                                   |
| ---- | ----------------------------------------------------------------- | ------------------------------------------ |
| 1    | Send a properly-signed webhook to `POST /webhooks/external/award` | 200                                        |
| 2    | Same with tampered body                                           | 401                                        |
| 3    | Same with stale timestamp                                         | 401                                        |
| 4    | Resend the same payload with same `eventId`                       | 200; idempotent (no duplicate side-effect) |

### C-5 — Fraud signal emission

| Step | Action                                                                                        | Expected                                            |
| ---- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1    | Trigger a velocity pattern that should fire a fraud signal (e.g. 10 redeems in 10s same user) | `FraudSignalService` emits a `fraud.signal` webhook |
| 2    | Subscriber endpoint receives signed delivery                                                  | signature validates                                 |

### C-6 — Tier multipliers + gift redemption (#321)

| Step | Action                                                                         | Expected                                               |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 1    | Earn for a member while inferno multiplier is active in their `EarnRateConfig` | credited points reflect the multiplier                 |
| 2    | Same member earns when multiplier inactive                                     | credited points reflect base rate only                 |
| 3    | Model gift redemption flow end-to-end                                          | model allocation decrements, member balance increments |

### C-7 — Logging hygiene

Sample 50 lines from staging logs at random:

- [ ] No JWT bearer tokens (full or partial) appear.
- [ ] No HMAC signatures (full or partial) appear.
- [ ] No `api_secret` values appear.
- [ ] No full request bodies for state-changing operations.
- [ ] Every relevant entry includes `request_id`, `tenant_id`, `verdict`.

### C-8 — PointLot expiration

| Step | Action                                                           | Expected                                                                             |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1    | Seed a member with a PointLot expiring in 7 days                 | created                                                                              |
| 2    | `GET /admin/expiration/warnings`                                 | lot listed                                                                           |
| 3    | Force-expire the lot (or wait through a configured short window) | LedgerEntry with `reason_code: POINT_EXPIRY` appended; available balance decremented |

### C-9 — Reconciliation alarm path

| Step | Action                                                                                  | Expected                  |
| ---- | --------------------------------------------------------------------------------------- | ------------------------- |
| 1    | Manually corrupt a Wallet.balance (DB-level) so it diverges from sum(LedgerEntry.delta) | reconcile script flags it |
| 2    | Try a redeem on that wallet                                                             | 409 `RECON_MISMATCH`      |
| 3    | Restore the balance; re-run reconcile                                                   | clean                     |
| 4    | Redeem again                                                                            | works normally            |

### C-10 — Backup + restore drill (light)

| Step | Action                                                               | Expected          |
| ---- | -------------------------------------------------------------------- | ----------------- |
| 1    | Confirm Atlas continuous backup is running and PITR is set to 7 days | yes               |
| 2    | Trigger a point-in-time restore to a temp cluster                    | restore completes |
| 3    | Spot-check that ledger entries are intact                            | yes               |

**Pass criteria for Bucket C:** every test passes. C-9 and C-10 are the most
likely to surface ops gaps; budget time for them.

---

## 7. Triage rules (during the run)

When something fails, classify the failure before reacting:

| Class                     | Examples                                                               | Action                                                                        |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Invariant breach**      | Bucket A failure; balance ≠ ledger sum; tenant cross-access succeeds   | **Ship blocker.** Halt the run. Cut a P0 ticket. Fix and re-run from scratch. |
| **Spec deviation**        | Endpoint returns the wrong error code; webhook payload missing a field | Fix on a CHORE/API ticket; re-run only the affected test.                     |
| **Operational gap**       | Missing log field; reconcile script slow; backup not configured        | Fix before Alpha cutover; not invariant-grade.                                |
| **Polish / nice-to-have** | Error copy reads weird; rate-limit window feels tight                  | Triage to v2 backlog. Don't fix during Alpha test.                            |

The bias is heavy toward "halt and fix" for Bucket A and B failures, and "log
and continue" for everything else.

---

## 8. Capture format

Track results in a single Google Sheet (or markdown table — your call) with
columns:

| Test ID | Run timestamp | Result (PASS/FAIL/SKIP) | Notes / request_id | Triage class | Owner | Status |
| ------- | ------------- | ----------------------- | ------------------ | ------------ | ----- | ------ |

Every failure cites:

- The exact `request_id` returned by RRR.
- The exact request body (sanitized — no secrets).
- Whatever staging-side context (logs, DB snapshot id, etc.) the issue requires.

Findings get filed as GitHub issues in `OmniQuestMediaInc/RedRoomRewards` with
the `alpha-test` label.

---

## 9. Definition of "Alpha test passed"

All of the following must be true at the same SHA:

- [ ] Every Bucket A test passes (financial invariants).
- [ ] Every Bucket B test passes (security boundary).
- [ ] Bucket C tests pass with at most 2 operational-gap items remaining open
      and triaged.
- [ ] No invariant-breach issues open.
- [ ] CI green at the same SHA.
- [ ] Staging has been up continuously for ≥ 24 hours during the run (rules out
      cold-start anomalies).
- [ ] Both Phase-1 merchant integration packets
      (`docs/integrations/redroompleasures-wordpress.md`,
      `docs/integrations/cyrano.md`) have completed their respective smoke-test
      checklists.

When all checked, OQMI cuts `v0.1.0-alpha.1` at the tested SHA and Alpha test is
closed.

---

## 10. What happens after Alpha test

- Production environment provisioned (mirror of staging, separate cluster,
  `api.` and `auth.` hostnames, no `-staging` suffix).
- Branch protection on `main` enabled (per `DEPLOYMENT-CHECKLIST.md` go-live
  section).
- Closed-beta cutover with RedRoomPleasures and Cyrano against production.
- Observability tightening (alerting thresholds, log retention configs
  verified).
- Runbook authored for incident response (separate doc, post-Alpha).

---

_This pack is Alpha-bound. Updates require a CHORE: commit and a note in the
production schedule under ALP-5._
