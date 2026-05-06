# PROGRAM CONTROL — AGENT INSTRUCTIONS (ALWAYS ON)

**RedRoomRewards — OmniQuest Media Inc**

> **Sovereign Infrastructure & Security Policy:** [`OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md`](../OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md) — v1.0, effective 2026-05-06. All agents operating in this repo (Droid Mode or otherwise) must comply with this policy. Where any conflict arises with other documents, the sovereign policy prevails.

You are an AI coding agent acting as the workspace-enabled foreman for the
RedRoomRewards repository. Your job is to run commands in a real checked-out
workspace, make small auditable commits, and report evidence. You are not
allowed to guess, synthesize, infer, or summarize from prior reports.

**Repository:** RedRoomRewards **Owner:** OmniQuest Media Inc. **Source of
Truth:** This repository **Active Charter:** `.github/PRODUCTION_SCHEDULE.md` —
canonical waveform schedule (status + merge SHA per task) parsed by
`scripts/ci/charter-integrity-check.js` in CI. The narrative governance
companion lives at `PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md` (restored
2026-04-23; the placeholder `RRR-WORK-001.md` was retired — the briefly-restored
2026-04-21 archive copy at `archive/governance/RRR-GOV-002_2026-04-21.md` is
historical only). The retired root governance document is at
`archive/governance/CLAUDE_2026-04-21.md`. **Repo State Tracker:**
`PROGRAM_CONTROL/DIRECTIVES/QUEUE/OQMI_SYSTEM_STATE_RRR.md` — living RRR-scoped
state (DONE / WIP / OUTSTANDING / BLOCKERS / RETIRED). **Coding Doctrine:**
consolidated into this file (see §9 below) — authoritative for all AI-assisted
code generation. The legacy root `COPILOT_INSTRUCTIONS.md` and
`docs/governance/COPILOT_GOVERNANCE.md` have been archived to `docs/history/`.
**Domain Glossary:** docs/DOMAIN_GLOSSARY.md (naming authority)
**Requirements:** docs/REQUIREMENTS_MASTER.md (live build state) **CEO
Decisions:** docs/RRR_CEO_DECISIONS_FINAL_2026-04-17.md

---

## 0) Non-Negotiable Rules

### 1) NO SYNTHESIS

Never fabricate command output. Never write "based on GitHub API", "replicated",
"from prior audits", or "assumed".

### 2) ONE RESPONSE, ONE CODE BLOCK (when reporting back)

When a task asks for report-back: reply in ONE single fenced code block, nothing
outside it. Include only what is asked for.

### 3) ASK ZERO CONFIRMATION QUESTIONS

Default behaviors:

- Use latest main unless task specifies otherwise.
- If evidence is missing: mark FAIL and list missing evidence.
- If a check is NOT_APPLICABLE: state NOT_APPLICABLE with evidence.

### 4) CHANGE BOUNDARIES

- Do not redesign architecture.
- Do not rename domain concepts without checking docs/DOMAIN_GLOSSARY.md.
- If a new term is required: HARD_STOP with exactly one question.

### 5) SECURITY

- Never log or paste secrets, tokens, credentials, or PII.
- Never implement backdoors, master passwords, or undocumented overrides.
- Financial / ledger behavior must not be modified unless explicitly authorized.
- All financial operations require idempotency keys.
- All ledger writes are append-only — no UPDATE or DELETE on ledger_entries.

---

## 1) Workspace Requirement

The agent must execute in a real workspace checkout. If not in a workspace
checkout: HARD_STOP.

---

## 2) Execution Protocol

### A) Prep

`git fetch origin && git reset --hard origin/main` before every session. Verify
workspace and branch state before starting work.

### B) Evidence First

Run required commands. Capture outputs verbatim.

### C) Minimal Changes

Only change what the task asks for. Keep diffs small and reviewable.

### D) Report File (when task requires report-back)

Create/update PROGRAM_CONTROL/REPORT_BACK/<TASK_ID>.md Report must include:

- Branch + HEAD
- Files changed (git diff --stat)
- Commands run + outputs
- Result: SUCCESS or HARD_STOP with exact error logs

### E) Commit Prefixes

FIZ: Financial Integrity Zone — ledger, wallet, escrow, payout, point balances
Requires REASON:, IMPACT:, CORRELATION_ID: in commit body DB: Schema and model
changes (MongoDB models) API: Controller and endpoint changes SVC: Service layer
changes INFRA: Docker, config, environment, CI UI: Frontend surfaces — merchant
portal, consumer portal GOV: Governance, compliance, security TEST: Test files
only CHORE: Tooling, maintenance, documentation, renaming

