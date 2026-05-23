# RRR-GOV-002 — Governance Delta \+ Active Work Charter

**Type:** Persistent Architecture & Coding Charter (does NOT move to DONE)
**Status:** ACTIVE — source of truth for architecture and coding **Authority:**
Kevin B. Hartley, CEO — OmniQuest Media Inc. **Correlation ID:** RRR-GOV-002
**FIZ:** NO (this charter authors no financial code) **CEO_GATE:** NO **Branch
(charter ratification):** `claude/adapt-governance-pattern-J9D4I` **Date
opened:** 2026-04-21 **Supersedes:** `CLAUDE.md` (archived per Task A-001),
implicit roles in `.github/copilot-instructions.md` for ARCHITECT/DROID modes

---

## 0\. PERSISTENCE & LIFECYCLE — READ FIRST

This file is **NOT a normal directive**. It does not move to `DONE/` when work
completes.

- **The charter file (this document) is persistent.** It lives at
  `PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md` indefinitely.
- **Tasks inside this charter are individually trackable.** Each task has a
  stable ID (`RRR-GOV-002-A001`, `RRR-GOV-002-A002`, …).
- **When a task merges, two things happen:**
  1. A completion record is written to
     `PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-GOV-002-<task-id>-DONE.md` using the
     template in §11 below.
  2. The task's `Status:` line in §6 is amended in-place from `QUEUED` → `DONE`
     and the merge commit SHA \+ DONE filename are appended.
- **The charter is amended, not replaced.** New tasks may be appended to the
  active Wave by the CEO or by ARCHITECT MODE with CEO sign-off. Closed tasks
  are never deleted from the charter — they remain as history.
- **The charter only retires** when the CEO explicitly authors a successor
  charter (e.g. `RRR-GOV-003`) and marks this one `RETIRED`. At that point it
  moves to `archive/governance/`.

---

## 1\. PURPOSE

Consolidate into a single source of truth:

1. The **architecture & governance contract** for RedRoomRewards (roles, modes,
   invariants, prohibitions) — content previously held in `CLAUDE.md` and
   implied by Phase 2 §2 / §5A / §5E of the governance assessment.
2. The **prioritized active work stream** — coding tasks, sequenced by
   dependency, executed first-come-first-served by Grok.

This eliminates the multi-document drift that produced the stale Build State in
`CLAUDE.md` and the open-ended "Sovereign Kernel" / "Tech Debt Delta" /
"ARCHITECT_SESSIONS" proposals from Phase 2\. All redundant per CEO ruling
2026-04-21.

---

## 2\. ROLES & MODES

### 2.1 Human roles

| Role                     | Identity                                 | Authority                                                                                         |
| :----------------------- | :--------------------------------------- | :------------------------------------------------------------------------------------------------ |
| CEO / Operator           | Kevin B. Hartley                         | Final approval on this charter, all `CEO_GATE: YES` tasks, all FIZ merges, all charter amendments |
| Architecture Coordinator | Claude Chat (this thread and successors) | Authors directives, sequences tasks, verifies merges, produces handoffs                           |

### 2.2 Agent modes

**DROID MODE (default for executing agents)**

- `grok`, executing a single task from §6. (Copilot remains limited to file ops,
  cleanup, and audits — see §2.3 and §10.)
- May only act on the task currently claimed.
- HARD_STOP on any ambiguity, missing dependency, missing operator decision, or
  invariant conflict (§3).
- Reports back to `PROGRAM_CONTROL/REPORT_BACK/<task-id>-report.md` on every
  task.
- **May open GitHub pull requests against `main` for any task it has validly
  claimed.** Standing CEO authorization granted 2026-04-21 — the agent does not
  need to ask per-task. The `CEO_GATE` and `FIZ` label-driven auto-merge gating
  (§3.5 item 18, enforced by `.github/workflows/auto-merge.yml` per task A-005)
  remains the merge control; PR _creation_ is unrestricted, PR _merge_ is not.
- **PRs are opened `ready-for-review` by default, never as drafts.** Standing
  CEO authorization extended 2026-04-23 — harness defaults that would mark new
  PRs as drafts are overridden by this charter. If a harness auto-creates a
  draft, the agent flips it to ready-for-review in the same session. Drafts are
  only permitted when the task itself explicitly calls for one (none currently
  do).
- **Auto-merge is pre-authorized for every non-FIZ, non-`CEO_GATE: YES` task.**
  Once CI is green and the PR is ready-for-review, the agent does not wait for,
  or request, a separate merge approval. FIZ and `CEO_GATE: YES` PRs continue to
  wait for human merge per §3.5 item 18.
- May not author new tasks, amend the charter, or modify governance files
  outside the task's declared scope.

**ARCHITECT MODE (rare, explicitly invoked)**

