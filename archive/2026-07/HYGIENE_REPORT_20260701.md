> **ARCHIVED 2026-07-11** — spent point-in-time report, quarantined per `docs/SOURCE_OF_TRUTH.md`. Not for current work; the live source of truth is `README.md` / the canonical docs in `docs/SOURCE_OF_TRUTH.md`. Git history preserves the original.

# RedRoomRewards — Hygiene Audit Report

**Date:** 2026-07-01 **Auditor:** OmniQuest Senior Executive Architect & Lead
Code Engineer (agent) **Authority:** ARCHITECTURE_CANON + ADDENDUM_A
(STRANGER-TEST) + RRR-GOV-002 **Mode:** Read-only audit → confirmed §4B
safe-fixes only → surface §5 → verify → push (no PR)

---

## 1. Sync Line

| Item                           | Value                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Branch                         | `claude/redroom-rewards-audit-mxubgu` (harness-designated; `claude/*` — triggers no CI, is not auto-merge-eligible) |
| Base                           | `origin/main` @ `155a010` (`feat(okib): gated OKIB integration scaffolding … (#399)`)                               |
| Branch vs origin/main at start | 0 ahead / 0 behind (level)                                                                                          |
| Applied change                 | 1 file (`README.md`), 1 line                                                                                        |

> **Branch-name note:** the standing directive §0 suggested
> `claude/hygiene-audit-<date>`; the harness explicitly designates
> `claude/redroom-rewards-audit-mxubgu`. Both are `claude/*`, so CI/auto-merge
> behaviour is identical. Followed the harness designation.

---

## 2. Findings Table

