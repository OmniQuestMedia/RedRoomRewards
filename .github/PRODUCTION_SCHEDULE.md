# RedRoomRewards — Production Schedule

# OmniQuestMedia/RedRoomRewards

# Updated: 2026-05-03 (Waves A–D closed; Alpha test prep landing)

# Owner: Kevin B. Hartley, CEO

#

# AGENT RULES (read first, always):

# - Everything on this list is PRE-APPROVED. Execute without asking.

# - No CEO gate. No PR review required. Auto-merge when CI passes.

# - Grok is the primary build agent. GitHub Copilot handles file ops, cleanup, audits only.

# - On task completion: update Status to DONE, add Merge SHA, move on.

# - Do not ask clarifying questions about tasks already described here.

# - If genuinely blocked on a missing file or broken dep: note it inline and move to next task.

# - Repo is private. Use the PAT already configured in repo secrets.

# - Alert Kevin when context is at 25% or less.

---

## WAVE A — Cleanup (unblocked, execute in parallel)

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                              | Status | Merge SHA |
| :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----- | :-------- |
| A-003   | Charter-integrity CI check — `scripts/ci/charter-integrity-check.js` parses `.github/PRODUCTION_SCHEDULE.md`, asserts every row whose Status is DONE has a non-placeholder Merge SHA; wired into `ci.yml`                                                                                                                                                                                         | DONE   | 90bcdab   |
| A-004   | Delete `api/src/modules/` dead NestJS tree — `git rm -r api/src/modules/`; grep `src/` for any cross-references and remove them                                                                                                                                                                                                                                                                   | DONE   | 778df64   |
| A-005   | Delete `.github/workflows/directive-intake.yml` and `.github/workflows/directive-dispatch.yml`; confirm no other workflow references them                                                                                                                                                                                                                                                         | DONE   | 90bcdab   |
| A-006   | Consolidate Copilot-governance docs — collapse `COPILOT_INSTRUCTIONS.md` (root) + `docs/governance/COPILOT_GOVERNANCE.md` into `.github/copilot-instructions.md`; rename `COPILOT_EXECUTION_RULES.md` → `docs/governance/AGENT_EXECUTION_RULES.md`; move `docs/copilot/COPILOT.md` → `docs/specs/CHIP_MENU_TOKEN_SYSTEMS_v1.0.md`; archive originals to `docs/history/`; fix all cross-references | DONE   | 778df64   |
| A-008   | Duplicate-file cleanup — archive `docs/work-orders/WORK_ORDER_82B.md` + `docs/WORK_ORDER_82B_82C_ADDENDUM.md` to `docs/history/`; consolidate `src/admin-ops/` stub into `src/services/admin-ops.service.ts`; move `validate-schema.js` to `scripts/`; archive `docs/RISKY_NAME_CHANGE_TAGS.md` to `docs/history/`; delete `console.error` in `src/api/receipt-endpoint.example.ts`               | DONE   | 778df64   |
| A-009   | Remove duplicate CodeQL workflow — diff `.github/workflows/codeql-analysis.yml` vs `.github/workflows/CodeQL Code Scanning.yml`; delete the redundant one (prefer deleting the space-in-filename one)                                                                                                                                                                                             | DONE   | 90bcdab   |
| A-010   | Add husky + lint-staged — pre-commit runs `eslint --fix` + `prettier --write` on staged `.ts`; add `prepare` script to `package.json`                                                                                                                                                                                                                                                             | DONE   | 778df64   |
| A-011   | Switch `ci.yml` “Test” step from `npm test` → `npm run test:ci` (includes `--coverage`); set Jest 80% coverage threshold in `jest.config.js`; if currently below 80% document the gap and set floor                                                                                                                                                                                               | DONE   | 778df64   |
| A-007   | CLEANUP.md audit — grep `src/` for residual legacy imports (Media, Social, Commerce, Discovery sections); tick verified-clean boxes; file follow-ups for anything remaining. **Depends on A-004.**                                                                                                                                                                                                | DONE   | 778df64   |
| A-CLEAN | Wave A cleanup — lint pass, doc consistency sweep, update `OQMI_SYSTEM_STATE_RRR.md`, refresh production schedule, declare Wave B open                                                                                                                                                                                                                                                            | DONE   | 6e4316a   |

---

## WAVE B — FIZ Wiring + Data Layer (open after A-CLEAN)

_Wave B closed by B-CLEAN (`9788b3b`). Individual rows below landed across PRs
\#289–#297; SHA shown is the wave-close commit by which all Wave B work was
confirmed merged. C and D waves built on top of these._