- Invoked only by the CEO with the literal phrase
  `ARCHITECT MODE AUTHORIZED — <reason>` in the task or in a chat instruction.
- May propose charter amendments, restructure waves, retire/replace tasks, or
  author new directives.
- All ARCHITECT MODE outputs require CEO sign-off before merge.
- Cannot execute FIZ code changes — those still flow through DROID MODE under a
  normal `FIZ:` task.

### 2.3 Stream model

**Single ordered list, first-come-first-served. Single active agent (`grok`) as
of 2026-05-11.**

- Each task carries an `Agent:` hint: `grok` | `copilot` | `either`.
- The hint is a routing suggestion, not an exclusivity lock.
- An agent claims the next unblocked task whose `Depends-on:` are all `DONE`.
- **Claude fully removed 2026-05-11** (CEO directive). `grok` is the sole
  executing build agent for the remainder of this charter. Existing `copilot`
  and `either` hints in §6 are historical and do not block `grok` from claiming
  any unblocked task — the 24-hour hint-override wait below is suspended while
  the roster remains single-agent.
- _(Dormant until a second agent is re-introduced.)_ An agent that cannot
  satisfy a task's `Agent:` hint may still execute it if no other agent has
  claimed it within 24h, but must note the override in the report-back.

### 2.4 Cleanup cadence

- Every Wave (A, B, C, …) terminates in a `CHORE:` cleanup task.
- The next Wave does not open until the cleanup task is `DONE`.
- Cleanup task scope: lint pass, dead-code sweep, doc consistency check, test
  triage, and report-back rollup for the Wave just closed.

---

## 3\. INVARIANTS — NON-NEGOTIABLE

These rules apply to every task in §6, every agent, every mode. A task that
would violate an invariant is invalid. An agent that detects a conflict
HARD_STOPs and reports.

### 3.1 Financial integrity (FIZ)

1. **Append-only ledger.** `LedgerService` exposes no `update` or `delete`.
   Corrections are reversal entries with `correlation_id` linking the original.
2. **All point movement through LedgerService.** No direct `Wallet.balance`
   mutations. Wallet balances are projections, not authoritative.
3. **Idempotency required on all financial operations.** Every credit, deduct,
   redemption, expiration, escrow hold/release accepts and persists an
   `idempotency_key`. Duplicate keys return the prior result, never re-apply.
4. **`correlation_id` and `reason_code` on every ledger entry.** No exceptions.
5. **No hardcoded balance values in production code paths.** No
   `previousBalance = 100`, no `balance = 1000`, no test fixtures leaking into
   `src/`. CI guard enforces (Task B-003).
6. **FIZ commit format — 4 lines exactly:** FIZ: \<subject\> REASON: \<why\>
   IMPACT: \<what changes financially\> CORRELATION_ID: \<id\>

7. **No backdoors, master passwords, settlement bypasses, or unauthorized
   adjustment paths.** Ever. Under any framing.

### 3.2 Data integrity

8. **Tenant isolation by default.** Every query touching a tenant-scoped model
   includes `tenant_id` in its filter. CI guard enforces (Task B-005).
9. **Optimistic locking on Wallet writes.** Version conflicts retry up to 3x,
   then fail with `WALLET_CONTENTION` reason code.
10. **PointLot is append-only.** Lots are created at accrual, marked spent or
    expired with timestamps, never edited or deleted.

### 3.3 PII & secrets

11. **No PII in logs.** No emails, phone numbers, real names, or tokens in
    structured logs or stdout.
12. **No secrets in repo.** `.env.example` only. CI secret-scan enforced.
13. **No financial account numbers, credit cards, or routing numbers ever
    handled by RRR.** RRR is a points engine, not a payment processor.

### 3.4 Naming & canon

14. **Canonical merchant name: `ChatNow.Zone`.** Never `XXXChatNow.com` or
    legacy variants. Phase 1 merchants: `RedRoomPleasures`, `Cyrano`. Phase 2:
    `ChatNow.Zone`.
15. **Slot machine is retired (D1).** No re-introduction. Existing seed data
    purged. Any task proposing slot mechanics is invalid.
16. **Diamond Concierge zero-earn (D3).** No accrual on Diamond Concierge
    transactions; redemption permitted per tier rules.

### 3.5 Governance

17. **Commit prefix enum is fixed:**
    `FIZ | DB | API | SVC | INFRA | UI | GOV | TEST | CHORE`. No `feat`, `fix`,
    `docs`, `refactor`. Source of truth: `docs/DOMAIN_GLOSSARY.md`.
18. **Auto-merge policy:**
    - `FIZ: YES` → no auto-merge, human review required.
    - All other → auto-merge ON when CI green.
19. **Idempotent bootstrap principle.** If a file or folder already exists,
    acknowledge and skip. Never recreate.