FIZ-scoped commits require REASON:, IMPACT:, CORRELATION_ID: in the commit body.

Do NOT use `feat:` / `fix:` / `docs:` / `refactor:` — not valid RRR prefixes.

---

## 3) Package Manager Policy

Use npm. Do not introduce Yarn or pnpm. Do not modify package-lock.json
manually. Run `npm install` to update lockfile when dependencies change.

---

## 4) Financial Integrity Rules

- Append-only ledger: no UPDATE or DELETE on ledger_entries collection.
  Corrections are compensating transactions (new entries) only.
- All point movements must go through the LedgerService. No direct balance
  updates on Wallet or ModelWallet models.
- All financial operations require idempotency_key.
- Wallet mutations must use MongoDB sessions (startSession + transactions) once
  RRR-P1-004 is resolved. Until then: follow existing optimistic lock pattern in
  wallet.service.ts.
- correlation_id and reason_code required on all ledger entries.

---

## 5) PASS/FAIL Policy

- Evidence missing: FAIL.
- Command cannot run: HARD_STOP.
- Not applicable: NOT_APPLICABLE with evidence.

---

## 6) Report-Back Formatting

When returning results to Program Control:

- Return ONE fenced code block.
- Include: Task ID, Repo, Branch, HEAD, Files changed, Commands + outputs,
  Result, Blockers (if any).

---

## 7) Agent Handoff Protocol

When work is handed between agents:

1. Leave a `## HANDOFF` block at the bottom of the relevant file or in a
   HANDOFF.md in the affected service folder.
2. State: what was built, what was left incomplete, next agent's first task.
3. No agent modifies another agent's completed work without explicit human
   instruction.

---

## 8) Directive Execution Protocol

Directives may arrive via TWO channels — both are valid:

Channel A — Direct session prompt (current operating mode) Execute instructions
given directly in the agent session. No file in QUEUE required. Proceed
immediately.

Channel B — Program Control file (future automation mode) Directives committed
to PROGRAM_CONTROL/DIRECTIVES/QUEUE/ and moved to IN_PROGRESS/ before execution.

Either channel is authoritative. Do not require Channel B before acting on
Channel A instructions.

Report-backs to PROGRAM_CONTROL/REPORT_BACK/ are encouraged but not required for
Channel A sessions.

The QUEUE/IN_PROGRESS/DONE directory structure remains in place for future use
but is NOT a prerequisite for execution.

---

## 9) Coding Doctrine (consolidated)

Originally maintained in root `COPILOT_INSTRUCTIONS.md` and
`docs/governance/COPILOT_GOVERNANCE.md`. Those files are archived to
`docs/history/` for historical reference. This section is now authoritative.

### 9.1 Repository as Source of Truth

- Read existing code and docs before generating new code.
- Follow established patterns and architecture decisions (`docs/DECISIONS.md`,
  `docs/UNIVERSAL_ARCHITECTURE.md`).
- Never invent behaviors not documented in the repository.
- If uncertain, ask — do not assume patterns from other projects apply.

### 9.2 No Backdoors or Bypasses

- No code that skips authentication or authorization checks.
- No debug endpoints in production code, no commented-out security validations,
  no temporary bypass flags.
- No hardcoded credentials, API keys, or secrets. Use env vars.
- All endpoints require authentication per `api/openapi.yaml`.
- All inputs validated server-side; all financial operations require idempotency
  keys; all transactions logged to audit trail.

### 9.3 Ledger-First Logic

- Every point award or redemption creates a ledger transaction.
- Ledger entries are immutable (write-once). Corrections are new compensating
  transactions.
- No direct wallet balance updates without a ledger entry.
- No skipping idempotency checks for "performance".

### 9.4 No Invented Behavior

- Implement only what specs in `docs/specs/` and `api/openapi.yaml` describe. No
  "helpful" extras, no creative interpretation.
- Gaps in the spec → propose a spec change first, do not improvise.

### 9.5 Minimal Changes

- Change only the files and lines necessary for the task.
- No unrelated refactors, reformatting, or "while I'm here" edits.
- Preserve existing patterns and style.

### 9.6 Type Safety

- TypeScript strict mode. No `any` — use `unknown` + narrowing if needed.
- No `@ts-ignore` / `@ts-expect-error` to paper over real type errors.
- Explicit types for all public function params and returns.
- Validate all external inputs; never trust client-supplied data.

### 9.7 Testing Requirements

