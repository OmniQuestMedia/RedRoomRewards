# CLEANUP-DROID-REPORT — Pre-ship Hygiene (Phases 0–4)

**Date:** 2026-04-26  
**Branch (task):** `copilot/verify-draft-pr-and-scan-links`  
**Phase 1 PR:** #308 (`copilot/claudecleanup-legacy-code-3ecy8`)  
**Phases 2–4 PR:** TBD (this branch → `main`)

---

## Summary

| Phase | Description | Outcome |
|-------|-------------|---------|
| 0 | Inventory + proposal | Delivered to `PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-PLAN.md` on Phase 1 branch |
| 1 | Doc consolidation + tsconfig fix + stub README deletes | 7 actions executed (PR #308) |
| 2 | Broken link fix + source comment updates + ts-prune audit | 6 changes; 0 dead exports deleted |
| 3 | `archive/README.md` citation verification | No-op — no Phase 1 moves affected any archive citation |
| 4 | Full hardening checklist | All CI checks PASS; 452 tests; 0 build errors; lint 0 errors 24 warnings (pre-existing) |

---

## Phase 1 — Moves and Deletes (PR #308)

### Files Moved

| Old path | New path | Reason |
|----------|----------|--------|
| `ASSUMPTIONS.md` | `docs/ASSUMPTIONS.md` | Root clutter; doc belongs under `docs/` |
| `OQMI_PROTOTYPE_STANDARDS.md` | `docs/governance/OQMI_PROTOTYPE_STANDARDS.md` | Root clutter; governance doc belongs under `docs/governance/` |
| `README-AWARDINGWALLET-AV.md` | `docs/AWARDING_WALLET_AV.md` | Root clutter; naming normalized (dropped `README-` prefix) |
| `Copilot Instructions.md` | `docs/governance/COPILOT_INSTRUCTIONS.md` | Root clutter; filename normalized (dropped space) |

### Files Deleted (stubs)

| Path | Reason |
|------|--------|
| `src/README.md` | Stub claiming "All subdirectories are currently scaffolded only" — false; full implementation exists |
| `src/webhooks/README.md` | Stub claiming "Status: Scaffolded only - no implementation yet" — false; 4 implementation files exist |

### Files Rewritten

| Path | Reason |
|------|--------|
| `README.md` | Stale: claimed "FULLY COMPLETE (Payloads 1–10)"; rewritten with accurate Wave D status |

### Build Defect Fixed

| File | Fix |
|------|-----|
| `tsconfig.json` | Removed duplicate `"exclude"` key (introduced in `ac9e2dd`). JSON does not allow duplicate keys; TS treated line 51 as a syntax error (`TS1005: ',' expected`), blocking all builds and tests. The second (more specific) entry was retained; the first removed. |

> **Note:** This same fix is also included on the Phases 2–4 task branch for PR self-containment. If #308 merges first, the rebase will produce an empty commit that can be squashed.

---

## Phase 2 — Broken Link Fix + Source Comment Updates

### Broken Link (Item 10)

| File | Old link | New link | Notes |
|------|----------|----------|-------|
| `docs/security/SECURITY_BEST_PRACTICES.md` line 500 | `../SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` | `./SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` | File exists at `docs/security/`; old path resolved to `docs/` (wrong dir) |

### Source Comment Updates (inbound-link scan finding)

| File | Old reference | New reference |
|------|--------------|---------------|
| `src/services/member.service.ts` line 15 | `ASSUMPTIONS.md F-008` | `docs/ASSUMPTIONS.md F-008` |
| `src/services/reporting.service.ts` line 9 | `ASSUMPTIONS.md F-012` | `docs/ASSUMPTIONS.md F-012` |
| `src/services/reporting.service.ts` line 15 | `ASSUMPTIONS.md F-012` | `docs/ASSUMPTIONS.md F-012` |
| `src/services/welfare-guardian-score.service.ts` line 17 | `ASSUMPTIONS.md F-009` | `docs/ASSUMPTIONS.md F-009` |
| `src/services/white-label.service.ts` line 8 | `ASSUMPTIONS.md F-013` | `docs/ASSUMPTIONS.md F-013` |

### ts-prune Dead Export Audit (Item 11)

**Exports deleted:** 0

**All findings skipped — disposition table:**

| File | Symbol(s) | Skip reason |
|------|-----------|-------------|
| `src/activity-feed/index.ts` | `ActivityFeedService` | Barrel re-export (`src/**/index.ts`) — public API surface |
| `src/api/index.ts` | 20+ entries | `src/api/**` — framework-wired by convention; skip per rule |
| `src/api/support-auth.guard.ts` | `checkAdminSupportAuth`, `AuthCheckResult`, `AuthGuardConfig`, `withAdminSupportAuth` | `src/api/**` — skip per rule; 3 also flagged "(used in module)" by ts-prune |
| `src/config/index.ts` | all entries | Barrel re-export — skip per rule |
| `src/db/index.ts` | ~60+ entries | Barrel re-export + db models aggregation — skip per both rules |
| `src/db/models/point-lot.model.ts` | `IPointLot`, `PointLotSchema`, `PointLotModel` | `src/db/models/**` — skip per rule |
| `src/db/models/settlement-record.model.ts` | `SettlementStatus`, `SETTLEMENT_STATUSES`, `SettlementRecordSchema` | `src/db/models/**` — skip per rule |
| `src/events/index.ts` | all entries | Barrel re-export — skip per rule |
| `src/ingest-worker/index.ts` | all entries | Barrel re-export — skip per rule |
| `src/ledger/index.ts` | all entries | Barrel re-export — skip per rule |
| `src/metrics/index.ts` | all entries | Barrel re-export — skip per rule |
| `src/reservations/index.ts` | all entries | Barrel re-export — skip per rule |
| `src/services/index.ts` | all entries | Barrel re-export — skip per rule |
| `src/wallets/index.ts` | all entries | Barrel re-export — skip per rule |
| `src/webhooks/webhook-emit.service.ts` | `WebhookPayload` | Flagged "(used in module)" by ts-prune — in-file use only |
| `src/middleware/auth.middleware.ts` | `AuthMiddleware` | Not wired into `AppModule.configure()` yet; comment evidence in `rate-limit.middleware.ts` says "wire after AuthMiddleware" — planned wiring, "can't tell" → **risk register** |
| `src/middleware/rate-limit.middleware.ts` | `RateLimitMiddleware` | Same — not registered anywhere; "can't tell" → **risk register** |
| `src/middleware/tenant-scope.middleware.ts` | `TenantScopeMiddleware` | Same — comment in `auth.middleware.ts` references it as a future consumer — **risk register** |
| `src/controllers/awarding-wallet.controller.ts` | `AwardingWalletController` | NestJS controller not in any module's `controllers[]`; may be planned — "can't tell" → **risk register** |
| `src/controllers/creator-gifting.controller.ts` | `CreatorGiftingController` | Same — **risk register** |
| `src/services/settlement.service.ts` | `SettlementService` | Referenced only by `src/services/__tests__/settlement.service.spec.ts` — skip per only-by-tests rule (Wave C WIP) |
| `src/zk-oracle/zk-oracle.service.ts` | `ZkOracleService` | Referenced only by `src/zk-oracle/__tests__/zk-oracle.service.spec.ts` — skip per only-by-tests rule (WO-011 PoC) |
| `src/test/helpers/setTestEnv.ts` | `setTestEnv` | Referenced only by `src/metrics/logger.spec.ts` — skip per only-by-tests rule |

---

## Phase 3 — archive/README.md Citation Verification

**Invariant:** `archive/**` is read-only. No edits permitted. If any Phase 1 move broke a citation, stop and ask.

**Findings:**

`archive/README.md` cites:
- `PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md` (active charter) — path unchanged, citation valid ✅
- `governance/CLAUDE_2026-04-21.md` — **pre-existing discrepancy** (actual file is `archive/governance/RRR-GOV-002_2026-04-21.md`, not `CLAUDE_2026-04-21.md`). This discrepancy predates Phase 1; it is NOT caused by any Phase 1 move. Per read-only invariant: **not fixed**. Logged here for awareness.

**Phase 1 moved files vs archive citations:**

| Moved file | Referenced in archive/README.md? |
|------------|----------------------------------|
| `ASSUMPTIONS.md` | No |
| `OQMI_PROTOTYPE_STANDARDS.md` | No |
| `README-AWARDINGWALLET-AV.md` | No |
| `Copilot Instructions.md` | No |

**Verdict:** Phase 3 is a **no-op**. No Phase 1 move affected any archive citation. The pre-existing `CLAUDE_2026-04-21.md` discrepancy is noted but out-of-scope.

---

## Phase 4 — Hardening Checklist

All checks run against branch `copilot/verify-draft-pr-and-scan-links` at HEAD `15edaa7` (post-Phase-2-commit) plus the tsconfig fix applied in the Phase 3+4 commit.

| Check | Command | Result |
|-------|---------|--------|
| **Build** | `npm run build` | ✅ PASS — 0 errors, 0 warnings |
| **Tests** | `npx jest --no-coverage` | ✅ PASS — **452 tests / 47 suites** |
| **Lint** | `npm run lint` | ✅ PASS — 0 errors, **24 warnings** (pre-existing `@typescript-eslint/no-explicit-any` in spec files) |
| **Charter integrity** | `node scripts/ci/charter-integrity-check.js` | ✅ PASS |
| **No hardcoded balances (B-008)** | `node scripts/ci/no-hardcoded-balance.js` | ✅ PASS — 0 violations |
| **tenant_id scope (B-009)** | `node scripts/ci/tenant-id-scope-check.js` | ✅ PASS — 40 known findings, 0 new violations |
| **Schema validation** | `node scripts/validate-schema.js` | ✅ PASS — 4 examples valid |
| **Required files** | `docs/contracts/xxx-events.schema.json`, `api/openapi.yaml` | ✅ PASS — both present |
| **CodeQL** | GitHub Actions (codeql-analysis.yml) | ⚠️ NOT RUN locally — runs via GitHub Actions CI. Issue already opened per problem statement; do not duplicate. |
| **Super-Linter** | GitHub Actions (lint.yml) | ⚠️ NOT RUN locally — runs via GitHub Actions CI on PR. No local failures in markdown/yaml/json. |

### depcheck (informational, not in CI)

| Finding | Disposition |
|---------|-------------|
| `@types/jest` marked unused | FALSE POSITIVE — provided via tsconfig `types` array, not direct import |
| `express` marked missing | FALSE POSITIVE — NestJS DI, not directly imported |

### .env.example orphan keys (informational, not in CI)

10 keys appear unreferenced in `src/`: `DATABASE_URL`, `TOKEN_EXPIRY_SECONDS`, `API_BASE_PATH`, `LOG_FORMAT`, `DEBUG_MODE`, `VERBOSE_LOGGING`, `RATE_LIMIT_PER_MINUTE`, `GATEGUARD_AV_API_KEY`, `GATEGUARD_AV_ENDPOINT`, `SERVICE_BUREAU_ENABLED`.

Confirmed not referenced in `scripts/`, `infra/`, `.github/workflows/` either.  
**No action taken** — `.env.example` changes are cosmetic and risk confusion with infra/deployment tooling that reads the file at a higher level. Logged for a separate cleanup ticket.

---

## Refusals

| Item | Refused action | Reason |
|------|---------------|--------|
| `archive/governance-v1/` files | Deletion of byte-equivalent duplicates (also in `docs/history/`) | Phase 3 read-only invariant — requires charter amendment per `archive/README.md` |
| `archive/README.md` | Correcting `CLAUDE_2026-04-21.md` → `RRR-GOV-002_2026-04-21.md` | Read-only invariant — pre-existing discrepancy, no charter amendment |
| `.env.example` orphan keys | Deletion | Out-of-scope; risk of breaking external/infra tooling; deferred to follow-up ticket |
| All `src/**/index.ts` barrel exports | Deletion via ts-prune | Public API surface — skip rule |
| `src/api/**` exports | Deletion via ts-prune | Framework-wired by convention — skip rule |
| `src/db/models/**` exports | Deletion via ts-prune | Reflection/string-based reference risk — skip rule |
| Test-only exports (`SettlementService`, `ZkOracleService`, `setTestEnv`) | Deletion via ts-prune | Only-by-tests rule |

---

## Risk Register

| # | Item | Location | Recommendation |
|---|------|----------|----------------|
| 1 | `AuthMiddleware` — exported but not wired into `AppModule.configure()` | `src/middleware/auth.middleware.ts` | Either wire into AppModule or delete if superseded by NestJS guards |
| 2 | `RateLimitMiddleware` — exported but not wired | `src/middleware/rate-limit.middleware.ts` | Same — wire or delete |
| 3 | `TenantScopeMiddleware` — exported but not wired | `src/middleware/tenant-scope.middleware.ts` | Same — wire or delete |
| 4 | `AwardingWalletController` — NestJS controller not in any module | `src/controllers/awarding-wallet.controller.ts` | Register in a module or delete |
| 5 | `CreatorGiftingController` — NestJS controller not in any module | `src/controllers/creator-gifting.controller.ts` | Register in a module or delete |

---

## Follow-up Issues

- **CodeQL:** Issue already opened per problem statement — not duplicated here.
- **Risk register items 1–5:** Recommend a single follow-up issue "wire or delete orphaned middleware + controllers".
- **.env.example orphan keys:** Recommend a follow-up ticket for cleanup after confirming with infra team.
- **archive/README.md CLAUDE_2026-04-21.md discrepancy:** Recommend charter amendment to rename the file citation (requires OQMI authorization per archive README policy).

---

## Final Build/Test Counts

| Metric | Count |
|--------|-------|
| Test suites | **47 passed, 47 total** |
| Tests | **452 passed, 452 total** |
| Build errors | **0** |
| Lint errors | **0** |
| Lint warnings | **24** (pre-existing, all `@typescript-eslint/no-explicit-any` in spec files) |
