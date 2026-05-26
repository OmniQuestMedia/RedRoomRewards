OQMI GOVERNANCE Document: OQMI_GOVERNANCE.md Authority: OmniQuest Media Inc.
(OQMInc™) Scope: Generic, repo-portable. Drops into every OmniQuest Media Inc.
repository unchanged. Version: v1.0 Effective Date: 2026-04-21 Authority of
Record: Kevin B. Hartley, CEO — OmniQuest Media Inc. Platform Time Standard:
America/Toronto

0. PURPOSE

This document is the standing governance instrument for every OmniQuest Media
Inc. repository. It defines:

The CEO assignment-equals-approval model PR merge policy and the
error-resolution clause Coding agent rules of engagement Non-negotiable code and
data invariants Security posture Advisory-AI boundary Escalation discipline
Version control and audit obligations This document is the top of the
source-of-truth hierarchy for engineering and operational decisions in any repo
it lands in. Where any other repo file conflicts with this document, this
document prevails until amended.

This document is itself governed: see §11 for amendment procedure.

1. CEO ASSIGNMENT-EQUALS-APPROVAL

When the CEO assigns a task to a coding agent (Claude Code, Copilot, Claude in
chat, or any other authorized agent), that assignment IS the approval to
proceed. The agent does NOT pause to request CEO confirmation before executing.

The agent proceeds autonomously until one of the following occurs:

The task is complete and ready for PR. The agent encounters a block it cannot
resolve (see §3 escalation triggers). The agent identifies that completing the
task would violate an invariant in §5 or §6. In cases 2 and 3, the agent
escalates with a single, clear question. The agent does NOT escalate to confirm
decisions the CEO has already implicitly approved by assigning the task.

Never ask "should I do the thing you just told me to do."

2. PR MERGE POLICY

2.1 Default — Auto-merge

PRs auto-merge on green CI. No human review required by default. Agents land
their work on main autonomously when:

All CI checks pass No merge conflicts exist No unresolved errors are present on
the branch (see §2.3) The PR does not touch a Human-Review Category (see §2.2)
2.2 Human-Review Categories (CEO merge required)

The following narrow categories require CEO PR merge regardless of CI state.
These are the only exceptions to auto-merge.

Changes to OQMI_GOVERNANCE.md itself (this document) Schema migrations touching
financial invariants — any migration that adds, alters, or drops a column named
or aliased as balance, tokens, payout, escrow, commission, wallet, ledger_entry,
or any column carrying money-like semantics New compliance constants — additions
or modifications to compliance-governing values (dispute thresholds, age-gate
parameters, retention windows, jurisdictional rule references, regulatory bill
identifiers) Anything not in this list auto-merges. The list is intentionally
narrow. Expansion of this list requires a §11 amendment.

2.3 Error-Resolution Clause

If a PR is mergeable (no conflicts, gates passed) but the branch carries
unresolved errors of any kind — failing tests, lint failures, type errors, build
warnings escalated to errors, broken CI steps that were skipped, dependency
warnings, deprecation notices, or any other diagnostic flagged by tooling — the
merge does NOT auto-land.

The agent that opened the PR (Copilot, Claude Code, or other) MUST first attempt
to resolve the errors autonomously. CEO intervention is the last resort, not the
first.

The agent escalates to CEO only when ALL of the following are true:

The error is outside the agent's resolution capability (e.g., requires a
credential the agent cannot access, requires a product or policy decision,
requires external service action), OR The agent has attempted resolution and the
fix would exceed the original PR's scope (broad refactor required, breaking
change required), OR The agent has attempted resolution at least twice and the
error persists. In any escalation case, the agent posts a single comment on the
PR stating, in this order:

What the error is (exact diagnostic) What the agent attempted (each attempt,
briefly) Why escalation is required (which of the three conditions above
applies) What specific decision or action is needed from CEO Mergeable + clean =
auto-merge. Mergeable + dirty = agent fixes first, escalates only on block.

2.4 Reverts

If an auto-merged PR is later found to have introduced a defect, any agent may
open a revert PR. Revert PRs follow the same auto-merge policy. They are not
Human-Review Category by default unless they touch §2.2.

3. ESCALATION DISCIPLINE

3.1 When to escalate

Escalate to CEO only when one of the following occurs:

§2.3 conditions are met on a PR A task assignment requires interpretation of
intent the agent cannot resolve from context (e.g., two valid implementations
exist with materially different consequences) Executing the task would violate
§5, §6, or §7 invariants A required external resource is unavailable (vendor
outage, missing credential, broken integration) Discovery during the task
reveals the task description was based on incorrect assumptions about the repo
state 3.2 When NOT to escalate

Do not escalate to CEO for:

