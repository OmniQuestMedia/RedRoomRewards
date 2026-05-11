# OQMI SYSTEM STATE — RedRoomRewards

**Document:** `PROGRAM_CONTROL/DIRECTIVES/QUEUE/OQMI_SYSTEM_STATE_RRR.md`
**Repo:** OmniQuestMediaInc/RedRoomRewards **Version:** v3.0 (B-CLEAN — Wave B
closed, Wave C open) **Last Updated:** 2026-04-25 **Owner:** Kevin B. Hartley,
CEO — OmniQuest Media Inc. **Active Charter:** `.github/PRODUCTION_SCHEDULE.md`
(waveform schedule, parsed by CI) **Governance Companion:**
`PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md` **Agent Instructions:**
`.github/copilot-instructions.md`

> Living tracker. Rewritten on every PR that materially changes state. Disjoint
> from `OQMI_SYSTEM_STATE.md` (ChatNowZone–BUILD scope) — do not read across.

---

## §0 — PURPOSE

Three questions, one document:

1. **DONE** — what has shipped to `main`
2. **WIP** — what is actively in progress
3. **OUTSTANDING** — what remains, in priority order, with blockers

Doctrine lives in `.github/copilot-instructions.md`. Acceptance criteria live in
`.github/PRODUCTION_SCHEDULE.md`. This file mirrors both.

---

## §1 — REPO ORIENTATION

