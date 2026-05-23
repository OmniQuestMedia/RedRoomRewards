# RRR-GOV-002-A001 — DONE

**Charter:** RRR-GOV-002 (persistent, see
PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md)

**Task ID:** RRR-GOV-002-A001

**Title:** Archive CLAUDE.md

**Merged:** 2026-04-21

**Merge commit:** 954dec932c3ba95f6ca05d0dc1cc2a5ce8a7dba5

**PR:** #227

**Agent executed:** claude-code

**Agent hint matched:** yes (charter hint was `either`)

**CEO_GATE:** YES — merged manually by CEO: yes

**FIZ:** NO

## What shipped

Moved the root `CLAUDE.md` governance file to
`archive/governance/CLAUDE_2026-04-21.md` as a pure `git mv` (100% rename, no
content change). Added `archive/README.md` declaring the archive read-only
invariant and naming RRR-GOV-002 as the single current policy source. Pointed
`.github/copilot-instructions.md` at the active charter via a new
`Active Charter:` entry at the top of the Source-of-Truth block. Removed the
`archive/` rule from `.gitignore` as a root-cause fix — the charter's §0
persistence model keeps retired charters permanently under
`archive/governance/`, which is incompatible with the path being git-ignored;
without the edit, the acceptance criterion
`git ls-files archive/governance/CLAUDE_2026-04-21.md` could not have been
satisfied. Flagged the `.gitignore` change explicitly in the report-back's
Operator Decisions section and in the PR body for CEO visibility; CEO merged the
PR as-is.

## Acceptance verified

- [x] `git ls-files CLAUDE.md` → empty
- [x] `git ls-files archive/governance/CLAUDE_2026-04-21.md` → present
- [x] `grep -r "CLAUDE.md" .github/` → no results
- [x] `grep -r "RRR-GOV-002" .github/copilot-instructions.md` → at least one
      match (line 14)

## Follow-ups filed

- none

## Report-back

PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A001-report.md