| ID      | Task                                                                                                                                                                                                                                                                    | Status | Merge SHA |
| :------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----- | :-------- |
| B-001   | **CRITICAL** Wire `WalletController.creditPoints` to `PointAccrualService` — remove fabricated-response stub; call real service; create LedgerEntry; mutate Wallet.balance; idempotency wrapper stays. FIZ commit format.                                               | DONE   | 9788b3b   |
| B-002   | **CRITICAL** Wire `WalletController.deductPoints` to `PointRedemptionService` — same pattern as B-001. FIZ commit format.                                                                                                                                               | DONE   | 9788b3b   |
| B-003   | Integration tests — credit→GET shows new balance + ledger entry; deduct→GET shows new balance + ledger entry; idempotency replay = single ledger entry; insufficient balance = rejection + no entry. FIZ commit format. **Depends on B-001, B-002.**                    | DONE   | 9788b3b   |
| B-004   | `Tenant` + `Merchant` models — Mongoose/TypeScript; `merchant_tier` enum; `phase` 1 or 2; indexes; unit tests                                                                                                                                                           | DONE   | 9788b3b   |
| B-005   | `LoyaltyAccount` + `IdentityLink` models — Mongoose/TypeScript; unique constraints; unit tests. **Depends on B-004.**                                                                                                                                                   | DONE   | 9788b3b   |
| B-006   | **CRITICAL** Wrap multi-model wallet mutations in `mongoose.startSession` transactions — credit, deduct, escrow hold, escrow release; preserve existing retry logic; update `.env.example` with replica-set note; add rollback test. FIZ commit format.                 | DONE   | 9788b3b   |
| B-007   | `MerchantPairConfig` model — effective-dating; unique partial index; 1:1 default; unit tests. **Depends on B-004.**                                                                                                                                                     | DONE   | 9788b3b   |
| B-008   | CI guard: no hardcoded balance values in `src/` — grep-based script; wired into `ci.yml`; self-tests with bad fixture. FIZ commit format.                                                                                                                               | DONE   | 9788b3b   |
| B-009   | CI guard: `tenant_id` scope on all Model queries in `src/services/`, `src/wallets/`, `src/ledger/` — allowlist file for justified exceptions; baseline violation list in report. **Depends on B-004.**                                                                  | DONE   | 9788b3b   |
| B-010   | Extend `IdempotencyService` to redemption, expiration, escrow hold/release; add `idempotency.service.spec.ts`. FIZ commit format.                                                                                                                                       | DONE   | 9788b3b   |
| B-011   | Reconciliation job — `ReconciliationService`; `Wallet.balance == sum(PointLot.remaining) == sum(LedgerEntry.delta)`; emit `RECON_MISMATCH` never auto-correct; `npm run reconcile`; admin endpoint behind feature flag. FIZ commit format. **Depends on B-006, B-010.** | DONE   | 9788b3b   |
| B-012   | LedgerService invariant tests — append-only reflection check; monotonic sequence; balance projection; non-null correlation_id + reason_code. FIZ commit format.                                                                                                         | DONE   | 9788b3b   |
| B-013   | `admin-ops.service.spec.ts` — full coverage of `src/services/admin-ops.service.ts`. **Depends on A-008.**                                                                                                                                                               | DONE   | 9788b3b   |
| B-014   | `src/ingest-worker/replay.ts` — replace `any` with `FilterQuery<>`                                                                                                                                                                                                      | DONE   | 9788b3b   |
| B-015   | Split `src/wallets/types.ts` + `src/services/types.ts` by concern; update all imports; no shape changes                                                                                                                                                                 | DONE   | 9788b3b   |
| B-016   | Replace `any` with `unknown` + narrowing in `ledger.service.ts` + `services/types.ts`. **Depends on B-015.**                                                                                                                                                            | DONE   | 9788b3b   |
| B-CLEAN | Wave B cleanup — lint, test triage (8 pre-existing failures), update state file, declare Wave C open                                                                                                                                                                    | DONE   | 9788b3b   |

---

## WAVE C — Config Wiring + Auth + Infrastructure