| Field                    | Value                                                                                                          |
| :----------------------- | :------------------------------------------------------------------------------------------------------------- |
| Repo name                | RedRoomRewards                                                                                                 |
| Repo URL                 | https://github.com/OmniQuestMediaInc/RedRoomRewards                                                            |
| Default branch           | `main`                                                                                                         |
| Primary language         | TypeScript (NestJS)                                                                                            |
| Package manager          | npm (do not introduce Yarn or pnpm)                                                                            |
| Database                 | MongoDB (mongoose; replica-set required for transactional wallet writes — see §5 CRITICAL #3 / Task B-006)     |
| Active schedule          | `.github/PRODUCTION_SCHEDULE.md`                                                                               |
| Charter integrity script | `scripts/ci/charter-integrity-check.js` (wired into `.github/workflows/ci.yml`)                                |
| Agent doctrine           | `.github/copilot-instructions.md`                                                                              |
| CEO Decisions of record  | `docs/RRR_CEO_DECISIONS_FINAL_2026-04-17.md` + the **CEO DECISIONS** table in `.github/PRODUCTION_SCHEDULE.md` |
| Canonical merchant name  | `ChatNow.Zone` (D2). `XXXChatNow.com` is retired and must not appear in new code.                              |

---

## §2 — SERVICE INVENTORY (confirmed on `main`, 2026-04-24)

### Present and in use

| Service                  | Path                                       | Notes                                                                                                                                 |
| :----------------------- | :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `LedgerService`          | `src/ledger/ledger.service.ts`             | Append-only by design. Invariant test pending (B-012).                                                                                |
| `WalletService`          | `src/wallets/wallet.service.ts`            | Optimistic-lock posture. **Atomicity gap** — multi-model mutations not yet wrapped in `mongoose.startSession` (CRITICAL #3 / B-006).  |
| `EscrowService`          | `src/wallets/escrow.service.ts`            | Paired with wallet flows.                                                                                                             |
| `PointAccrualService`    | `src/services/point-accrual.service.ts`    | Present; **not yet wired** from `WalletController.creditPoints` (CRITICAL #2 / B-001).                                                |
| `PointRedemptionService` | `src/services/point-redemption.service.ts` | Present; **not yet wired** from `WalletController.deductPoints` (CRITICAL #2 / B-002).                                                |
| `PointExpirationService` | `src/services/point-expiration.service.ts` | Present; idempotency wrapper coverage pending (B-010).                                                                                |
| `IdempotencyService`     | `src/services/idempotency.service.ts`      | Wrapper landed on credit/deduct. Extension to redemption/expiration/escrow pending (B-010).                                           |
| `WalletController`       | `src/api/wallet.controller.ts`             | **FLAGGED:** `creditPoints` / `deductPoints` return fabricated responses without invoking the real services or writing to the ledger. |
| `RedRoomLedgerService`   | `src/ledger/red-room-ledger.service.ts`    | Wave A FIZ wiring landed (#284).                                                                                                      |
| `AdminOpsService`        | `src/services/admin-ops.service.ts`        | Consolidated stub (A-008). Full coverage spec added (B-013 — 26 tests).                                                               |
| `ZkOracleService`        | `src/zk-oracle/zk-oracle.service.ts`       | Research spike (WO-011). 16 tests cover proof generation, tamper detection, audit log.                                                |

### Data models confirmed on `main`

`Wallet`, `ModelWallet`, `EscrowItem`, `LedgerEntry`, `Idempotency`, `PointLot`,
plus `ValuationConfig`, `EarnRateConfig`, `TierCapConfig`, `MicroTopupConfig`,
`SpendOrderConfig`.

### Missing / not yet built

- `Tenant`, `Merchant` (Task B-004)
- `LoyaltyAccount`, `IdentityLink` (Task B-005)
- `MerchantPairConfig` (Task B-007)
- `ReconciliationService` (Task B-011)
- `SettlementService`, `TierEvaluationService`, `FraudSignalService` (Wave C)
- Auth / authz / tenant-isolation middleware (Wave C)
- Webhook receive (GGS-ready, D5) + emit infrastructure (Wave C)

---

## §3 — DONE

Merged on `main` and verified by `git log` + the schedule's Merge SHA column.

### Wave A — Cleanup (closed by A-CLEAN)

| Task    | Merge SHA                                                                                | Title                                                                                |
| :------ | :--------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| A-003   | 90bcdab                                                                                  | Charter-integrity CI check (now reads `.github/PRODUCTION_SCHEDULE.md`)              |
| A-004   | 778df64                                                                                  | Delete `api/src/modules/` dead NestJS tree                                           |
| A-005   | 90bcdab                                                                                  | Delete retired directive-intake / directive-dispatch workflows                       |
| A-006   | 778df64                                                                                  | Consolidate Copilot-governance docs into `.github/copilot-instructions.md`           |
| A-007   | 778df64                                                                                  | CLEANUP.md audit — verified-clean ticks for legacy import sweep                      |
| A-008   | 778df64                                                                                  | Duplicate-file cleanup; consolidate `admin-ops` stub; relocate `validate-schema.js`  |
| A-009   | 90bcdab                                                                                  | Remove duplicate CodeQL workflow                                                     |
| A-010   | 778df64                                                                                  | Husky + lint-staged pre-commit (`eslint --fix` + `prettier --write` on staged `.ts`) |
| A-011   | `ci.yml` Test step uses `npm run test:ci`; Jest 80 % coverage threshold floor documented | 778df64                                                                              |
| A-CLEAN | (rolling backfill — set on this PR's merge SHA)                                          | —                                                                                    |

### Pre-Wave-A (most recent, abridged — see git log for full list)

- WO-006/007/008/011/012/013/014 service polish + ZK Oracle research spike
  (#287, c535e8e)
- ESLint config typo fix (`no-wrapper-objects-types` →
  `no-wrapper-object-types`) (1f55bdc)
- Super-Linter JSON tsconfig comment fix (#286, 633eeb3)
- CI / auto-merge / jest / tsconfig / eslint relax (#285, d21d3d2)
- FIZ: `creditPoints`/`deductPoints` added to `LedgerService`;
  `RedRoomLedgerService` wired (#284, 7b5724b)
- Health endpoint exposed outside `api/v1` global prefix (#283, 3e6e793)
- RRR-FINAL-DEPLOYMENT (Payloads 1–10, #281, 41dc95a)

---

## §4 — WIP

| ID      | Task                                        | Branch                               | Notes                                           |
| :------ | :------------------------------------------ | :----------------------------------- | :---------------------------------------------- |
| A-CLEAN | Wave A cleanup — close-out PR (this branch) | `claude/wave-a-cleanup-wave-b-hTqo4` | Lint clean (0 errors). Tests 319/319. CI green. |

---

## §5 — OUTSTANDING (Wave C — opens after B-CLEAN merges)

All Wave B tasks are now DONE. Wave C is open.

### CRITICAL #1 — wire controllers to real services (B-001 / B-002 / B-003)

- **B-001** — `WalletController.creditPoints` → `PointAccrualService`
- **B-002** — `WalletController.deductPoints` → `PointRedemptionService`
- **B-003** — Integration tests covering credit/deduct + idempotency replay +
  insufficient-balance rejection. **Depends on B-001+B-002.**

### CRITICAL #2 — transactional multi-model wallet mutations

- **B-006** — Wrap credit / deduct / escrow hold / escrow release in
  `mongoose.startSession`. `.env.example` replica-set note. Rollback test.

### CRITICAL #3 — idempotency coverage extension

- **B-010** — Extend `IdempotencyService` to redemption, expiration, escrow
  hold/release. Add `idempotency.service.spec.ts`.

### Tenancy / merchant data layer

- **B-004** — `Tenant` + `Merchant` models (`merchant_tier` enum; `phase` 1 or
  2; indexes; unit tests).
- **B-005** — `LoyaltyAccount` + `IdentityLink` models. **Depends on B-004.**

### Reconciliation + invariant projection

- **B-011** — `ReconciliationService` + `npm run reconcile` + feature-flagged
  admin endpoint. **Depends on B-006 + B-010.**

### Wave C provisional tasks

- Service ↔ Config wiring (PointAccrual ↔ EarnRateConfig; PointRedemption ↔
  TierCapConfig + SpendOrderConfig)
- Auth / authz / tenant-isolation middleware
- Webhook receive (GGS-ready) + emit infrastructure
- Cross-merchant exchange service (uses MerchantPairConfig)
- Tier evaluation service
- Settlement service
- Fraud signal service

---

## §6 — BLOCKERS

None at B-CLEAN time.

Pre-existing type-check error in `src/api/receipt-endpoint.example.ts:144`
(discriminated-union narrowing under TS 6.x) is non-blocking — it is an
illustrative example file, excluded from the runtime build target, and CI does
not run `tsc --noEmit`. Tracked for fix-up in a Wave C follow-up.

---

## §7 — RETIRED / ARCHIVED

- **D1** — Slot machine + chance-based game logic — RETIRED.
- **D2** — `XXXChatNow.com` brand — RETIRED. `ChatNow.Zone` is canonical.
- `RRR-WORK-001.md` — placeholder retired. The waveform schedule at
  `.github/PRODUCTION_SCHEDULE.md` is the authoritative active charter.
- `RRR-GOV-002` archive copy at `archive/governance/RRR-GOV-002_2026-04-21.md`
  is historical only; the live restored version sits at
  `PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md`.
- Root `COPILOT_INSTRUCTIONS.md` and `docs/governance/COPILOT_GOVERNANCE.md`
  consolidated into `.github/copilot-instructions.md` (A-006).
- `directive-intake.yml` / `directive-dispatch.yml` workflows — RETIRED per CEO
  Decision W1 (A-005).

---

## §8 — INVARIANTS (mirror of schedule INVARIANTS)

- LedgerService is append-only — no `update` / `delete` primitives ever.
- Every `LedgerEntry`: non-null `correlation_id` + `reason_code`.
- `Wallet.balance == sum(PointLot.remaining) == sum(LedgerEntry.delta)` at all
  times.
- No hardcoded balance values in `src/` outside test files.
- Every model query in services / wallets / ledger includes a `tenant_id`
  filter.
- Multi-model wallet mutations: `mongoose.startSession` transactions only.
- `ChatNow.Zone` is the canonical merchant name — `XXXChatNow.com` never
  appears.
- Slot machine mechanics: permanently retired.
- FIZ tasks: 4-line commit format, no auto-merge (human-visible, not
  human-blocked).

---

## 2026-05-09 — Agent Payload Flow Update (concise)

- Added `.github/AGENTS.md` continuous-flow operating guidance for `copilot/*`,
  `grok/*`, `agent/*`.
- Added `.github/workflows/copilot-internal.yml` fast-path gate for agent
  branches.
- Updated `.github/workflows/auto-merge.yml` to scope auto-enable behavior to
  valid agent branches while preserving `fiz` / `ceo-gate` protections.
- Added `npm run ship-gate` in `package.json` as the governance check aggregator
  used by fast-path.
- Cross-repo impact: apply equivalent safe fast-path workflow + auto-merge
  scoping + ship-gate script in other OQMI repositories without weakening branch
  protections or mandatory security/compliance checks.

## 2026-05-11 — Phase 0.5 lint parity updates

| Date       | Change                                                                                                        | PR  | Owner   | Outcome                                                     |
| :--------- | :------------------------------------------------------------------------------------------------------------ | :-- | :------ | :---------------------------------------------------------- |
| 2026-05-11 | Phase 0.5 lint parity — MaxZoneGPT-specific `PROGRAM_CONTROL/ship-gate-verifier.ts` + mixed Python/JS scripts | #31 | copilot | lint-clean invariant enforced; Python primary + JS advisory |

## HANDOFF

- Built: agent fast-path instruction/workflow plumbing with preserved governance
  labels and existing CI gates.
- Incomplete: branch protection/ruleset policy updates for
  branch-pattern-specific required checks are not configurable via repository
  files in this PR and require admin settings change.
- Next agent first task: implement org/repo-level branch protection/ruleset
  updates in GitHub settings to require `copilot-internal / fast-gate` for agent
  branches while retaining all current mandatory governance/security checks.

_END OQMI SYSTEM STATE — RedRoomRewards_