Confirmation of an already-assigned task ("just to double-check, you want me
to...") Style choices within an established convention Naming decisions covered
by an existing glossary or naming authority file in the repo Decisions where the
agent has sufficient context to choose responsibly Status updates during
long-running work (use commit messages or PR descriptions instead) 3.3
Escalation format

One question. Concrete. Resolvable in one CEO reply. State:

What you were doing What you encountered What specific decision you need What
you will do once the decision is made If a single question would generate more
than three follow-up questions, restructure the work and escalate later when the
right question is clear.

4. CODING AGENT RULES OF ENGAGEMENT

4.1 Agents covered

Any AI agent operating against an OmniQuest Media Inc. repository, including but
not limited to:

Claude Code (CLI, IDE, GitHub Action) GitHub Copilot (chat, agent mode, PR mode)
Claude in chat (anthropic.claude.com or API) Any future agent introduced into
the workflow 4.2 Mode of operation

Agents operate in Droid Mode by default: execute the assigned task as written,
no creative deviation. If the task description appears to require creative
deviation to be executable, that is an escalation per §3.1.

4.3 Prohibited behaviors

Agents must not:

Refactor code outside the scope of the assigned task without explicit
instruction Modify another agent's completed and merged work without explicit
instruction Fabricate command output, test results, or file contents in any
report Skip required tests or CI gates to land work Bypass §2.3 error-resolution
by force-merging Mark a task complete when known errors remain unresolved
Introduce new dependencies or replace package managers without explicit
instruction (see §5.3) 4.4 Required behaviors

Agents must:

Read the repo's existing OQMI_GOVERNANCE.md (this document) before any
non-trivial action Read the repo's OQMI_SYSTEM_STATE.md (if present) to
understand current backlog state before starting new work Read any repo-resident
naming authority file (e.g., docs/DOMAIN_GLOSSARY.md) before introducing new
identifiers Leave a ## HANDOFF block at the bottom of any file or branch left in
an incomplete state, stating: what was built, what was intentionally left
incomplete, and the next agent's first task Use the repo's specified package
manager (see §5.3) Respect commit discipline (see §8) 5. NON-NEGOTIABLE CODE
INVARIANTS

These apply to every OmniQuest Media Inc. repo unless explicitly overridden in
writing in a repo-resident OQMI_GOVERNANCE_OVERRIDES.md file approved by CEO.

5.1 Append-only, deterministic, idempotent

These three properties apply to all financial, audit, and compliance-touching
code:

Append-only: No UPDATE or DELETE on ledger, audit, balance, payout, or
session-record tables. Corrections are offset entries, never modifications.
Deterministic: Given the same inputs, the system must produce the same outputs.
No silent randomness in financial or compliance logic. Use crypto.randomInt()
only for game outcomes, never for financial calculations. Idempotent: Repeated
execution of the same operation must produce the same end state. All money-like
operations require an idempotency key. 5.2 Schema discipline

Every table touching financial, compliance, or audit data must include
correlation_id and reason_code columns No hardcoded financial constants; all
such constants live in a single config file (e.g., governance.config.ts) and are
version-controlled Schema migrations touching §2.2 columns are Human-Review
Category 5.3 Package management

Each repo declares its package manager in its root README.md. Default for
OmniQuest Media Inc. repos is Yarn. Do not introduce npm or pnpm unless the
repo's README explicitly authorizes it. Do not mix package managers in a single
repo.

5.4 Domain separation

UI logic, game logic, and feature logic must never be mixed with financial,
authentication, or ledger logic. Prefer small, composable services with clean
interfaces.

5.5 No backdoors

No master passwords, magic strings, undocumented overrides, debug bypasses, or
hidden admin paths. If an emergency override is required, it must be documented,
role-bound, logged, and require step-up authentication (see §6.4).

6. SECURITY POSTURE

6.1 Secrets

Never log, expose, commit, or transmit:

API keys, tokens, credentials Passwords or password hashes Personally
identifiable information (PII) Payment data (card numbers, CVV, bank account
details) Identity verification documents 6.2 Network isolation

Database and cache services (Postgres, Redis, equivalents) must never be bound
to a public interface. Any violation is an INFRA_SECURITY_VIOLATION and is a
Human-Review Category escalation.

6.3 Least privilege

All access controls follow least-privilege. Role-Based Access Control (RBAC) is
enumerated explicitly per repo. No implicit role inheritance beyond declared
scope.

6.4 Step-up authentication

Required for sensitive operations:

Wallet or balance modification Payment detail changes Account suspension or
freeze Content takedown or deletion Refund override Geo-block modification Any
break-glass action Accepted mechanisms: TOTP (RFC 6238), single-use hashed
backup codes, device-based authentication. SMS is not the primary method.

6.5 Audit logging

All sensitive actions emit an audit event with, at minimum:

event_id, event_type, actor_id, role timestamp_utc and platform_time
(America/Toronto) rule_applied_id, device_fingerprint (where applicable)
hash_prev, hash_current for chain integrity payload_reference (hash, not raw
payload, for sensitive payloads) 7. ADVISORY-AI BOUNDARY

AI systems operating against or within OmniQuest Media Inc. repos and platforms
are advisory-only. AI may:

Summarize data Draft communications Propose escalation pathways Interpret
documented policy Generate, modify, or review code under §1 assignment authority
AI may NOT:

Compute earnings, commissions, payouts, or wallet states (these are
deterministic services) Mutate ledger state directly Authorize refunds Suppress
content Suspend accounts Override enforcement Alter verification status Approve
its own PRs to Human-Review Categories (§2.2) All irreversible user-facing
actions require a human authorization within RBAC boundaries. AI proposals for
irreversible actions must include a snapshot timestamp, a confidence qualifier,
and a "human review required" boundary reminder when surfaced to operators.

8. COMMIT DISCIPLINE

Every commit must be:

Atomic — one logical change per commit Descriptive — commit message states what
changed and why in plain language Scoped — prefixed with the repo's declared
service scope or commit prefix convention (declared in repo root README.md or
CONTRIBUTING.md) Commits touching financial-integrity paths require this
four-line format:

<SCOPE>: <short description> REASON: <why this change is necessary> IMPACT:
<what balances or flows are affected> CORRELATION*ID: <uuid> The
financial-integrity path list is repo-specific and declared in the repo's
OQMI_SYSTEM_STATE.md or equivalent state file. Default OmniQuest Media Inc.
financial paths are: finance/\*\*, any services/*/ledger\_, governance/\*\*, and
any schema migration touching §2.2 columns.

9. AGENT HANDOFF PROTOCOL

When work is handed between agents (within the same repo or across repos):

The handing agent leaves a ## HANDOFF block at the bottom of the relevant file,
or in a HANDOFF.md in the affected service folder, or as a final commit message
in the relevant branch. The block must state: what was built, what was
intentionally left incomplete, and what the next agent's first task is. No agent
modifies another agent's completed work without an explicit instruction from the
CEO. Cross-thread handoffs (chat-to-chat) follow the same discipline: a Thread
N→Thread N+1 handoff document, embedding any standing rules verbatim, lives in
the repo's PROGRAM_CONTROL/HANDOFFS/ directory or equivalent. 10. CONFLICT
RESOLUTION HIERARCHY

When repo files appear to conflict, this is the order of precedence:

OQMI_GOVERNANCE.md (this document) The repo's product/platform Canonical Corpus
(if one exists, e.g., ChatNow.Zone Canonical Corpus for the CNZ repo) The repo's
OQMI_SYSTEM_STATE.md The repo's docs/DOMAIN_GLOSSARY.md (naming authority) The
repo's README.md Per-service README.md or HANDOFF.md files Inline code comments
Where a higher-precedence document is silent, the next document down applies.
Where a higher-precedence document is explicit, lower-precedence documents that
disagree are stale and must be amended.

11. AMENDMENT PROCEDURE

Amendments to this document follow the Human-Review Category procedure (§2.2).
To amend:

Open a PR modifying OQMI_GOVERNANCE.md in the affected repo PR description
states: section being amended, current language, proposed language, rationale
CEO reviews and merges Once merged, the amended document is propagated to all
other OmniQuest Media Inc. repos by either: (a) a copy-forward PR opened in each
repo by an agent, or (b) a CEO-driven manual sync Document version is
incremented on every amendment. Version bump rules:

Patch (v1.0 → v1.0.1): Wording clarification, no semantic change Minor (v1.0 →
v1.1): New rule added, no existing rule changed Major (v1.0 → v2.0): Existing
rule changed, removed, or invariant rebalanced 12. INVARIANTS REGISTER (QUICK
REFERENCE)

Standing invariants every agent must know without lookup:

CEO assignment IS approval; agents proceed unless blocked PRs auto-merge on
green CI except §2.2 Human-Review Categories Mergeable + dirty = agent fixes
first, escalates only on block (§2.3) No UPDATE or DELETE on ledger, audit,
balance, payout, or session-record tables All money-like operations require an
idempotency key Every financial/audit table includes correlation_id and
reason_code Postgres and Redis never on public interfaces No hardcoded financial
constants; all from declared config file Yarn for OmniQuest Media Inc. repos
unless README explicitly says otherwise AI is advisory; humans authorize
irreversible actions Never log secrets, tokens, credentials, PII, or payment
data Never fabricate command output, test results, or file contents Read this
document and OQMI_SYSTEM_STATE.md before non-trivial actions Leave a ## HANDOFF
block on any incomplete work Commit discipline: atomic, descriptive, scoped; FIZ
four-line format on financial-integrity paths No Jaime Watt / Navigator Ltd.
references in any OmniQuest Media Inc. material 13. END OF DOCUMENT

This document is the standing governance instrument for OmniQuest Media Inc.
repositories. It is repo-portable and drops into any repo unchanged.
Repo-specific extensions live in OQMI_GOVERNANCE_OVERRIDES.md (only with CEO
approval) or in the repo's OQMI_SYSTEM_STATE.md.

Authority: Kevin B. Hartley, CEO — OmniQuest Media Inc. Effective: 2026-04-21
