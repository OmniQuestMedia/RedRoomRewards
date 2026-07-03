# REQUIREMENTS MASTER — RedRoomRewards

**Authority:** Kevin B. Hartley, CEO — OmniQuest Media Inc. **Repo:**
OmniQuestMedia/RedRoomRewards **Source:**
RRR_CEO_DECISIONS_FINAL_2026-04-17.md + RRR_LOYALTY_ENGINE_SPEC_v1.1.md **Hard
launch target:** Phase 1 (RedRoomPleasures + Cyrano) before ChatNow.Zone **Last
updated:** 2026-04-17

> How to use this file: Agents: read this file before selecting your next
> directive. Update the Status column when a directive closes. Never mark a
> requirement DONE without a filed report-back.

## STATUS KEY

| Status          | Meaning                                               |
| --------------- | ----------------------------------------------------- |
| QUEUED          | Directive authored, in QUEUE, ready to execute        |
| IN_PROGRESS     | Directive executing — PR open                         |
| DONE            | Code on main, report-back filed, verified             |
| VERIFY          | Existing code — confirm it satisfies spec before ship |
| DEFERRED        | Not required at launch. Architecture must not block.  |
| RETIRED         | Removed from codebase. No code should reference this. |
| NEEDS_DIRECTIVE | Requirement confirmed, directive not yet authored     |
| CLARIFY         | Blocked — CEO decision required                       |

---

## P0 — FIX IMMEDIATELY (financial correctness bugs)

| ID         | Requirement                                                                                                                                   | Status          | Directive  | Notes                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------- | -------------------------------------------------------------------- |
| RRR-P0-001 | Wire wallet controller credit/deduct to real services. Remove const previousBalance = 1000 placeholders at wallet.controller.ts:131 and :186. | DONE            | RRR-P0-001 | Fixed in PR #212 — both sites now use WalletService.getUserBalance() |
| RRR-P0-002 | Enforce idempotency on credit/deduct paths in wallet.controller.ts                                                                            | NEEDS_DIRECTIVE | —          | Double-spend risk on retry                                           |
| RRR-P0-003 | Add CI workflow: npm run lint + tsc --noEmit + npm test on PR                                                                                 | NEEDS_DIRECTIVE | —          | TypeScript errors entering main undetected                           |

---

## P1 — FOUNDATION (required before product features)

| ID         | Requirement                                                                                                                               | Status          | Directive  | Notes                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------- | ---------------------------------------------------------- |
| RRR-P1-001 | Implement PointLot MongoDB model and lot-aware earn/expiry                                                                                | DONE            | RRR-P1-001 | Shipped in PR #218 — PointLot model on main                |
| RRR-P1-002 | Implement LoyaltyAccount + IdentityLink models. Default tenant: ChatNow.Zone                                                              | NEEDS_DIRECTIVE | —          | CEO Decision 2                                             |
| RRR-P1-003 | Effective-dated config models: ValuationConfig, EarnRateConfig, TierCapConfig (merchant-configurable), MicroTopupConfig, SpendOrderConfig | DONE            | RRR-P1-CFG | Shipped in PR #226 — all five config models on main        |
| RRR-P1-004 | Wrap wallet mutations in MongoDB sessions (startSession + transactions)                                                                   | NEEDS_DIRECTIVE | —          | Production concurrency safety                              |
| RRR-P1-005 | Implement spend ordering (EARLIEST_EXPIRY_THEN_FIFO)                                                                                      | NEEDS_DIRECTIVE | —          | Spec requirement                                           |
| RRR-P1-006 | Repo-wide rename: legacy platform name → ChatNow.Zone in all docs, comments, configs, model defaults                                      | DONE            | RRR-P1-006 | Shipped in PR #219 — CEO Decision D2                       |
| RRR-P1-007 | Remove slot machine code and spec documents per CEO Decision D1                                                                           | DONE            | RRR-P1-007 | Shipped in PR #222 — CEO Decision D1, slot machine retired |

---

## P2 — PRODUCT FEATURES (after P1 complete)

