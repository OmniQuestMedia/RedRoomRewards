# RRR-WORK-ORDER-PHASE0 — Repo Housekeeping & README Overhaul

**Type:** Operational Directive  
**Status:** IN_PROGRESS  
**Authority:** Kevin B. Hartley, CEO — OmniQuest Media Inc.  
**Correlation ID:** RRR-WORK-ORDER-PHASE0  
**FIZ:** NO (no financial code changes)  
**CEO_GATE:** NO  
**Branch:** `copilot/work-order-phase-0-apply-policy`  
**Date opened:** 2026-05-06

---

## 0. SCOPE

Repository housekeeping tasks submitted via direct work-order prompt (Channel
A). Tasks:

1. Update `README.md` with: Purpose, Tenants & Integrations, Quick Start,
   PROGRAM_CONTROL badge.
2. Archive / remove noise: files >6 months untouched (blocked — shallow clone,
   see §3).
3. Update `.gitignore` to match eComms/Cyrano conventions.
4. Add `.github/CODEOWNERS`.
5. Create this directive in `PROGRAM_CONTROL/DIRECTIVES/QUEUE/`.
6. Run `npm run build && npm run test:ci` baseline.

---

## 1. TASKS

| ID         | Task                                                         | Status  | Notes                                                                                                                                      |
| ---------- | ------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PHASE0-001 | Update README.md — Purpose, Tenants, Quick Start, badges     | DONE    |                                                                                                                                            |
| PHASE0-002 | Archive stale files (>6 months)                              | BLOCKED | Shallow clone — only 2 commits in history; cannot reliably determine staleness. Requires full `git fetch --unshallow` with network access. |
| PHASE0-003 | Update `.gitignore` — yarn, docker-compose, project-specific | DONE    |                                                                                                                                            |
| PHASE0-004 | Add `.github/CODEOWNERS`                                     | DONE    |                                                                                                                                            |
| PHASE0-005 | Create this directive                                        | DONE    |                                                                                                                                            |
| PHASE0-006 | npm baseline build + test                                    | DONE    | See §2                                                                                                                                     |

---

## 2. BUILD & TEST RESULTS

**Note on package manager:** The work-order requested `yarn install`. This repo
is **npm-only** per `OQMI_SYSTEM_STATE_RRR.md` ("Package manager: npm (do not
introduce Yarn or pnpm)"). `npm` was used; no yarn.lock was created.

| Command           | Result                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`   | Pre-existing TS type errors (`@types/node`, `@types/jest` not installed in sandbox). Confirmed pre-existing — unrelated to this PR. |
| `npm run test:ci` | ✅ 585 tests / 60 suites — all pass                                                                                                 |

---

## 3. BLOCKERS

**PHASE0-002 — Stale file archive:** This is a shallow clone with only 2 commits
visible. `git log --since="6 months ago"` cannot distinguish genuinely stale
files from recently-active ones. To complete this task: run
`git fetch --unshallow origin` with full network access and re-evaluate.

**Package manager:** Work-order mentioned `yarn install`. Governance prohibits
yarn. Kept npm.

---

## 4. NEXT STEPS

- Resolve PHASE0-002 in a full clone environment.
- Move this file to
  `PROGRAM_CONTROL/DIRECTIVES/DONE/RRR-WORK-ORDER-PHASE0-DONE.md` after merge
  with real Merge SHA.
