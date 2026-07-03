# BUILD CONTROL - REWARDS Thread Bootstrap

**Always-current master orientation document** **Authority:** Kevin B. Hartley,
CEO — OmniQuest Media Inc. **Initialized:** Thread RRR-001 — 2026-04-18 **Last
updated:** Thread RRR-001 — 2026-04-18 **Repo:**
OmniQuestMedia/RedRoomRewards

---

## HOW TO USE THIS DOCUMENT

Read this at the **START** of every new Claude Chat thread working on BUILD
CONTROL - REWARDS. Read the handoff document **AFTER** this. Then proceed.

This document replaces any multi-URL orientation ritual. The handoff carries
only: current state, open PRs, next action. Everything structural lives here and
in the sibling library files.

---

## 1. CORE IDENTIFIERS

| Field             | Value                                         |
| ----------------- | --------------------------------------------- |
| Company           | OmniQuest Media Inc. (OQMInc)                 |
| CEO               | Kevin B. Hartley                              |
| Project           | BUILD CONTROL - REWARDS                       |
| Short code        | RRR                                           |
| Description       | RedRoomRewards Loyalty program                |
| Repo              | OmniQuestMedia/RedRoomRewards              |
| Initialized       | Thread RRR-001 — 2026-04-18                   |
| **BANNED ENTITY** | Jaime Watt / Navigator Ltd. — NEVER reference |

---

## 2. REFERENCE LIBRARY INDEX

All files in `REFERENCE_LIBRARY/` on main. Read via GitHub API or:
`git show main:REFERENCE_LIBRARY/{filename}`

| File                     | Contents                                |
| ------------------------ | --------------------------------------- |
| 00_THREAD_BOOTSTRAP.md   | This document — always read first       |
| 01_CANONICAL_LOCKS.md    | Project-locked decisions and invariants |
| 02_DOMAIN_TAXONOMY.md    | Directive series, status, agent routing |
| 03_FEATURE_BRIEFS.md     | Feature and surface specifications      |
| 04_AI_REFERENCE_INDEX.md | AI/ML resources mapped to directives    |
| 05_OSS_REPO_REGISTRY.md  | Reference repos and branch access       |
| 06_PROJECT_DECISIONS.md  | Architecture decisions log              |

---

## 3. REFERENCE BRANCHES

Read any file: `git show refs/{category}/{name}:{filepath}` CI blocks all
`refs/*` to main merges automatically.

[POPULATE when OSS harvest directive is executed] No reference branches created
at library initialization.

---

## 4. CANONICAL LOCKS

See `01_CANONICAL_LOCKS.md` for full detail. [POPULATE with project-specific
locks as CEO decisions are made]

---

## 5. CURRENT PIPELINE STATE

Update this section at every thread close.

**Last thread:** RRR-001 (2026-04-18) **Status:** REFERENCE_LIBRARY initialized.
Awaiting first directives.

**Open PRs:** None at initialization. **Queue state:** Empty at initialization.
**Next action:** [POPULATE at thread close]

---

## 6. OPEN POLICY TBDs

[POPULATE as policy questions are identified during build]

---

## THREAD CLOSE PROTOCOL

At close of every thread, Claude Chat MUST:

1. Update Section 5 (Current Pipeline State)
2. Update Section 3 if new reference branches were created
3. Update Section 6 if new policy TBDs were identified
4. Commit with message: `CHORE: update THREAD_BOOTSTRAP — Thread {N} close`
5. Write detailed handoff to `PROGRAM_CONTROL/HANDOFFS/THREAD-{N}-HANDOFF.md`