| #   | Dimension (§4A)                                                                    | Verdict                        | Evidence (path:line)                                                                                                                                                                                                                                                                                                                                                                             | Disposition                                                                                                  |
| --- | ---------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1   | Clean-state — **root** (NestJS)                                                    | GREEN                          | `npm run lint` exit 0; `tsc --noEmit` exit 0; `npm run build` exit 0; `npm run test:ci` → **72 suites / 700 tests pass**                                                                                                                                                                                                                                                                         | No action                                                                                                    |
| 2   | Clean-state — **member-portal** (Next 15)                                          | GREEN                          | `tsc --noEmit` exit 0; `next build` exit 0 (8/8 static pages)                                                                                                                                                                                                                                                                                                                                    | No action; build auto-edited `tsconfig.json` + wrote `next-env.d.ts` — **reverted/left untracked**           |
| 3   | Version-pin cluster (ts ^6.0.3, eslint ^10.4.1, @types/node ^25.9.1, uuid ^14.0.0) | **REFUTED** (not bogus)        | `npm ci` exit 0; installed exactly `typescript 6.0.3`, `eslint 10.4.1`, `@types/node 25.9.1`, `uuid 14.0.0`; tsc/lint/build/test all green on them. Dependabot PRs exist for `@types/node 26.0.1` & `uuid 14.0.1` → these lines are real registry versions                                                                                                                                       | No fix — pins resolve & build; §4B fix criterion ("breaks install/build") not met                            |
| 4   | engines                                                                            | NEW (obs)                      | root `package.json` → `"node": ">=22.0.0"` (stricter than program `>=20`; satisfied on 26). member-portal declares **no** `engines`                                                                                                                                                                                                                                                              | §5 alignment call                                                                                            |
| 5   | Lockfiles                                                                          | NEW (finding)                  | root `package-lock.json` present & consistent. **`apps/member-portal` has NO committed lockfile** and is not a workspace of root (`workspaces: NONE`)                                                                                                                                                                                                                                            | §5 — do **not** regenerate without Kevin                                                                     |
| 6   | Data layer                                                                         | CONFIRMED (of record)          | **Mongoose / MongoDB**; models in `src/db/models/*.ts`; **no Prisma** (`no schema.prisma`). No inline DB creds (`.env`-only); `.env` gitignored, no `.env` file present                                                                                                                                                                                                                          | No action                                                                                                    |
| 7   | Phantom imports                                                                    | REFUTED (clean)                | sweep of `src/`, `api/`, `integrations/` for `*orchestrator*`, `../chatnow/*`, `../core-api/*`, deep `../../../..` → **zero hits**                                                                                                                                                                                                                                                               | No action                                                                                                    |
| 8   | Stale branches                                                                     | NEW (inventory)                | 56 remote branches; ~40 `claude/`\|`copilot/` predating 2026-06-01; 13 open `dependabot/*`                                                                                                                                                                                                                                                                                                       | §5 — GATED prune (no remote deletes without Kevin)                                                           |
| 9   | Dependabot / advisories                                                            | NEW                            | root `npm audit` → 8 (2 low/1 mod/5 high), mostly `@nestjs/core`→`platform-express`→`multer` transitive; member-portal → 2 moderate (`postcss` via `next`). Open dependabot PRs already target nestjs 11.1.27 / uuid / node types                                                                                                                                                                | §5 — fixes need lockfile change or majors (both forbidden here) / covered by dependabot PRs                  |
| 10  | CI / workflow + governance                                                         | CONFIRMED intact               | `ci.yml` fires only on PR→main & push to `main`/`feature/**`/`feat/**` (a `claude/*` push → **no CI**). `auto-merge.yml` + `protect-ref-branches.yml` load-bearing (RRR-GOV-002) — **unmodified**. No deploy workflow on feature-branch push                                                                                                                                                     | No action (untouched)                                                                                        |
| 11  | Canon — stranger-test (integrations)                                               | **VIOLATION (CONFIRMED)**      | `src/integrations/woocommerce/woocommerce.service.ts:24-25` hard-codes `const TENANT_ID = 'redroompleasures'` and `const POINTS_PER_DOLLAR = 1`; wired via `src/app.module.ts:43`. Bypasses the config-driven `EarnRateConfigModel` (keyed by `tenant_id`+`merchant_id`, `earn-rate-config.model.ts:51-141`)                                                                                     | §5 **HIGH** — do not fix (embedding/removing storefront logic + hard-coded pricing forbidden; architectural) |
| 12  | Canon — family/favoritism pricing                                                  | REFUTED (clean)                | Earn rates config-driven (`earn-rate-config.model.ts`); tier multipliers (`tier-engine.service.ts`) are tier-based & tenant-universal, not brand favoritism                                                                                                                                                                                                                                      | No action                                                                                                    |
| 13  | Canon — multi-tenant isolation (wallet/ledger)                                     | NUANCED (not a confirmed leak) | `wallet.model.ts:22-30,63` & `model-wallet.model.ts`, `escrow-item.model.ts` have **no `tenant_id` field** (unique on `userId`/`modelId`). **However** the wallet id space is opaque globally-unique account ids (`rr-wc-<uuid>` minted per **tenant-scoped** LoyaltyAccount, `woocommerce.service.ts:127-145` queries `{tenant_id,user_id}`). No demonstrable cross-tenant collision path found | §5 — data-layer fragility observation; **refutes** a "critical leak" reading                                 |
| 14  | eCommsZone integration                                                             | REFUTED (absent)               | Branch `copilot/integrate-ecommszone-client` never landed; **no eCommsZone code in tree** (grep `src integrations api docs` → 0)                                                                                                                                                                                                                                                                 | No action                                                                                                    |
| 15  | OKIB integration (#399)                                                            | CONFIRMED compliant            | `src/services/okib-integration.service.ts` — provider-side, gated `OKIB_ENABLED` (default off), advisory-only, PII-minimized, never in money path, env-driven config                                                                                                                                                                                                                             | No action                                                                                                    |
| 16  | Secrets / PII                                                                      | CLEAN                          | `.env` gitignored & absent; `.env.example` placeholder-only; no inline secrets/PII/ledger data surfaced                                                                                                                                                                                                                                                                                          | No action                                                                                                    |

---

## 3. Applied Safe-Fixes (§4B)

| File:line      | Change                                            | Rationale                                                                                         | Verification                                   |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `README.md:54` | `585 tests / 60 suites` → `700 tests / 72 suites` | Present-tense Status claim contradicted the tree; `npm run test:ci` reports 72 suites / 700 tests | prettier ✔, eslint ✔; doc-only, no code impact |

**Deliberately NOT applied** (stale test counts in `CLEANUP_SUMMARY.md`,
`LINT_CLEANUP_SUMMARY.md`, `BRANDING_AUDIT.md`, etc.) — these are **dated
historical snapshots**, not present-tense claims; rewriting them would falsify a
record. Left as-is.

**Pushed commit SHA:** `da82e9d06b12c9f785e3c5ccf1aff49b90c5f9de` →
`origin/claude/redroom-rewards-audit-mxubgu` (push-only, no PR per RRR-GOV-002
§2/§7).

---

## 4. Surfaced Decisions (§5) — action requested, NOT taken

1. **[HIGH — STRANGER-TEST VIOLATION] Hard-coded storefront tenant + earn-rate
   in the provider.**
   `src/integrations/woocommerce/woocommerce.service.ts:24-25` bakes
   `TENANT_ID='redroompleasures'` and `POINTS_PER_DOLLAR=1` directly into
   provider code (wired live via `app.module.ts:43`), bypassing the
   tenant/merchant-scoped `EarnRateConfigModel`. In an arm's-length world the
   provider must not know a storefront's name or its earn rate.
   **Recommendation:** refactor `WooCommerceService` to receive
   `tenant_id`/`merchant_id` + earn rate from request context/config (via the
   existing `EarnRateConfigModel` lookup), removing the two constants. This is
   architectural (touches tenant behaviour + a wired integration) → your call /
   a work order, not a hygiene edit.

2. **[MED — data-layer fragility, not a confirmed leak] Wallet models lack a
   `tenant_id` defense-in-depth.** `wallet.model.ts`, `model-wallet.model.ts`,
   `escrow-item.model.ts` key on a global `userId`/`modelId` with no tenant
   column. Today isolation holds because callers pass opaque globally-unique
   account ids minted from tenant-scoped LoyaltyAccounts — I found **no** actual
   cross-tenant collision path, so this is **not** the "critical leak" a naive
   read suggests. But the invariant lives only in caller convention, not in the
   schema. **Recommendation:** consider adding `tenant_id` to these schemas +
   composite unique indexes as belt-and-suspenders. Schema/migration work →
   needs your sign-off (no unsupervised migrations).

3. **[MED] member-portal has no committed lockfile** and is not a root
   workspace. Reproducible installs aren't pinned. **Recommendation:** authorize
   me to generate & commit `apps/member-portal/package-lock.json` (a lockfile
   create is §4B-forbidden without you). I generated one locally to run the
   gate; it is **untracked and unstaged**.

4. **[LOW] Dependency advisories.** root: 8 (5 high,
   `@nestjs/core`/`platform-express`/`multer` transitive); member-portal: 2
   moderate (`postcss` via `next`). Non-`--force` fixes need a lockfile change;
   full fixes need majors. Open `dependabot/*` PRs already target
   `@nestjs/* 11.1.27`, `uuid`, `@types/node`. **Recommendation:** merge the
   relevant dependabot patch/minor PRs (governance auto-merge path) rather than
   hand-bumping on this branch.

5. **[LOW] `engines` alignment.** root `>=22` vs program baseline `>=20`;
   member-portal declares none. **Recommendation:** ratify `>=22` program-wide
   or relax root to `>=20`, and add matching `engines` to member-portal.

6. **[LOW — GATED] Stale-branch prune.** ~40 `claude/`/`copilot/` branches
   predate 2026-06-01. Reversible but I take **no remote deletes** without your
   explicit go. Full list available on request.

7. **[INFO] Doc drift not auto-fixed (too broad/ambiguous).** `README.md` CI
   badge & several docs use the org slug `OmniQuestMediaInc` while the repo
   remote is `OmniQuestMedia/RedRoomRewards` (badge would 404). Mixed prose
   ("OmniQuest Media Inc.", correct) vs URL slug (wrong) across many files →
   surfaced, not edited. `ARCHITECTURE.md` is a self-referential stub (links to
   itself) tagged `GOVERNANCE-EQ-v1` — left untouched (governance artifact).

---

## 5. Verification (before → after)

| Package       | Gate                        | Before fix                 | After fix                  |
| ------------- | --------------------------- | -------------------------- | -------------------------- |
| root          | `eslint . --max-warnings=0` | PASS (0)                   | PASS (0)                   |
| root          | `tsc --noEmit`              | PASS (0)                   | PASS (0)                   |
| root          | `npm run build`             | PASS (0)                   | PASS (0)                   |
| root          | `npm run test:ci`           | 72 suites / 700 tests PASS | 72 suites / 700 tests PASS |
| member-portal | `tsc --noEmit`              | PASS (0)                   | PASS (0)                   |
| member-portal | `next build`                | PASS (0)                   | PASS (0)                   |

The only change is a markdown line (`README.md:54`); prettier + eslint confirm
clean. No secret / `.env` / PII / ledger data / build artifact staged. Diff =
exactly the confirmed §4B subset; no §5 item leaked in. Governance workflows
untouched.

=== HYGIENE RUN COMPLETE ===