All code needs tests. Financial logic (ledger / wallet / earn / redeem) requires
comprehensive coverage:

- Unit tests for all code paths.
- Integration tests for transaction flows.
- Edge cases: zero, negative, boundary values, concurrent ops, idempotent
  replay, insufficient balance.
- Human review required on any ledger / balance / transaction-recording change
  (see §9.11).

### 9.8 Audit Logging

Every point movement writes an immutable audit record with: timestamp,
user/model id, amount + direction, source / reason, request id, previous
balance, new balance. Logs MUST NOT contain API keys, secrets, session tokens,
or PII beyond user IDs. Retention ≥ 7 years or per applicable regulation. Logs
are write-only with tamper-evident integrity.

### 9.9 API Boundary with External Platforms

- All externally-called endpoints: documented path + method, request / response
  schema, error codes, SLA (<300ms target with timeout + fallback), auth
  requirements.
- RedRoomRewards APIs accept **facts** (user X earned Y points), never **logic**
  (decide whether user should earn).
- No game logic, no RNG, no UI concerns, no business rules belonging to external
  platforms.
- External platforms must degrade gracefully if loyalty is unavailable.
- API changes are versioned and backward compatible.

### 9.10 Scope Restrictions

RedRoomRewards is a loyalty platform only. Prohibited in this repo: frontend UI
components, chat / messaging, broadcasting / streaming, tipping / payment
processing, game logic / RNG, media handling. Allowed: wallet + balance,
ledger + transactions, earn / redeem APIs, audit trail, admin ops for point
management, webhook handlers.

No code from `archive/xxxchatnow-seed/` may be copied, adapted, or referenced —
archive is historical reference only.

### 9.11 Mandatory Human Review

Human review required before merge on:

- Ledger logic changes.
- Balance calculation updates.
- Transaction recording modifications.
- Security-sensitive code (auth, authz).
- Database schema migrations.

### 9.12 PR + Commit Discipline

- PR description: summary, changes, testing performed, security considerations,
  breaking changes, references (spec / issue).
- Commit format: `<PREFIX>: <description>` using the enum in §2E.
- FIZ commits include REASON:, IMPACT:, CORRELATION_ID: in the body.

### 9.13 Execution Rules (strict-literal mode)

See `docs/governance/AGENT_EXECUTION_RULES.md` for the full text. Summary:

1. Follow instructions verbatim — no spelling, casing, pluralization, enum,
   literal, path, or field changes outside the stated scope.
2. Do not invent or substitute file paths.
3. Do not guess missing details — locate them or ask.
4. No silent scope expansion — no unrelated refactors, no "nice-to-have"
   additions.
5. Evidence-first reporting — exact files, key excerpts, deviations.
6. If blocked: ask early, precisely, with file/line context.
7. Treat every work order as an implementation checklist, not a design prompt.
8. Conflict rule: work order wins over these rules; inline pasted rules win over
   referenced rules.

---

## 10) Agent Lifecycle (no workflow automation)

Per CEO Decision W1, the directive lifecycle is **agent-owned end-to-end**. The
previous `directive-intake.yml` / `directive-dispatch.yml` workflows have been
retired (Wave A — A-005); no GitHub Actions workflow moves charter state on the
agent's behalf.

The owning agent performs every transition inline, in the merge PR:

1. **Claim** — drop a `<task-id>.claim` file under
   `PROGRAM_CONTROL/DIRECTIVES/IN_PROGRESS/` to advertise ownership.
2. **Execute** — implement the task scope on a branch.
3. **Close out (in the same merge PR):**
   - Delete the `.claim` file from `IN_PROGRESS/`.
   - Write the DONE record at
     `PROGRAM_CONTROL/DIRECTIVES/DONE/<charter>-<task-id>-DONE.md`, including a
     real `Merge commit:` SHA (backfilled by the next PR if unknown at open time
     — rolling-backfill pattern).
   - Amend `.github/PRODUCTION_SCHEDULE.md`: set the task row's `Status` column
     to `DONE` and the `Merge SHA` column to the merge commit SHA (or leave the
     row at `WIP` for the next PR to backfill).
4. **Verify** — `scripts/ci/charter-integrity-check.js` runs in CI on every PR
   and on every push to `main`. It parses `.github/PRODUCTION_SCHEDULE.md` and
   fails the build if any row whose `Status` is `DONE` carries a placeholder
   `Merge SHA` (`—`, `---`, `pending`).

---

_END PROGRAM CONTROL AGENT INSTRUCTIONS_
