# RRR-GOV-002-A004 — DONE

**Charter:** RRR-GOV-002 (persistent, see
PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md)

**Task ID:** RRR-GOV-002-A004

**Title:** Refresh REQUIREMENTS_MASTER.md stale statuses

**Merged:** 2026-04-21

**Merge commit:** d9bd6de517351fc2984c26918e676a6fd8bd618b

**PR:** #230

**Agent executed:** claude-code

**Agent hint matched:** yes (charter hint was `claude-code`)

**CEO_GATE:** NO — n/a

**FIZ:** NO

## What shipped

Four requirement rows in `docs/REQUIREMENTS_MASTER.md` were moved from stale
`NEEDS_DIRECTIVE` / `IN_PROGRESS` states to `DONE` with the real PR references
in the Notes column: RRR-P1-001 (PointLot, PR #218), RRR-P1-003 (five config
models, PR #226), RRR-P1-006 (ChatNow.Zone rename, PR #219), RRR-P1-007 (slot
machine removal, PR #222). Added a `Last verified: 2026-04-21` footer citing
charter §5.1 as the source. The task text asked for a `MERGED` status value, but
the file's existing STATUS KEY has no such entry; `DONE` is the file-native
equivalent ("Code on main, report-back filed, verified") and is already used for
other shipped rows — flagged this interpretation in the report-back and PR body
for CEO visibility. RRR-P0-002 is listed as shipped in charter §5.1 but still
reads `NEEDS_DIRECTIVE` in REQUIREMENTS_MASTER; was out of A-004's scope,
flagged as follow-up.

## Acceptance verified

- [x] `grep -E "Missing|IN_PROGRESS" docs/REQUIREMENTS_MASTER.md` for the listed
      items → no matches (only remaining match is the STATUS KEY definition row,
      not a requirement row)
- [x] Footer present (line 132: `**Last verified:** 2026-04-21`)

## Follow-ups filed

- **RRR-P0-002 status drift** — REQUIREMENTS_MASTER still reads
  `NEEDS_DIRECTIVE` for RRR-P0-002, but charter §5.1 lists it as shipped. Out of
  A-004 scope; flagged for pickup under A-CLEAN or a standalone sync task.
- **STATUS KEY vocabulary (`MERGED` vs `DONE`)** — task text used `MERGED`, file
  uses `DONE`. Went with `DONE` for STATUS KEY consistency. CEO may opt to amend
  the STATUS KEY under a future governance task if the charter-level term of art
  is `MERGED`.

## Report-back

PROGRAM_CONTROL/REPORT_BACK/RRR-GOV-002-A004-report.md