| ID         | Requirement                                                                                                    | Status          | Directive | Notes                  |
| ---------- | -------------------------------------------------------------------------------------------------------------- | --------------- | --------- | ---------------------- |
| RRR-P2-001 | Checkout quote endpoint (/v1/checkout/quote) — includes partial redemption UI data                             | NEEDS_DIRECTIVE | —         | CEO note C3, C4        |
| RRR-P2-002 | Redemption reserve/commit/release endpoints with partial amount support                                        | NEEDS_DIRECTIVE | —         | CEO note C4, C5        |
| RRR-P2-003 | Micro top-up trigger and purchase flow                                                                         | NEEDS_DIRECTIVE | —         | Spec Section 10        |
| RRR-P2-004 | Model gifting service and endpoint                                                                             | NEEDS_DIRECTIVE | —         | Spec Section 8         |
| RRR-P2-005 | Model allocation scheduler (monthly)                                                                           | NEEDS_DIRECTIVE | —         | Spec Section 8         |
| RRR-P2-006 | Tier multipliers wired to earn logic (merchant-configurable)                                                   | NEEDS_DIRECTIVE | —         | CEO Decision B2        |
| RRR-P2-007 | Promo engine — scheduling, segmentation, caps, multipliers, couponing, redemption windows, product-level rules | NEEDS_DIRECTIVE | —         | CEO note C6 (expanded) |
| RRR-P2-008 | Negative balance paydown logic                                                                                 | NEEDS_DIRECTIVE | —         | Spec Section 7         |
| RRR-P2-009 | Chargeback-specific reversal path                                                                              | NEEDS_DIRECTIVE | —         | Spec requirement       |
| RRR-P2-010 | Liability reporting endpoint (near real-time)                                                                  | NEEDS_DIRECTIVE | —         | Spec Section 12        |
| RRR-P2-011 | Merchant login and reporting surface                                                                           | NEEDS_DIRECTIVE | —         | CEO note C1            |
| RRR-P2-012 | Consumer member login surface                                                                                  | NEEDS_DIRECTIVE | —         | CEO note C1            |
| RRR-P2-013 | Earn/burn template library — standard + customizable                                                           | NEEDS_DIRECTIVE | —         | CEO note C2            |
| RRR-P2-014 | RRR account rep authorization workflow for merchant program activation                                         | NEEDS_DIRECTIVE | —         | CEO note C2            |
| RRR-P2-015 | Customer segmentation engine                                                                                   | NEEDS_DIRECTIVE | —         | CEO note C6            |
| RRR-P2-016 | Segment-targeted communications (email/in-app)                                                                 | NEEDS_DIRECTIVE | —         | CEO note C6            |
| RRR-P2-017 | Tier-based redemption caps (merchant-configurable via TierCapConfig)                                           | NEEDS_DIRECTIVE | —         | CEO Decision B5        |

---

## P3 — CNZ INTEGRATION (Phase 2 — after Phase 1 merchants live)

| ID         | Requirement                                                                                                                                            | Status          | Directive | Notes               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | --------- | ------------------- |
| RRR-P3-001 | CZT-aware earn event type in ingest-event.model.ts                                                                                                     | NEEDS_DIRECTIVE | —         | CEO Decision 2      |
| RRR-P3-002 | WELCOME_CREDIT earn path from CNZ GWC-001 events                                                                                                       | NEEDS_DIRECTIVE | —         | CNZ GWC-001         |
| RRR-P3-003 | REMOVED — Diamond Concierge earns 0 points                                                                                                             | RETIRED         | —         | CEO Decision 3      |
| RRR-P3-004 | GGS webhook integration points (receive-ready, hold logic deferred)                                                                                    | NEEDS_DIRECTIVE | —         | CEO Decision 5      |
| RRR-P3-005 | Room-Heat Inferno bonus multiplier: tipped + present + active within 30min. Value merchant-configurable via inferno_multiplier field on EarnRateConfig | NEEDS_DIRECTIVE | —         | CEO Decision 4 + B1 |
| RRR-P3-006 | Micro top-up earn event ingest from CNZ                                                                                                                | NEEDS_DIRECTIVE | —         | Spec Section 10     |
| RRR-P3-007 | Pre-checkout RRR API call — available points, earn preview, partial redemption choice                                                                  | NEEDS_DIRECTIVE | —         | CEO note C3         |
| RRR-P3-008 | Cross-merchant redemption: 1:1 default, configurable via MerchantPairConfig                                                                            | NEEDS_DIRECTIVE | —         | CEO Decision B4     |
| RRR-P3-009 | GGS pre-payment coordination: RRR quote surfaced to consumer before processor call                                                                     | NEEDS_DIRECTIVE | —         | CEO note C3         |

