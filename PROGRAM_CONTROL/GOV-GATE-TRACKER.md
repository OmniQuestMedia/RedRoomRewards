# GOV-GATE-TRACKER

**Owner:** Kevin B. Hartley, CEO — OmniQuest Media Inc. **Authority:**
RRR-GOV-002 charter (`PROGRAM_CONTROL/DIRECTIVES/QUEUE/RRR-GOV-002.md`)
**Created by:** RRR-GOV-002-A003 **Last updated:** 2026-04-21

---

## Purpose

Single-pane status board for every directive marked `CEO_GATE: YES` in
RRR-GOV-002 §6. Per charter §3.18, CEO_GATE items **do not auto-merge** — the
CEO reviews and merges them manually. This file is the CEO's one-stop view of:

- every PR currently awaiting manual merge (`OPEN`), and
- historical record of every charter-era CEO-gated directive that has been
  merged (`MERGED`) or closed without merging (`CLOSED_UNMERGED`).

If a directive is **not** `CEO_GATE: YES` in §6, it does not appear here — it is
governed by the normal auto-merge path and is tracked in §6 itself.

## How this file is maintained

- **On PR open** for a `CEO_GATE: YES` task: the executing agent adds a row with
  `Status: OPEN`, the PR number, and the date opened.
- **On PR merge** (by CEO): the executing agent flips `Status: OPEN` →
  `Status: MERGED`, fills in the merge date, and notes the merge commit SHA in
  the Notes column.
- **On PR close without merge:** status flips to `CLOSED_UNMERGED` with
  rationale in Notes.
- Rows are **never deleted**. Historical closed rows remain as audit record.

## Scope (per RRR-GOV-002-A003)

- In scope: charter-era CEO_GATE directives (RRR-GOV-002 charter itself and
  every `RRR-GOV-002-*` task with `CEO_GATE: YES`).
- Out of scope: historical backfill of pre-charter CEO_GATE merges.

## Status vocabulary

| Status            | Meaning                                        |
| ----------------- | ---------------------------------------------- |
| `OPEN`            | PR exists, awaiting CEO merge                  |
| `MERGED`          | PR merged by CEO                               |
| `CLOSED_UNMERGED` | PR closed without merging (rationale required) |

---

## Directives

| Directive ID     | Status | PR # | Opened     | Merged     | Notes                                                                                    |
| ---------------- | ------ | ---- | ---------- | ---------- | ---------------------------------------------------------------------------------------- |
| RRR-GOV-002      | MERGED | —    | 2026-04-21 | 2026-04-21 | Charter ratification, merge commit `ccb288e`. Persistent per §0 — does not move to DONE. |
| RRR-GOV-002-A001 | MERGED | #227 | 2026-04-21 | 2026-04-21 | Archive CLAUDE.md, merge commit `954dec9`. DONE record: `DONE/RRR-GOV-002-A001-DONE.md`. |
| WORK-ORDER-PHASE0 | OPEN | —    | 2026-05-06 | —          | Phase 0 cleanup & housekeeping; sovereign infra policy v1.0 registered. rule_applied_id: INFRA_POLICY_v1.0 |