| ID      | Task                                                                                                                                                                                                             | Status | Merge SHA |
| :------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----- | :-------- |
| C-001   | `PointAccrualService.calculateEarnRate` — query active `EarnRateConfig` (tenant/merchant/tier/event); apply `base_points_per_unit * inferno_multiplier * amount`; enforce CEO D3 zero-earn for Diamond Concierge | DONE   | a1d6d25   |
| C-002   | `PointRedemptionService.validateTierCap` — query active `TierCapConfig` (tenant/merchant/tier); validate `redemptionAmount ≤ (redemption_cap_pct / 100) * transactionValue`; no platform defaults (CEO B5)       | DONE   | a1d6d25   |
| C-003   | Integrate earn-rate calculation into `awardPoints` flow; integrate tier-cap validation into `redeemPoints` flow; add `tenantId`/`merchantId` to request shapes                                                   | DONE   | a1d6d25   |
| C-004   | JWT `AuthMiddleware` — extract Bearer token via `jsonwebtoken`; populate `req.tenantId` + `req.userId`; register in `AppModule.configure()`; wire with `TenantScopeMiddleware`                                   | DONE   | a1d6d25   |
| C-005   | Webhook receive (GGS-ready) + emit infrastructure                                                                                                                                                                | DONE   | a1d6d25   |
| C-006   | Cross-merchant exchange service wiring (already delivered in B-014 early drop; wire controller + module)                                                                                                         | DONE   | a1d6d25   |
| C-007   | Tier evaluation service                                                                                                                                                                                          | DONE   | a1d6d25   |
| C-008   | Settlement service                                                                                                                                                                                               | DONE   | a1d6d25   |
| C-009   | Fraud signal service — `FraudSignalService` with velocity / immediate-redemption / idempotency-reuse detection stubs; webhook emission via `WebhookEmitService`                                                  | DONE   | a1d6d25   |
| C-CLEAN | Wave C cleanup — `FraudSignalService` (C-012), `WebhookEmitService` stub, lint pass, ASSUMPTIONS + FLAGS + schedule update, Wave C declared closed                                                               | DONE   | a1d6d25   |

---

## WAVE D — Observability + Final Production Hardening

| ID      | Task                                                                                                                                                                   | Status | Merge SHA |
| :------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----- | :-------- |
| D-001   | Structured logging — replace ad-hoc `console.*` with `pino` logger; `src/lib/logger.ts`; wired into app bootstrap                                                      | DONE   | 954bc1c   |
| D-002   | Rate-limit middleware — `express-rate-limit` ^8; per-tenant configurable; wired into `AppModule`                                                                       | DONE   | 954bc1c   |
| D-003   | Tenant-scope CI guard — `scripts/ci/tenant-id-scope-check.js`; allowlist at `scripts/ci/tenant-id-allowlist.json`; wired into `ci.yml`                                 | DONE   | 954bc1c   |
| D-005   | Health check enhancement — `/health` returns DB connectivity + version; liveness + readiness probes                                                                    | DONE   | 954bc1c   |
| D-006   | FraudSignalService + WebhookEmitService — final Wave C deliverables landed; Wave C closed                                                                              | DONE   | 6018f1d   |
| D-FINAL | Payload #26 — FINAL PRODUCTION DEPLOYMENT: fix garbled `webhook-emit.service.ts`; exclude example file from tsc; `npm run build` clean; 449 tests / 46 suites all pass | DONE   | 55384c9   |

---

## INVARIANTS (non-negotiable, always enforced)

- LedgerService is append-only — no update/delete primitives ever
- Every LedgerEntry: non-null `correlation_id` + `reason_code`
- `Wallet.balance == sum(PointLot.remaining) == sum(LedgerEntry.delta)` at all
  times
- No hardcoded balance values in `src/` outside test files
- Every Model query in services/wallets/ledger includes `tenant_id` filter
- Multi-model wallet mutations: `mongoose.startSession` transactions only
- `ChatNow.Zone` is the canonical merchant name — `XXXChatNow.com` never appears
- Slot machine mechanics: permanently retired
- FIZ tasks: 4-line commit format, no auto-merge (human-visible, not
  human-blocked)

---

## CEO DECISIONS (locked, do not relitigate)

| ID  | Decision                                                                              |
| :-- | :------------------------------------------------------------------------------------ |
| D1  | Slot machine retired                                                                  |
| D2  | ChatNow.Zone canonical merchant name                                                  |
| D3  | Diamond Concierge zero earn                                                           |
| D4  | Room-Heat Inferno Bonus — `inferno_multiplier` required on EarnRateConfig, no default |
| D5  | GGS deferred — webhook-receive endpoints only                                         |
| B1  | `inferno_multiplier` required, no default                                             |
| B2  | Dual-tier: `merchant_tier` (launch) + `rrr_member_tier` (future, nullable)            |
| B3  | Phase 1 merchants: RedRoomPleasures + Cyrano. Phase 2: ChatNow.Zone                   |
| B4  | Cross-merchant rate 1:1 default via MerchantPairConfig                                |
| B5  | Tier caps: PLATINUM 50 / GOLD 35 / SILVER 20 / MEMBER 10 / GUEST 5                    |