---

## P4 — CLEANUP AND QUALITY

| ID         | Requirement                                                             | Status          | Directive | Notes                                                    |
| ---------- | ----------------------------------------------------------------------- | --------------- | --------- | -------------------------------------------------------- |
| RRR-P4-001 | Execute CLEANUP.md checklist                                            | NEEDS_DIRECTIVE | —         | Remaining items: media, social, commerce, discovery      |
| RRR-P4-002 | MongoDB session transactions full implementation with integration tests | NEEDS_DIRECTIVE | —         | Full resolution of wallet.service.ts C1                  |
| RRR-P4-003 | Replace any with typed FilterQuery in replay.ts:36                      | NEEDS_DIRECTIVE | —         | NoSQL injection risk                                     |
| RRR-P4-004 | Documentation consolidation: 28 root markdown files to ~8               | DONE            | —         | Consolidated to 8 root docs, moved rest to docs/ subdirs |
| RRR-P4-005 | Add .prettierrc                                                         | NEEDS_DIRECTIVE | —         | Self-assessment M2                                       |
| RRR-P4-006 | Pre-commit hooks: husky + lint-staged                                   | NEEDS_DIRECTIVE | —         | Self-assessment H4                                       |
| RRR-P4-007 | Type splits: wallet/types.ts and services/types.ts                      | NEEDS_DIRECTIVE | —         | Self-assessment H3                                       |
| RRR-P4-008 | Remove/archive archive/xxxchatnow-seed/                                 | DONE            | —         | Removed per CEO Decision D1                              |
| RRR-P4-009 | Fix garbled text in docs/ROADMAP_AND_BACKLOG.md Milestone 2             | NEEDS_DIRECTIVE | —         | LLM artifact                                             |

---

## PIPELINE INFRASTRUCTURE

| ID       | Requirement                                                                                                                             | Status | Directive                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------ |
| PIPE-001 | PROGRAM_CONTROL directory structure                                                                                                     | DONE   | RRR-BOOTSTRAP-001                    |
| PIPE-002 | .github/copilot-instructions.md                                                                                                         | DONE   | RRR-BOOTSTRAP-001                    |
| PIPE-003 | RRR-GOV-002 charter at `PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md` (replaces the prior root governance file archived under A-001) | DONE   | RRR-BOOTSTRAP-001 / RRR-GOV-002-A001 |
| PIPE-004 | directive-intake.yml                                                                                                                    | DONE   | RRR-BOOTSTRAP-001                    |
| PIPE-005 | directive-dispatch.yml                                                                                                                  | DONE   | RRR-BOOTSTRAP-001                    |
| PIPE-006 | auto-merge.yml                                                                                                                          | DONE   | RRR-BOOTSTRAP-001                    |
| PIPE-007 | docs/DOMAIN_GLOSSARY.md                                                                                                                 | DONE   | RRR-BOOTSTRAP-001                    |
| PIPE-008 | docs/REQUIREMENTS_MASTER.md (this file)                                                                                                 | DONE   | RRR-BOOTSTRAP-001                    |
| PIPE-009 | docs/RRR_CEO_DECISIONS_FINAL_2026-04-17.md                                                                                              | DONE   | RRR-BOOTSTRAP-001                    |
| PIPE-010 | .github/workflows/ci.yml                                                                                                                | DONE   | RRR-BOOTSTRAP-001                    |
| PIPE-011 | Governance doc commit prefix enum patch                                                                                                 | DONE   | RRR-BOOTSTRAP-001                    |

---

_Maintained by: Claude Chat (architecture) + Copilot/Claude Code (execution)_
_Update this file as part of every directive report-back commit._ _CEO
authority: Kevin B. Hartley — OmniQuest Media Inc._

---

**Last verified:** 2026-04-21 **Source:** Phase 1 assessment (see RRR-GOV-002
charter §5.1 — current build state on `main`) **Verified by:** RRR-GOV-002-A004
