# CLEANUP-DROID-PLAN — Phase 0 Inventory & Proposal

**Branch:** `copilot/claudecleanup-legacy-code-3ecy8`  
**HEAD:** `ac9e2dd`  
**Date:** 2026-04-26  
**Status:** AWAITING APPROVAL — no writes have been made

---

## 1. Markdown Census

Total markdown files outside `node_modules/` and `.git/`: **122**

### Root-level files (11 .md files)

| path | lines | last-commit-date | last-commit-sha | classification |
|------|-------|-----------------|----------------|----------------|
| `README.md` | 24 | 2026-04-24 | 513cc25 | `STALE` — claims "FULLY COMPLETE (Payloads 1–10)" but repo is mid-Wave D (#26) |
| `CONTRIBUTING.md` | 625 | 2026-04-25 | ac9e2dd | `KEEP-ROOT` |
| `SECURITY.md` | 103 | 2026-04-25 | ac9e2dd | `KEEP-ROOT` |
| `ARCHITECTURE.md` | 438 | 2026-04-25 | ac9e2dd | `KEEP-ROOT` — comprehensive full-architecture doc; NOT duplicate of `docs/ARCHITECTURE.md` |
| `CLEANUP.md` | 123 | 2026-04-25 | ac9e2dd | `KEEP-ROOT` |
| `FLAGS.md` | 136 | 2026-04-25 | ac9e2dd | `KEEP-ROOT` |
| `DEPLOYMENT-CHECKLIST.md` | 31 | 2026-04-25 | ac9e2dd | `KEEP-ROOT` |
| `ASSUMPTIONS.md` | 325 | 2026-04-25 | ac9e2dd | `MOVE-TO:docs/ASSUMPTIONS.md` |
| `OQMI_PROTOTYPE_STANDARDS.md` | 91 | 2026-04-25 | ac9e2dd | `MOVE-TO:docs/governance/OQMI_PROTOTYPE_STANDARDS.md` |
| `README-AWARDINGWALLET-AV.md` | 13 | 2026-04-25 | ac9e2dd | `MOVE-TO:docs/AWARDING_WALLET_AV.md` |
| `Copilot Instructions.md` | 40 | (untracked path) | unknown | `MOVE-TO:docs/governance/COPILOT_INSTRUCTIONS.md` — content DIFFERS from `docs/history/COPILOT_INSTRUCTIONS.md`; see §2 |

> **Note on `Copilot Instructions.md`:** The root file is janitorial-agent instructions (file operations, audits). `docs/history/COPILOT_INSTRUCTIONS.md` is the archived coding-standards governance doc. They share 0% normalized content — completely different files. Per Phase 1 rule: content differs → move, do not delete.

### `.github/` files (5)

| path | lines | last-commit-date | last-commit-sha | classification |
|------|-------|-----------------|----------------|----------------|
| `.github/KICKOFF.md` | 13 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `.github/PRODUCTION_SCHEDULE.md` | 141 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — active charter, parsed by CI |
| `.github/copilot-instructions.md` | 342 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — authoritative coding doctrine |
| `.github/pull_request_template.md` | 70 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `.github/refs-branch-policy.md` | 56 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |

### `LEGACY_CONFIGS/` (1)

| path | lines | last-commit-date | last-commit-sha | classification |
|------|-------|-----------------|----------------|----------------|
| `LEGACY_CONFIGS/README.md` | 33 | 2026-04-24 | 513cc25 | `KEEP-ARCHIVE` — governed by its own README; removal requires OQMI authorization |

### `PROGRAM_CONTROL/` files (14)

| path | lines | last-commit-date | last-commit-sha | classification |
|------|-------|-----------------|----------------|----------------|
| `PROGRAM_CONTROL/GOV-GATE-TRACKER.md` | 54 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `PROGRAM_CONTROL/DIRECTIVES/DONE/PRODUCTION-SCHEDULE-D-FINAL-DONE.md` | 37 | 2026-04-24 | 513cc25 | `KEEP-DOCS` — audit trail |
| `PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-GOV-002-A001-DONE.md` | 55 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-GOV-002-A002-DONE.md` | 48 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-GOV-002-A003-DONE.md` | 54 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-GOV-002-A004-DONE.md` | 58 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-GOV-002-A005-DONE.md` | 106 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `PROGRAM_CONTROL/DIRECTIVES/QUEUE/OQMI_GOVERNANCE.md` | 358 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — active governance; DO NOT TOUCH |
| `PROGRAM_CONTROL/DIRECTIVES/QUEUE/OQMI_SYSTEM_STATE_RRR.md` | 215 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — living state tracker; DO NOT TOUCH |
| `PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md` | 822 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — active charter; DO NOT TOUCH |
| `PROGRAM_CONTROL/REPORT_BACK/REPO_MANIFEST.md` | 4 | 2026-04-24 | 513cc25 | `KEEP-DOCS` — append-only |
| `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A-CLEAN-report.md` | 160 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A001-report.md` | 83 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A002-report.md` | 82 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A003-report.md` | 73 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A004-report.md` | 81 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A005-report.md` | 129 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |

### `REFERENCE_LIBRARY/` files (7)

| path | lines | last-commit-date | last-commit-sha | classification |
|------|-------|-----------------|----------------|----------------|
| `REFERENCE_LIBRARY/00_THREAD_BOOTSTRAP.md` | 96 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — no byte-identical match to docs/ |
| `REFERENCE_LIBRARY/01_CANONICAL_LOCKS.md` | 65 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `REFERENCE_LIBRARY/02_DOMAIN_TAXONOMY.md` | 64 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `REFERENCE_LIBRARY/03_FEATURE_BRIEFS.md` | 42 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `REFERENCE_LIBRARY/04_AI_REFERENCE_INDEX.md` | 85 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `REFERENCE_LIBRARY/05_OSS_REPO_REGISTRY.md` | 48 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `REFERENCE_LIBRARY/06_PROJECT_DECISIONS.md` | 49 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |

> **Phase 0 check:** No REFERENCE_LIBRARY file is byte-identical to any `docs/` file. No action required.

### `archive/` files (29)

All `archive/` files are classified `KEEP-ARCHIVE` per Phase 3 read-only invariant.

| path | lines | last-commit-date | last-commit-sha | classification |
|------|-------|-----------------|----------------|----------------|
| `archive/README.md` | 26 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/CHIP_MENU_TOKEN_SYSTEMS_v1.0.md` | 83 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/COPILOT_EXECUTION_RULES.md` | 78 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/COPILOT_GOVERNANCE.md` | 176 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` — `DUPLICATE-OF:docs/history/COPILOT_GOVERNANCE.md`; see §2 |
| `archive/governance-v1/COPILOT_INSTRUCTIONS.md` | 695 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` — `DUPLICATE-OF:docs/history/COPILOT_INSTRUCTIONS.md`; see §2 |
| `archive/governance-v1/DECISIONS.md` | 28 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/OQMI_GOVERNANCE.md` | 335 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/OQMI_SYSTEM_STATE.md` | 308 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/OQMI_SYSTEM_STATE_RRR.md` | 257 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-BOOTSTRAP-001.md` | 122 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-WORK-001-A001-DONE.md` | 55 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-WORK-001-A002-DONE.md` | 68 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/HANDOFFS/THREAD-06-HANDOFF.md` | 144 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/CNZ-WORK-A001-report.md` | 320 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/REFERENCE-LIBRARY-INIT-REPORT-BACK.md` | 39 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/RRR-BOOTSTRAP-001-report.md` | 75 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/RRR-P0-001-report.md` | 137 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/RRR-P0-002-report.md` | 105 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/RRR-P1-001-report.md` | 55 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/RRR-P1-006-report.md` | 132 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/RRR-P1-007-report.md` | 161 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/RRR-P1-CFG-report.md` | 61 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/RRR-WORK-001-A001-report.md` | 93 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/RRR-WORK-001-A002-report.md` | 133 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/RISKY_NAME_CHANGE_TAGS.md` | 53 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` — `DUPLICATE-OF:docs/history/RISKY_NAME_CHANGE_TAGS.md`; see §2 |
| `archive/governance-v1/RRR-WORK-001.md` | 1371 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |
| `archive/governance-v1/WORK_ORDER_82B.md` | 27 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` — `DUPLICATE-OF:docs/history/WORK_ORDER_82B.md`; see §2 |
| `archive/governance-v1/WORK_ORDER_82B_82C_ADDENDUM.md` | 20 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` — `DUPLICATE-OF:docs/history/WORK_ORDER_82B_82C_ADDENDUM.md`; see §2 |
| `archive/governance/RRR-GOV-002_2026-04-21.md` | 811 | 2026-04-25 | ac9e2dd | `KEEP-ARCHIVE` |

### `docs/` files (40)

| path | lines | last-commit-date | last-commit-sha | classification |
|------|-------|-----------------|----------------|----------------|
| `docs/ARCHITECTURE.md` | 58 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — different doc from root `ARCHITECTURE.md`; see §2 |
| `docs/DATABASE_SCHEMA.md` | 632 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/DOMAIN_GLOSSARY.md` | 118 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/EVENT_ARCHITECTURE.md` | 389 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/FEATURE_COMPLIANCE_CHECKLIST.md` | 492 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/PROMOTION_RULES.md` | 39 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/QUEUE_INTEGRATION_GUIDE.md` | 629 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/REQUIREMENTS_MASTER.md` | 133 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/ROADMAP_AND_BACKLOG.md` | 45 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/RRR_CEO_DECISIONS_FINAL_2026-04-17.md` | 133 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/RRR_LOYALTY_ENGINE_SPEC_v1.1.md` | 629 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/TESTING_STRATEGY.md` | 884 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/TEST_SUITE.md` | 326 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/UNIVERSAL_ARCHITECTURE.md` | 326 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/WALLET_ESCROW_ARCHITECTURE.md` | 758 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/ci/CI_GOVERNANCE.md` | 97 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/ci/CI_TROUBLESHOOTING.md` | 52 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/contracts/README.md` | 274 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/contracts/idempotency-and-retries.md` | 543 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/governance/AGENT_EXECUTION_RULES.md` | 78 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/governance/ENGINEERING_STANDARDS.md` | 33 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/history/AUDIT_IMPLEMENTATION_SUMMARY.md` | 370 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/history/COPILOT_GOVERNANCE.md` | 176 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — canonical copy; `archive/governance-v1/COPILOT_GOVERNANCE.md` is duplicate |
| `docs/history/COPILOT_INSTRUCTIONS.md` | 695 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — canonical copy; `archive/governance-v1/COPILOT_INSTRUCTIONS.md` is duplicate |
| `docs/history/CORE_MODULES_IMPLEMENTATION.md` | 448 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/history/FINANCIAL_AUDIT_REPORT.md` | 594 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/history/IMPLEMENTATION_NOTES.md` | 279 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/history/IMPLEMENTATION_STATUS.md` | 353 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/history/IMPLEMENTATION_SUMMARY.md` | 451 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/history/RISKY_NAME_CHANGE_TAGS.md` | 53 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — canonical copy; `archive/governance-v1/RISKY_NAME_CHANGE_TAGS.md` is duplicate |
| `docs/history/STATUS_REPORT.md` | 719 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/history/TECH_DEBT_ASSESSMENT_2026-04-21.md` | 190 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/history/WORK_ORDER_82B.md` | 27 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — canonical copy |
| `docs/history/WORK_ORDER_82B_82C_ADDENDUM.md` | 20 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` — canonical copy |
| `docs/security/COMPREHENSIVE_SECURITY_REVIEW_2026-01-04.md` | 695 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/security/SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` | 883 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/security/SECURITY_BEST_PRACTICES.md` | 509 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/security/SECURITY_REVIEW_IMPLEMENTATION_SUMMARY.md` | 312 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/security/SECURITY_SUMMARY.md` | 499 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/specs/CHIP_MENU_TOKEN_SYSTEMS_v1.0.md` | 83 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `docs/specs/WO-011-ZK-ORACLE-ARCHITECTURE.md` | 262 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |

### `infra/` files (4)

| path | lines | last-commit-date | last-commit-sha | classification |
|------|-------|-----------------|----------------|----------------|
| `infra/README.md` | 35 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `infra/config/README.md` | 23 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `infra/db/README.md` | 26 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |
| `infra/migrations/README.md` | 151 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` |

### `src/` README files (7)

| path | lines | last-commit-date | last-commit-sha | classification | decision |
|------|-------|-----------------|----------------|----------------|----------|
| `src/README.md` | 35 | 2026-04-25 | ac9e2dd | `DELETE` | Stub — says "All subdirectories are currently **scaffolded only**" which is false; substantive guidance is covered by `.github/copilot-instructions.md` §9 |
| `src/api/README.md` | 287 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` | 287 lines of substantive API endpoint documentation |
| `src/events/README.md` | 466 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` | 466 lines of event architecture and implementation detail |
| `src/ledger/README.md` | 122 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` | 122 lines of ledger design and service API docs |
| `src/services/README.md` | 205 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` | 205 lines covering all service classes and contracts |
| `src/wallets/README.md` | 161 | 2026-04-25 | ac9e2dd | `KEEP-DOCS` | 161 lines of wallet architecture and concurrency documentation |
| `src/webhooks/README.md` | 32 | 2026-04-25 | ac9e2dd | `DELETE` | Stub — says "Status: Scaffolded only - no implementation yet" which is false; webhook implementation exists in `webhook-receive.service.ts`, `webhook-emit.service.ts` |

---

## 2. Duplicate Detection

### Confirmed candidate pairs

| Pair | Normalized comparison | Winner | Recommendation |
|------|-----------------------|--------|----------------|
| `archive/governance-v1/COPILOT_GOVERNANCE.md` ↔ `docs/history/COPILOT_GOVERNANCE.md` | **100% IDENTICAL** | `docs/history/` | KEEP BOTH — archive is read-only; cannot delete per Phase 3 invariant |
| `archive/governance-v1/COPILOT_INSTRUCTIONS.md` ↔ `docs/history/COPILOT_INSTRUCTIONS.md` | **100% IDENTICAL** | `docs/history/` | KEEP BOTH — archive is read-only |
| `archive/governance-v1/RISKY_NAME_CHANGE_TAGS.md` ↔ `docs/history/RISKY_NAME_CHANGE_TAGS.md` | **100% IDENTICAL** | `docs/history/` | KEEP BOTH — archive is read-only |
| `archive/governance-v1/WORK_ORDER_82B.md` ↔ `docs/history/WORK_ORDER_82B.md` | **100% IDENTICAL** | `docs/history/` | KEEP BOTH — archive is read-only |
| `archive/governance-v1/WORK_ORDER_82B_82C_ADDENDUM.md` ↔ `docs/history/WORK_ORDER_82B_82C_ADDENDUM.md` | **100% IDENTICAL** | `docs/history/` | KEEP BOTH — archive is read-only |
| `ARCHITECTURE.md` (root, 438 lines) ↔ `docs/ARCHITECTURE.md` (58 lines) | **NOT IDENTICAL** — 1.1% similarity | Both are different documents | KEEP BOTH — root is comprehensive full-architecture doc; `docs/ARCHITECTURE.md` is a supplementary domain-boundary rules doc |

### Instruction conflict flagged

Phase 1 says: "delete the `archive/governance-v1/` copy **only if** Phase 0 confirms they are byte-equivalent."
Phase 3 says: "`archive/` — **DO NOT DELETE, DO NOT EDIT, DO NOT MOVE.**"

All 5 pairs ARE byte-equivalent, but Phase 3 read-only invariant takes precedence. **I will NOT delete any `archive/governance-v1/` copies.** This conflict requires Senior Engineer adjudication before any action.

### `Copilot Instructions.md` (root) vs `docs/history/COPILOT_INSTRUCTIONS.md`

- Root file: 40 lines — janitorial-agent instruction file (file ops, audits, CI)
- `docs/history/COPILOT_INSTRUCTIONS.md`: 695 lines — archived coding-standards governance doc
- **Verdict: completely different content** (0% similarity). Per Phase 1: move root copy to `docs/governance/COPILOT_INSTRUCTIONS.md`.

---

## 3. Dead-Code Candidates

### ts-prune

**STATUS: CANNOT RUN** — `tsconfig.json` has a JSON syntax error (duplicate `"exclude"` key at line 52). This is a pre-existing defect introduced in commit `ac9e2dd`:

```
"exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "**/*.example.ts", "LEGACY_CONFIGS"]
"exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "LEGACY_CONFIGS", "src/api/receipt-endpoint.example.ts"]
```

The second `"exclude"` line was added but the first was not removed. JSON does not allow duplicate object keys — TypeScript treats this as a parse error (`TS1005: ',' expected`), causing all 47 test suites to fail and `npm run build` to fail. This is NOT introduced by this cleanup pass.

**Impact:** ts-prune cannot analyze the codebase until this is fixed. Dead-export analysis is BLOCKED. Propose fixing this in Phase 4 as a follow-up issue (not in scope for this cleanup).

### depcheck

```
Unused devDependencies: @types/jest
Missing dependencies:   express (used in src/middleware/auth.middleware.ts)
```

- `@types/jest` — marked unused by depcheck because Jest types are provided via `tsconfig.json` `types` array. This is a false positive. Do not remove.
- `express` missing — depcheck does not trace NestJS DI injection; `express` types are used transitively. Do not act without further analysis.

---

## 4. Orphan Asset Scan

**STATUS: PARTIALLY BLOCKED** — ts-prune cannot run due to tsconfig.json defect (§3). Full transitive import analysis from entrypoints is not possible without a working TypeScript project.

**Entrypoints discovered:** `src/main.ts`, `src/app.module.ts`, `src/openapi.ts`, `src/test-setup.ts`

**Manual scan result:** All TypeScript files in `src/` are organized into NestJS modules (`*.module.ts`) with explicit provider/controller registrations. No obviously-isolated files were found via manual inspection. Authoritative orphan scan must wait for tsconfig.json fix.

Test files are explicitly excluded from orphan consideration per instructions.

---

## 5. Broken Link Scan

10 broken relative links found in markdown files:

| Source file | Link | Target | Notes |
|------------|------|--------|-------|
| `archive/governance-v1/RISKY_NAME_CHANGE_TAGS.md` | `./ARCHITECTURE.md` | `archive/governance-v1/ARCHITECTURE.md` (missing) | In read-only archive; do not fix |
| `archive/governance-v1/RISKY_NAME_CHANGE_TAGS.md` | `./security/SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` | `archive/governance-v1/security/...` (missing) | In read-only archive; do not fix |
| `archive/governance-v1/PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-BOOTSTRAP-001.md` | `url` | literal "url" placeholder | In read-only archive; do not fix |
| `docs/TEST_SUITE.md` | `/docs/TESTING_STRATEGY.md` | `/docs/TESTING_STRATEGY.md` | Absolute path — valid on deployed site; not a disk-level 404 |
| `docs/TEST_SUITE.md` | `/SECURITY.md` | `/SECURITY.md` | Same — absolute path |
| `docs/TEST_SUITE.md` | `/docs/history/CORE_MODULES_IMPLEMENTATION.md` | Same — absolute path | Same |
| `docs/contracts/README.md` | `/docs/` | `/docs` dir | Absolute path link to a directory — valid |
| `docs/history/RISKY_NAME_CHANGE_TAGS.md` | `./ARCHITECTURE.md` | `docs/history/ARCHITECTURE.md` (missing) | History copy of archived file; links were valid in original location |
| `docs/history/RISKY_NAME_CHANGE_TAGS.md` | `./security/SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` | `docs/history/security/...` (missing) | Same — links were for original context |
| `docs/security/SECURITY_BEST_PRACTICES.md` | `../SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` | `docs/SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` (missing) | File is at `docs/security/SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` — should be `./SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` |

**Actionable broken link (1):**
- `docs/security/SECURITY_BEST_PRACTICES.md` line referencing `../SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` — target file exists at `docs/security/SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md`. The link should be `./SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md`. This is a pre-existing error.

**Non-actionable (9):** Archive files (read-only), absolute paths (valid for deployed GitHub rendering), history copies whose links were correct in their original context.

---

## 6. `.env.example` Key Hygiene

| Key | Used in `src/`? | Notes |
|-----|----------------|-------|
| `MONGODB_URI` | ✅ USED | `src/config/app.config.ts`, `src/db/connection.ts` |
| `DATABASE_URL` | ⚠️ ORPHAN | Not referenced in any `src/**/*.ts` |
| `JWT_SECRET` | ✅ USED | `src/middleware/auth.middleware.ts` |
| `QUEUE_AUTH_SECRET` | ✅ USED | `src/wallets/wallet.service.ts` |
| `TOKEN_EXPIRY_SECONDS` | ⚠️ ORPHAN | Not referenced in `src/` |
| `RRR_WEBHOOK_SECRET` | ✅ USED | `src/webhooks/webhook-receive.service.ts` |
| `PORT` | ✅ USED | `src/main.ts` |
| `API_BASE_PATH` | ⚠️ ORPHAN | Not referenced in `src/` |
| `LOG_LEVEL` | ✅ USED | `src/lib/logger.ts` |
| `LOG_FORMAT` | ⚠️ ORPHAN | Not referenced in `src/` |
| `DEBUG_MODE` | ⚠️ ORPHAN | Not referenced in `src/` |
| `VERBOSE_LOGGING` | ⚠️ ORPHAN | Not referenced in `src/` |
| `RATE_LIMIT_PER_MINUTE` | ⚠️ ORPHAN | Not referenced in `src/` |
| `CORS_ORIGINS` | ✅ USED | `src/main.ts` |
| `GATEGUARD_AV_API_KEY` | ⚠️ ORPHAN | `src/services/gateguard-av.service.ts` uses `GATEGUARD` name in response but does NOT read this env key (stub implementation) |
| `GATEGUARD_AV_ENDPOINT` | ⚠️ ORPHAN | Same — stub, no `process.env` read |
| `SERVICE_BUREAU_ENABLED` | ⚠️ ORPHAN | Not referenced in `src/` |

**10 orphan keys identified.** Per Phase 2 §3: "remove only the ones you can prove are unreferenced." All 10 appear unreferenced in `src/`. However, some may be used by `scripts/`, `infra/`, or `.github/workflows/` (depcheck misses those per the instructions). **I will not remove any without confirming against those directories.** Propose as a Phase 2 action after approval.

---

## 7. Pre-existing Build Defect (BLOCKER)

`tsconfig.json` has duplicate `"exclude"` keys (JSON syntax error). This causes:
- `npm run build` → FAIL (`TS1005: ',' expected`)
- `npm test` (47 suites) → ALL FAIL (TypeScript compilation blocked)
- `ts-prune` → CANNOT RUN
- `npx tsc --noEmit` → FAIL

**This is NOT introduced by this cleanup pass.** It was introduced in commit `ac9e2dd` (the most recent HEAD). The fix is trivial (remove the first `"exclude"` line, which is superseded by the second), but this is a code change not in scope for this cleanup-only pass unless explicitly authorized.

**Request:** Please confirm whether fixing this tsconfig.json defect is in scope. Without it, Phase 4 hardening checks will all report FAIL and ts-prune analysis is impossible.

---

## 8. Final Proposed Action List (awaiting approval)

Numbered diff-of-intent:

### Markdown moves (Phase 1)

1. **MOVE** `ASSUMPTIONS.md` → `docs/ASSUMPTIONS.md`
   - Reason: Phase 1 instruction. No in-repo markdown links reference it by path (only commented `spec ASSUMPTIONS.md` in `.ts` files, which are not path-resolved).
   - Link updates needed: None (referenced only as comment text in `.ts` files).

2. **MOVE** `OQMI_PROTOTYPE_STANDARDS.md` → `docs/governance/OQMI_PROTOTYPE_STANDARDS.md`
   - Reason: Phase 1 instruction. Not referenced by path in any live file.

3. **MOVE** `README-AWARDINGWALLET-AV.md` → `docs/AWARDING_WALLET_AV.md`
   - Reason: Phase 1 instruction (rename: drop `README-` prefix).

4. **MOVE** `Copilot Instructions.md` → `docs/governance/COPILOT_INSTRUCTIONS.md`
   - Reason: Phase 1 instruction; content differs from `docs/history/COPILOT_INSTRUCTIONS.md` (confirmed).
   - Note: Also fixes the space-in-filename issue.

5. **REWRITE** `README.md` — replace stale marketing copy with honest landing page
   - Target content: one-paragraph description, "Status: pre-ship, Wave D in progress", quick-start, pointers to key docs.

### Stale src/ READMEs (Phase 1)

6. **DELETE** `src/README.md`
   - Reason: Stub content claims "All subdirectories are currently scaffolded only" — false. Content is superseded by `.github/copilot-instructions.md` §9.

7. **DELETE** `src/webhooks/README.md`
   - Reason: Stub content says "Status: Scaffolded only - no implementation yet" — false; webhook implementation exists. No substantive guidance not covered elsewhere.

### archive/ duplicates (Phase 1 / Phase 3 conflict)

8. **NO ACTION** on `archive/governance-v1/` duplicate copies
   - Reason: Phase 3 read-only invariant takes precedence over Phase 1 deletion instruction. Flagged for Senior Engineer decision.

### archive/README.md citation check (Phase 3)

9. **VERIFY** `archive/README.md` — check whether any citation points at a file moved by actions 1–4
   - `archive/README.md` currently mentions only `governance/CLAUDE_2026-04-21.md` and the active charter. None of the proposed moves affect these citations. **Result: no update needed.**

### Broken link fix (Phase 2 / Phase 1 crossover)

10. **EDIT** `docs/security/SECURITY_BEST_PRACTICES.md` — fix `../SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` → `./SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md`
    - Reason: Only actionable broken link; file exists at `docs/security/SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md`, link is one directory too far up.

### Dead exports / unused dependencies (Phase 2)

11. **BLOCKED** — ts-prune cannot run; dead-export deletion is deferred until tsconfig.json defect is resolved.

12. **NO CHANGE** to `@types/jest` devDependency — depcheck false positive (provided via tsconfig `types` array).

13. **NO CHANGE** to `express` missing-dep finding — false positive from NestJS DI tracing.

14. **DEFER** `.env.example` orphan key removal — need to verify against `scripts/`, `infra/`, `.github/workflows/` before acting. Will do as Phase 2 sub-step after approval.

### tsconfig.json fix (Phase 2 / follow-up issue)

15. **REQUEST DECISION**: Fix duplicate `"exclude"` key in `tsconfig.json` or open as follow-up issue. Without this fix, Phase 4 will report ALL hardening checks as FAIL and ts-prune analysis is blocked.

---

## Pre-approval summary

| Category | Action count | Notes |
|----------|-------------|-------|
| Root .md moves | 4 | Actions 1–4 |
| Root README rewrite | 1 | Action 5 |
| src/ stub deletes | 2 | Actions 6–7 |
| archive/ duplicate deletes | 0 | BLOCKED by Phase 3 invariant |
| Broken link fix | 1 | Action 10 |
| Dead exports | 0 | BLOCKED by tsconfig defect |
| Dependency changes | 0 | False positives |
| .env.example orphans | Deferred | Verify scripts/infra first |
| tsconfig.json defect | Awaiting decision | Blocks Phase 4 |

**STOP — awaiting explicit approval before proceeding to Phase 1.**