---

## POST-WAVE-D — Wiring Audit + Alpha-prep Hardening

_Landed after D-FINAL during pre-Alpha tightening. Each row links to its merge
PR._

| ID  | Task                                                                 | Status | Merge SHA / PR |
| :-- | :------------------------------------------------------------------- | :----- | :------------- |
| W-1 | Wiring audit — 8 unprotected routes identified                       | DONE   | #311           |
| W-2 | Fail-closed middleware globals + startup env validation              | DONE   | #312           |
| W-3 | Explicit public-route allowlist                                      | DONE   | #313           |
| W-4 | Route-policy + AppModule.configure() + 13 integration tests          | DONE   | #314           |
| W-5 | LEGACY_CONFIGS/ removed (OQMI authorized)                            | DONE   | #315           |
| W-6 | RISK-002 — stricter rate limit on signup endpoint                    | DONE   | #316           |
| W-7 | Gate OpenAPI docs behind `NODE_ENV` in production                    | DONE   | #319           |
| W-8 | Follow-ups: archive README citation fix; remove CodeQL workflow      | DONE   | #320           |
| W-9 | Tier earning multipliers + gift redemption (in-scope for Alpha test) | DONE   | #321           |

---

## ALPHA TEST PREP — landing

_Goal: cut `v0.1.0-alpha.1` and run a focused test pack against staging with the
Phase-1 merchants (RedRoomPleasures, Cyrano) integrating as third-party tenants
over signed API + webhooks._

| ID    | Task                                                                                                                                 | Status | Merge SHA / PR                                                                                                                    |
| :---- | :----------------------------------------------------------------------------------------------------------------------------------- | :----- | :-------------------------------------------------------------------------------------------------------------------------------- |
| ALP-1 | Housekeeping commit — production schedule cleanup + checklist refresh + README status                                                | DONE   | 2a6deb2                                                                                                                           |
| ALP-2 | `docs/AUTH_CONTRACT.md` — HMAC service-to-service spec for merchant integrations (per-tenant key, replay window, signing canonical)  | DONE   | bb6c30e (#322) → 4090300 (live divergence audit)                                                                                  |
| ALP-3 | `docs/UX_INTEGRATION_BRIEF.md` — auth/rate-limit/idempotency/error-code one-pagers for front-end                                     | DONE   | bb6c30e (#322) → 4090300 (DOMAIN_GLOSSARY AUTH section + cross-refs)                                                              |
| ALP-4 | Staging deploy spec — hosting target + Atlas replica set + secrets posture (DigitalOcean TOR1, MongoDB Atlas TOR replica set)        | DONE   | bb6c30e (#322); production deploy spec landed in 3a5fc7c (#332); health-probe split + `.env.example` replica-set note in 5331cde. |
| ALP-5 | Alpha test pack — financial invariants + tenant/auth boundary + operational                                                          | DONE   | 0c2f919 (#330); reconciliation + HMAC canonical roundtrip + coverage ratchet in 9173883.                                          |
| ALP-6 | First wireframe specs in `docs/ux/` — member onboarding, balance view, ledger/history, redeem, tier badge, ops consoles              | DONE   | 6a272eb (#323) → ffe8c5a (#328) → 6fc3fc1 (#329) → 8eb9490 (#331); 9 specs (00–08) now landed                                     |
| ALP-7 | Phase-1 merchant integration packets — WordPress (RedRoomPleasures) + Cyrano server-to-server                                        | DONE   | 0c2f919 (#330); WP plugin scaffold landed in 40987a8 (#333); outbound webhook delivery samples in 9449596.                        |
| CI    | CI workflow polish — wire build, type-check, lint, format:check, test:ci into ci.yml; coverage artifact upload                       | DONE   | 3f033b9                                                                                                                           |
| HARD  | Final hardening sweep — pino migration for the last ad-hoc `console.*` callers; CLEANUP.md follow-up tracked for the metrics loggers | DONE   | 4ff718e                                                                                                                           |
| ALP-8 | Cut `v0.1.0-alpha.1` tag once ALP-1..ALP-7 + CI + HARD land                                                                          | OPEN   |                                                                                                                                   |
