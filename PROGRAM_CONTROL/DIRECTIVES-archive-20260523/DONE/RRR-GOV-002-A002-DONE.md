# RRR-GOV-002-A002 — DONE

**Charter:** RRR-GOV-002 (persistent, see
PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md)

**Task ID:** RRR-GOV-002-A002

**Title:** Resolve package-manager contradiction (npm)

**Merged:** 2026-04-21

**Merge commit:** a408653418e04831d72596bf5b3cc1cc12c704cf

**PR:** #232

**Agent executed:** claude-code

**Agent hint matched:** yes (charter hint was `either`)

**CEO_GATE:** NO — n/a

**FIZ:** NO

## What shipped

Removed the two vestigial Yarn declarations from `package.json`: the top-level
`packageManager: "yarn@4.9.1"` field and the `engines.yarn: ">=4.0.0"`
constraint. Kept `engines.node: ">=22.0.0"`. `engines.npm` was not present to
preserve. No `yarn.lock` in repo. `npm install` ran clean (441 packages, 0
vulnerabilities); the only `package-lock.json` change was npm mirroring the
`engines` block into the lockfile's root entry — no dependency additions,
removals, or version bumps. CI workflows were already npm-correct per Phase 1
assessment §9 and were out of A-002 scope.

## Acceptance verified

- [x] `jq '.packageManager' package.json` → `null`
- [x] `jq '.engines.yarn' package.json` → `null`
- [x] `npm install` runs clean; lockfile change is the expected engines mirror
      (no dep/version changes)

## Follow-ups filed

- none

## Report-back

PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A002-report.md
