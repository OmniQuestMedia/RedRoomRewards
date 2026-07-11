> **ARCHIVED 2026-07-11** — spent point-in-time report, quarantined per `docs/SOURCE_OF_TRUTH.md`. Not for current work; the live source of truth is `README.md` / the canonical docs in `docs/SOURCE_OF_TRUTH.md`. Git history preserves the original.

# RedRoomRewards — Carry-Back Items #3 (lockfile) + #6 (stale-branch prune)

**Date:** 2026-07-02 **Branch:** `claude/rrr-member-portal-lockfile-20260702`
(off `origin/main` @ `4019092`) **Mode:** push-only, `[skip ci]` interim,
verified green LOCALLY, Kevin review-merges.

---

## 1. Sync line

| Item           | Value                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| Default branch | `main` @ `4019092`                                                                   |
| Branch         | `claude/rrr-member-portal-lockfile-20260702`                                         |
| Item #3        | member-portal lockfile — **DONE** (this PR)                                          |
| Item #6        | stale-branch prune — **identified; remote delete BLOCKED by egress policy** (see §3) |

## 2. Item #3 — member-portal lockfile (APPROVED)

`apps/member-portal` (Next.js 15) had no committed lockfile and is not a
workspace of the root, so its installs were unpinned. Generated and committed
`apps/member-portal/package-lock.json` with npm (matching the root package
manager, `package-lock.json`).

**Verification (LOCAL):**

| Gate                           | Result                          |
| ------------------------------ | ------------------------------- |
| `npm ci` from the new lockfile | PASS (exit 0)                   |
| `npm run build` (next build)   | PASS (exit 0; 8/8 static pages) |

Note: `npm audit` reports 2 moderate advisories (`postcss` via `next`) whose
only fix is a major `next` bump — left to dependabot per carry-back #4, not
addressed here.

## 3. Item #6 — stale-branch prune (APPROVED, gated; BLOCKED on execution)

Per the ruling, only branches **fully merged into `origin/main` (git ancestry)**
are eligible — their commits are already in `main`, so deletion loses nothing.

### Eligible to delete (6 — fully merged into main)

| Branch                                      | Merge SHA (in main) |
| ------------------------------------------- | ------------------- |
| `claude/add-copilot-instructions-file`      | `7522e71`           |
| `claude/ci-quality-gate-checks`             | `7522e71`           |
| `claude/cleanup-linter-code-quality-pass`   | `5cb1b4a`           |
| `claude/cleanup-prompts`                    | `5cb1b4a`           |
| `copilot/advance-to-canonical-compliance`   | `458cc4a`           |
| `copilot/update-architecture-and-workflows` | `6d23cbe`           |

### Skipped (38 — squash-merged or open)

38 other `claude/`/`copilot/` branches are **not** merge-ancestors of `main`
(squash-merge leaves no ancestry link, or they are genuinely open). I cannot
confirm they are fully merged, so I did **not** touch them — the safe choice.
`dependabot/*` branches (open PRs) are also left alone.

### ⚠️ Execution blocked

`git push origin --delete <branch>` returns **HTTP 403** from the session's
egress proxy for all six — the org egress policy denies remote ref deletion in
this session (regular pushes are permitted). Per `/root/.ccr/README.md`, policy
denials must be reported, not retried or routed around, so **no branches were
deleted.** The GitHub MCP surface also has no branch-delete tool.

**Recommendation:** delete the six listed branches from the GitHub UI (or
`gh api -X DELETE repos/OmniQuestMedia/RedRoomRewards/git/refs/heads/<branch>`),
or grant this session ref-delete egress and I'll run it. All six are recoverable
from the merge SHAs above.

## 4. Remaining carry-back items

- **#1** WooCommerce earn-rate refactor — delivered on
  `claude/rrr-woo-earnrate-config-20260702` (draft PR #413).
- **#2** Wallet `tenant_id` defense-in-depth — SCHEDULED (after #1).
- **#4** dependency advisories → dependabot PRs. **#5** engines `>=22` → leave
  as-is.

=== HYGIENE RUN COMPLETE ===