20. **`STATUS: queued` is the only intake state.** `CEO_GATE` controls
    auto-merge, not status flow.

---

## 4\. CEO DECISIONS IN FORCE (locked, do not relitigate)

| ID  | Decision                                                                                 |
| :-- | :--------------------------------------------------------------------------------------- |
| D1  | Slot machine retired                                                                     |
| D2  | ChatNow.Zone canonical merchant name                                                     |
| D3  | Diamond Concierge zero earn                                                              |
| D4  | Room-Heat Inferno Bonus configurable via required `inferno_multiplier` on EarnRateConfig |
| D5  | GGS deferred — webhook-receive endpoints only                                            |
| B1  | `inferno_multiplier` required, no default                                                |
| B2  | Dual-tier model — `merchant_tier` (launch) \+ `rrr_member_tier` (future, nullable)       |
| B3  | Phase 1 merchants: RedRoomPleasures \+ Cyrano. Phase 2: ChatNow.Zone                     |
| B4  | Cross-merchant rate 1:1 default via `MerchantPairConfig`                                 |
| B5  | Tier caps placeholders: PLATINUM 50 / GOLD 35 / SILVER 20 / MEMBER 10 / GUEST 5          |

---

## 5\. CURRENT BUILD STATE (verified at charter open, 2026-04-21)

**Note:** This section is the ONLY live build-state record. The stale section in
`CLAUDE.md` is superseded by this charter and `CLAUDE.md` is archived under Task
A-001.

### 5.1 Merged on `main` (verified per Phase 1 assessment)

- Wallet, ModelWallet, EscrowItem, LedgerEntry, Idempotency models
- PointLot model (RRR-P1-001, PR \#218)
- Five Config models — ValuationConfig, EarnRateConfig, TierCapConfig,
  MicroTopupConfig, SpendOrderConfig (RRR-P1-CFG, PR \#226)
- LedgerService (append-only)
- WalletService (partial — optimistic-lock posture flagged in §7 debt list)
- EscrowService
- PointAccrualService, PointRedemptionService, PointExpirationService (partial —
  no config wiring)
- WalletController real-balance wiring (RRR-P0-001)
- Idempotency on credit/deduct (RRR-P0-002)
- Repo-wide rename XXXChatNow.com → ChatNow.Zone (RRR-P1-006)
- Slot machine \+ seed data removed (RRR-P1-007)
- PROGRAM_CONTROL scaffolding \+ four CI workflows (RRR-BOOTSTRAP-001 /
  RRR-GOV-001)
- 9 report-backs filed under `PROGRAM_CONTROL/REPORT_BACK/`

### 5.2 Known-missing (drives §6 task list)

- `Tenant`, `Merchant`, `LoyaltyAccount`, `IdentityLink`, `MerchantPairConfig`
  models
- Service-to-config wiring (accrual ↔ EarnRateConfig; redemption ↔ TierCapConfig
  \+ SpendOrderConfig; expiration ↔ SpendOrderConfig)
- Auth / authz / tenant-isolation middleware
- Webhook receive (D5 GGS-ready) \+ emit infrastructure
- Reconciliation job, settlement service, tier evaluation service, fraud signal
  service
- Idempotency coverage beyond credit/deduct (extend to redemption, expiration,
  escrow)
- CI guard against hardcoded-balance regression
- CI guard against missing tenant_id scope
- LedgerService invariant tests (double-entry sum, sequence gap detection)

### 5.3 Carry-forward concerns

- 8 pre-existing test failures (triaged in Wave B cleanup, Task B-CLEAN)
- Package-manager contradiction (resolved in Task A-002, npm wins)

---

## 6\. ACTIVE TASK STREAM

**Conventions:**

- Tasks are claimed first-come-first-served once their `Depends-on:` are all
  `DONE`.
- `Agent:` is a hint, not a lock. Either agent may execute `either` tasks.
- `CEO_GATE: YES` tasks merge only via CEO manual click.
- `FIZ: YES` tasks require human review, no auto-merge.
- On merge: amend `Status:` here AND write `DONE/RRR-GOV-002-<id>-DONE.md`.

---

### WAVE A — Governance & Foundation Hygiene

Goal: clean the governance surface, resolve known contradictions, install the
gate tracker. No `src/` code changes in this wave.

---

#### Task A-001 — Archive CLAUDE.md

- **Status:** DONE
- **Agent:** either
- **Type:** GOV
- **CEO_GATE:** NO
- **FIZ:** NO
- **Depends-on:** (none — first task)
- **Scope:**
  - Move `CLAUDE.md` → `archive/governance/CLAUDE_2026-04-21.md`
  - Create `archive/` and `archive/governance/` if absent (idempotent)
  - Add `archive/README.md` declaring archive read-only invariant
  - Update `.github/copilot-instructions.md` to remove all references to
    `CLAUDE.md` and replace with reference to this charter at
    `PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md`
- **Out of scope:** any other doc changes, any `src/` changes
- **Acceptance:**
  - `git ls-files CLAUDE.md` → empty
  - `git ls-files archive/governance/CLAUDE_2026-04-21.md` → present
  - `grep -r "CLAUDE.md" .github/` → no results
  - `grep -r "RRR-GOV-002" .github/copilot-instructions.md` → at least one match
- **Commit format:**
  `GOV: archive CLAUDE.md, redirect agents to RRR-GOV-002 — RRR-GOV-002-A001`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A001-report.md`
- **Merge SHA:** 954dec932c3ba95f6ca05d0dc1cc2a5ce8a7dba5
- **DONE record:** RRR-GOV-002-A001-DONE.md

---

#### Task A-002 — Resolve package-manager contradiction (npm)

- **Status:** DONE
- **Agent:** either
- **Type:** CHORE
- **CEO_GATE:** NO
- **FIZ:** NO
- **Depends-on:** A-001
- **Scope:**
  - Remove `"packageManager": "yarn@4.9.1"` from `package.json`
  - Remove `engines.yarn` field from `package.json`
  - Verify `engines.node` and `engines.npm` (if present) remain
  - Run `npm install` to confirm lockfile compatibility
- **Out of scope:** changing any dependency versions, touching CI workflows
  (already npm-correct per Phase 1\)
- **Acceptance:**
  - `jq '.packageManager' package.json` → `null`
  - `jq '.engines.yarn' package.json` → `null`
  - `npm install` runs clean, no lockfile changes beyond timestamp
- **Commit format:**
  `CHORE: remove vestigial yarn fields, lock to npm — RRR-GOV-002-A002`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A002-report.md`
- **Merge SHA:** a408653418e04831d72596bf5b3cc1cc12c704cf
- **DONE record:** RRR-GOV-002-A002-DONE.md

---

#### Task A-003 — Create GOV-GATE-TRACKER.md

- **Status:** DONE
- **Agent:** copilot
- **Type:** GOV
- **CEO_GATE:** NO
- **FIZ:** NO
- **Depends-on:** A-001
- **Scope:**
  - Create `PROGRAM_CONTROL/GOV-GATE-TRACKER.md`
  - Schema: one row per `CEO_GATE: YES` directive, columns:
    `Directive ID | Status | PR # | Opened | Merged | Notes`
  - Pre-populate with: RRR-GOV-002 (this charter) and RRR-GOV-002-A001
  - Header section explains the tracker's role: single pane for CEO to see every
    PR awaiting manual merge
- **Out of scope:** historical backfill of pre-charter CEO_GATE merges
- **Acceptance:**
  - File exists, parseable as Markdown table
  - Both seed rows present
- **Commit format:**
  `GOV: install GOV-GATE-TRACKER for CEO_GATE visibility — RRR-GOV-002-A003`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A003-report.md`
- **Merge SHA:** e71ef5bec742674628c003d70d9f31e9fc29f8f7
- **DONE record:** RRR-GOV-002-A003-DONE.md

---

#### Task A-004 — Refresh REQUIREMENTS_MASTER.md stale statuses

- **Status:** DONE
- **Agent:** claude-code
- **Type:** GOV
- **CEO_GATE:** NO
- **FIZ:** NO
- **Depends-on:** A-001
- **Scope:**
  - Open `docs/REQUIREMENTS_MASTER.md`
  - For each row referencing PointLot, the five Config models, RRR-P1-006,
    RRR-P1-007: update Status column to `MERGED` with PR/commit reference per
    Phase 1 assessment §7 item 4
  - Add a `Last verified:` footer with date and source (Phase 1 assessment)
- **Out of scope:** rewriting requirements text; restructuring the doc; adding
  new requirement rows
- **Acceptance:**
  - `grep -E "Missing|IN_PROGRESS" docs/REQUIREMENTS_MASTER.md` for the listed
    items → no matches
  - Footer present
- **Commit format:**
  `GOV: refresh REQUIREMENTS_MASTER stale P1 statuses — RRR-GOV-002-A004`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A004-report.md`
- **Merge SHA:** d9bd6de517351fc2984c26918e676a6fd8bd618b
- **DONE record:** RRR-GOV-002-A004-DONE.md

---

#### Task A-005 — Harden auto-merge.yml against FIZ and CEO_GATE labels

- **Status:** DONE
- **Agent:** copilot
- **Type:** INFRA
- **CEO_GATE:** NO
- **FIZ:** NO
- **Depends-on:** A-003
- **Scope:**
  - Audit `.github/workflows/auto-merge.yml`
  - Add explicit skip conditions for PRs labeled `fiz` or `ceo-gate`
  - Document the label-driven gating in the workflow's top-of-file comment
  - Add a workflow-dispatch test path that does a dry-run on a sample PR
- **Out of scope:** adding new label-driven workflows beyond the skip
- **Acceptance:**
  - Workflow file contains explicit `if:` clauses excluding both labels
  - Sample dry-run on a labeled PR confirms skip
- **Commit format:**
  `INFRA: auto-merge skips fiz and ceo-gate labels — RRR-GOV-002-A005`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A005-report.md`
- **Merge SHA:** 4813eb89a481372e4a3422ddbc236a396823d1f3 (PR \#238, closure —
  see DONE record for note on parallel PR \#237 `506137a` by copilot)
- **DONE record:** RRR-GOV-002-A005-DONE.md

---

#### Task A-CLEAN — Wave A cleanup

- **Status:** QUEUED
- **Agent:** either
- **Type:** CHORE
- **CEO_GATE:** NO
- **FIZ:** NO
- **Depends-on:** A-001, A-002, A-003, A-004, A-005
- **Scope:**
  - Run `npm run lint` — fix any new violations introduced in Wave A
  - Verify all five Wave A report-backs exist and are non-empty
  - Update §5 of this charter (Current Build State) to reflect Wave A merges
  - Update GOV-GATE-TRACKER for any A-tasks that hit `CEO_GATE: YES`
  - Confirm `grep -ri "CLAUDE.md" docs/ .github/ PROGRAM_CONTROL/` → only
    matches in `archive/` or `RRR-GOV-002.md` itself
- **Out of scope:** opening Wave B work
- **Acceptance:** all checks above pass; report-back filed
- **Commit format:**
  `CHORE: Wave A cleanup and charter sync — RRR-GOV-002-A-CLEAN`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A-CLEAN-report.md`

---

### WAVE B — Identity, Tenancy, Configuration Wiring

Goal: install the missing identity/tenancy data layer, then wire the existing
service layer to the five Config models. This wave is FIZ-adjacent; several
tasks carry `FIZ: YES` because they touch the financial code paths.

---

#### Task B-001 — Tenant \+ Merchant models

- **Status:** DONE
- **Agent:** copilot
- **Type:** DB
- **CEO_GATE:** NO
- **FIZ:** NO
- **Depends-on:** A-CLEAN
- **Scope:**
  - Create `src/db/models/Tenant.ts` and `src/db/models/Merchant.ts`
  - Tenant fields: `_id`, `slug`, `name`, `created_at`, `status`
    (`active`/`suspended`)
  - Merchant fields: `_id`, `tenant_id` (ref Tenant), `slug`, `name`,
    `merchant_tier` (B2 — `PLATINUM|GOLD|SILVER|MEMBER|GUEST`), `phase` (`1` or
    `2` per B3), `status`
  - Indexes: Tenant unique on `slug`; Merchant unique on `(tenant_id, slug)`
  - Mongoose schemas with TypeScript strict types
  - Unit tests covering create / unique constraint / index lookup
- **Out of scope:** any controller, service, or seed work
- **Acceptance:**
  - Models compile under `tsc --noEmit`
  - Tests pass with new tests added
  - 80% coverage on new files
- **Commit format:**
  `DB: Tenant + Merchant models with phase and tier — RRR-GOV-002-B001`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-B001-report.md`
- **Merge SHA:** 35b78b7d9ed2f193be294c265779b8bc1c59156c
- **DONE record:** RRR-GOV-002-B001-DONE.md

---

#### Task B-002 — LoyaltyAccount \+ IdentityLink models

- **Status:** DONE
- **Agent:** copilot
- **Type:** DB
- **CEO_GATE:** NO
- **FIZ:** NO
- **Depends-on:** B-001
- **Scope:**
  - `src/db/models/LoyaltyAccount.ts`: `_id`, `tenant_id`, `external_user_id`,
    `rrr_member_tier` (nullable per B2), `created_at`, `status`
  - `src/db/models/IdentityLink.ts`: `_id`, `loyalty_account_id`, `merchant_id`,
    `external_account_ref`, `created_at`, `status`
  - Indexes: LoyaltyAccount unique on `(tenant_id, external_user_id)`;
    IdentityLink unique on `(merchant_id, external_account_ref)`
  - Unit tests
- **Out of scope:** Wallet linkage refactor (separate task in Wave C)
- **Acceptance:** as B-001
- **Commit format:**
  `DB: LoyaltyAccount + IdentityLink models — RRR-GOV-002-B002`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-B002-report.md`
- **Merge SHA:** 35b78b7d9ed2f193be294c265779b8bc1c59156c
- **DONE record:** RRR-GOV-002-B002-DONE.md

---

#### Task B-003 — MerchantPairConfig model (B4)

- **Status:** QUEUED
- **Agent:** copilot
- **Type:** DB
- **CEO_GATE:** NO
- **FIZ:** NO
- **Depends-on:** B-001
- **Scope:**
  - `src/db/models/MerchantPairConfig.ts`: `_id`, `tenant_id`,
    `from_merchant_id`, `to_merchant_id`, `exchange_rate` (Decimal128 or
    string-backed numeric — match existing Config model convention),
    `effective_from`, `effective_to` (nullable), `created_at`
  - Default rate 1:1 seeded only via explicit operator action, never
    auto-created
  - Unique partial index on
    `(tenant_id, from_merchant_id, to_merchant_id, effective_from)` where
    `effective_to IS NULL`
  - Unit tests covering insert, range overlap rejection, and 1:1 default lookup
- **Out of scope:** the cross-merchant exchange service that consumes this
- **Acceptance:** as B-001
- **Commit format:**
  `DB: MerchantPairConfig with effective-dating — RRR-GOV-002-B003`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-B003-report.md`

---

#### Task B-004 — CI guard: no hardcoded balances

- **Status:** QUEUED
- **Agent:** copilot
- **Type:** TEST
- **CEO_GATE:** NO
- **FIZ:** YES
- **Depends-on:** A-CLEAN
- **Scope:**
  - Add a Jest test or a standalone CI script under `scripts/ci/` that greps
    `src/` for the patterns:
    - `previousBalance\s*=\s*\d`
    - `balance\s*=\s*\d{2,}`
    - any literal numeric balance assignment outside `__tests__/` and
      `*.spec.ts`
  - Fail the CI job on any match with a clear error message naming the file:line
  - Wire into `.github/workflows/ci.yml` as a required step
- **Out of scope:** fixing existing violations (none expected per Phase 1 §E1
  read; if any surface, file follow-up FIZ task)
- **Acceptance:**
  - Guard fires on a deliberately-introduced bad fixture (test the test)
  - CI green on current `main`
- **Commit format:** Per FIZ format §3.1.6 (4-line)
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-B004-report.md`

---

#### Task B-005 — CI guard: tenant_id scope on queries

- **Status:** QUEUED
- **Agent:** copilot
- **Type:** TEST
- **CEO_GATE:** NO
- **FIZ:** NO
- **Depends-on:** B-001
- **Scope:**
  - Add a Jest test or AST-based script under `scripts/ci/` that finds every
    `Model.find(`, `Model.findOne(`, `Model.updateOne(`, `Model.updateMany(`,
    `Model.deleteOne(` call in `src/services/`, `src/wallets/`, `src/ledger/`
  - Fail if the filter object does not include `tenant_id` as a key
  - Allowlist file `scripts/ci/tenant-scope-allowlist.txt` for justified
    exceptions (e.g. system-admin queries) — entries must include a comment
- **Out of scope:** fixing existing violations (will surface as follow-up tasks)
- **Acceptance:**
  - Script runs in CI; allowlist mechanism documented
  - Initial run produces a baseline list of current violations, attached to the
    report-back as a follow-up backlog
- **Commit format:**
  `TEST: CI guard for tenant_id query scope — RRR-GOV-002-B005`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-B005-report.md`

---

#### Task B-006 — Extend IdempotencyService coverage

- **Status:** QUEUED
- **Agent:** grok
- **Type:** FIZ
- **CEO_GATE:** NO
- **FIZ:** YES
- **Depends-on:** A-CLEAN
- **Scope:**
  - Extend the existing IdempotencyService usage from credit/deduct (RRR-P0-002)
    to: redemption flow, expiration job, escrow hold, escrow release
  - Each call site must accept and persist `idempotency_key`
  - Duplicate keys return prior result with same `correlation_id`
  - New tests: replay each flow with same key, assert single ledger entry
- **Out of scope:** refactoring IdempotencyService internals; adding TTL policy
- **Acceptance:**
  - All four flows covered by replay tests
  - Coverage on touched files ≥ 80%
- **Commit format:** Per FIZ 4-line format
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-B006-report.md`

---

#### Task B-007 — Reconciliation job

- **Status:** QUEUED
- **Agent:** grok
- **Type:** FIZ
- **CEO_GATE:** NO
- **FIZ:** YES
- **Depends-on:** B-006
- **Scope:**
  - New service `src/services/ReconciliationService.ts`
  - For each Wallet: assert `Wallet.balance == sum(active PointLot.remaining)`
    AND `Wallet.balance == sum(LedgerEntry.delta)`
  - Job entry point: scriptable via `npm run reconcile -- --tenant <id>`
  - Admin endpoint `POST /admin/reconcile` (auth-gated; auth itself is Wave C,
    so endpoint shipped behind a feature flag here)
  - On mismatch: emit `RECON_MISMATCH` event with wallet id, expected, actual,
    delta — never auto-correct
- **Out of scope:** automatic correction; alerting integration
- **Acceptance:**
  - Reconciliation passes on a clean seeded fixture
  - Reconciliation fails loudly on a deliberately-corrupted fixture
- **Commit format:** Per FIZ 4-line format
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-B007-report.md`

---

#### Task B-008 — LedgerService invariant tests

- **Status:** QUEUED
- **Agent:** copilot
- **Type:** TEST
- **CEO_GATE:** NO
- **FIZ:** YES
- **Depends-on:** A-CLEAN
- **Scope:**
  - New test file `src/ledger/__tests__/ledger.invariants.spec.ts`
  - Assertions:
    - LedgerService exposes no `update` or `delete` method (reflection check)
    - Sequence numbers are monotonic per `correlation_id` chain
    - Sum of deltas per wallet matches Wallet.balance projection
    - Every entry has non-null `correlation_id` and `reason_code`
  - All assertions must pass on current `main`
- **Out of scope:** modifying LedgerService
- **Acceptance:** new test file green, no LedgerService changes
- **Commit format:** `TEST: LedgerService invariant suite — RRR-GOV-002-B008`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-B008-report.md`

---

#### Task B-CLEAN — Wave B cleanup

- **Status:** QUEUED
- **Agent:** either
- **Type:** CHORE
- **CEO_GATE:** NO
- **FIZ:** NO
- **Depends-on:** B-001, B-002, B-003, B-004, B-005, B-006, B-007, B-008
- **Scope:**
  - Lint pass \+ dead-code sweep
  - Triage the 8 pre-existing test failures: per-failure status of
    `fixed | still-failing-rationale | new-task-filed`
  - Update charter §5 with Wave B merges
  - GOV-GATE-TRACKER updated for B-006, B-007 (and any other CEO_GATE B-tasks)
  - Confirm npm test pass count increased or held steady (no regression)
- **Out of scope:** opening Wave C work
- **Acceptance:** triage doc filed, no lint regressions, charter §5 current
- **Commit format:**
  `CHORE: Wave B cleanup, test triage, charter sync — RRR-GOV-002-B-CLEAN`
- **Report-back:** `PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-B-CLEAN-report.md`

---

### WAVE C — and beyond

Wave C scope is intentionally **not fully drafted at charter open**. It will be
appended to this charter (in-place amendment) after Wave B closes, scoped
against the actual state of the repo at that point. Provisional Wave C themes,
in priority order:

1. Service ↔ Config wiring (PointAccrual ↔ EarnRateConfig; PointRedemption ↔
   TierCapConfig \+ SpendOrderConfig; PointExpiration ↔ SpendOrderConfig)
2. Auth / authz / tenant-isolation middleware (replaces the Wave B feature flag
   on the reconcile endpoint)
3. Webhook receive (D5 GGS-ready) \+ emit infrastructure
4. Cross-merchant exchange service (consumes B-003 MerchantPairConfig)
5. Tier evaluation service
6. Settlement service
7. Fraud signal service
8. WAVE C cleanup

CEO authorization required to expand Wave C inline. Until then, agents do not
claim Wave C work.

---

## 7\. KNOWN DEBT NOT YET TASKED

The following items from the Thread 2 tech debt assessment are acknowledged but
not yet scheduled. They will be folded into Wave C or later:

- WalletService optimistic-lock posture (currently flagged partial; needs audit
  \+ retry-policy doc)
- Webhook signature verification utility
- Observability: structured logger choice (pino vs winston) and instrumentation
- OpenAPI spec freshness check in CI
- Admin surfaces (rate adjust UI, recon dashboard)
- Reservation flow end-to-end test
- Activity-feed rate-limit hardening

If priorities shift, the CEO promotes any of these into the active stream via
charter amendment.

---

## 8\. WHAT'S OUT OF SCOPE FOR THIS CHARTER

- Authoring or modifying any directive outside `RRR-GOV-002-*` task IDs
- Touching `src/` outside the scope explicitly named per task
- Creating new `PROGRAM_CONTROL/DIRECTIVES/QUEUE/` files (this charter is the
  active queue; new standalone directives bypass it and break the model)
- Reintroducing CLAUDE.md, slot machine, XXXChatNow.com, or any decision marked
  retired in §4
- Auto-correcting reconciliation mismatches
- Building any settlement / payout path without explicit CEO directive

---

## 9\. AMENDMENT RULES

The charter is amended (not rewritten) when:

1. A task closes — `Status:` line updated, merge SHA appended, DONE backref
   added.
2. A new wave opens — appended below the prior wave, CEO sign-off required.
3. An invariant changes — CEO authorship required, prior version preserved in
   §10 changelog with date and rationale.
4. ARCHITECT MODE proposes restructuring — CEO sign-off before merge.

Any agent or chat instance that attempts to amend this charter without following
these rules HARD_STOPs.

---

## 10\. CHANGELOG

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Author                                                                                                                                                                                                                                                                                                                                         | Rationale                                                                                                                                                                                                      |
| :--------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-21 | Charter opened. Supersedes CLAUDE.md (archived). Absorbs Phase 2 §2/§5A/§5E content. Phase 2 Q2/Q4/Q5 ruled redundant by CEO. Stream model: single list, agent hint, FCFS. Cleanup cadence: per-Wave. Package manager: npm (Q3 resolved).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Architecture Coordinator (Claude Chat T3), per CEO direction                                                                                                                                                                                                                                                                                   | Consolidate governance \+ work into one source of truth; eliminate document drift; preserve directive-lifecycle automation that already works                                                                  |
| 2026-04-21 | §2.2 amended: DROID MODE granted **standing permission to open GitHub pull requests** against `main` for any validly claimed task (no per-task authorization required; merge gating via labels still applies). §2.2 roster line tightened from "Either Copilot or Claude Code" to "`claude-code`" to match §2.3. §2.3 amended: **Copilot retired from this workflow** by CEO directive; `claude-code` is now the sole executing agent. The 24h hint-override wait is suspended while the roster is single-agent (dormant clause retained for future re-introduction of a second agent).                                                                                                                                                                                                                                     | Architecture Coordinator (Claude Chat, ARCHITECT MODE — CEO authorization in-session 2026-04-21: _"You can certainly open PRs as needed, if you want to overwrite and make a corrected directives file that includes that permission from me please do so"_ and _"We have retired copilot on GitHub from this workflow it will be you alone"_) | Codify the CEO's in-session authorizations so future agent sessions can execute against the charter without re-asking; align the charter text with the operational reality that Copilot is no longer available |
| 2026-04-23 | Charter restored to `PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md` (previously archived under PR #252 / commit 8064abb when `RRR-WORK-001` was briefly ratified as successor — CEO reversed that retirement 2026-04-23). §2.2 amended with two additional DROID MODE bullets: (a) PRs are opened `ready-for-review` by default, never as drafts — overriding any harness default that would create drafts; (b) auto-merge is pre-authorized for every non-FIZ, non-`CEO_GATE: YES` task on CI green, with no separate per-PR merge approval required. These codify the CEO's 2026-04-23 statement _"you should be fully enabled to create PRs as needed and merge them as required."_ Placeholder `PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-WORK-001.md` removed to restore §8's "charter is the sole queue file" invariant. | Architecture Coordinator (Claude Chat, ARCHITECT MODE — CEO authorization in-session 2026-04-23: _"Anything on your RRR-GOV-002.md file Or resulting from it is already approved, and you should be fully enabled to create PRs as needed and merge them as required. Can we please make this change hardened in directives"_)                 | Stop harness-default draft state from blocking auto-merge; make the PR/merge pre-approval durable across sessions so no future agent re-asks                                                                   |

---

## 11\. DONE-RECORD TEMPLATE

When a task in §6 merges, the executing agent (or the operator) writes a file at
`PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-GOV-002-<task-id>-DONE.md` using this
template:

\# RRR-GOV-002-\<task-id\> — DONE

\*\*Charter:\*\* RRR-GOV-002 (persistent, see
PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md)

\*\*Task ID:\*\* RRR-GOV-002-\<task-id\>

\*\*Title:\*\* \<task title from charter\>

\*\*Merged:\*\* YYYY-MM-DD

\*\*Merge commit:\*\* \<SHA\>

\*\*PR:\*\* \#\<num\>

\*\*Agent executed:\*\* copilot | claude-code

\*\*Agent hint matched:\*\* yes | no (override rationale: …)

\*\*CEO_GATE:\*\* YES | NO — merged manually by CEO: yes | n/a

\*\*FIZ:\*\* YES | NO

\#\# What shipped

\<3–6 sentences, concrete\>

\#\# Acceptance verified

\- \[ \] \<each acceptance bullet from charter, ticked\>

\#\# Follow-ups filed

\- \<links to any new tasks queued as a result, or "none"\>

\#\# Report-back

PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-\<task-id\>-report.md

The agent then amends §6 of the charter:

- `Status: QUEUED` → `Status: DONE`
- Append `**Merge SHA:** <sha>` and `**DONE record:** RRR-GOV-002-<id>-DONE.md`

---

## 12\. CHARTER RATIFICATION

This charter takes effect when merged to `main` via the `CEO_GATE: YES` PR
opened on branch `claude/adapt-governance-pattern-J9D4I`.

PR title: `GOV: install RRR-GOV-002 charter, retire CLAUDE.md — RRR-GOV-002`
Auto-merge: NO (CEO_GATE: YES) Reviewer: Kevin B. Hartley (CEO) On merge: Wave A
opens; agents may begin claiming A-001.

— End of charter —
