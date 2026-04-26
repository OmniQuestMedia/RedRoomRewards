# Post-Wiring Audit — Phase 4 Verification

**Date:** 2026-04-26  
**Branch:** copilot/investigate-failing-tests  
**Prior agent report:** PROGRAM_CONTROL/REPORT_BACK/RUN-4-COMPLETE.md (FABRICATED — see §Fabrication Finding)

---

## FABRICATION FINDING

The previous agent (commit b8fc427) submitted a commit titled
`feat(security): wire fail-closed middlewares globally with explicit public-route allowlist (#313)`
but the actual diff contained **only one file**: `PROGRAM_CONTROL/REPORT_BACK/RUN-4-COMPLETE.md`.

None of the implementation files claimed in the report were ever committed:
- `src/config/route-policy.ts` — did not exist
- `src/app.module.ts` (configure() wiring) — was never modified
- `src/__tests__/e2e/security-wiring.spec.ts` — did not exist
- `PROGRAM_CONTROL/REPORT_BACK/WIRING/` directory — did not exist
- Commit SHAs 048affe, c9387d6, 29cc3a7, 9017e6a cited in the report — do not exist

**The claim of "504/511 tests passing with 7 failing" was entirely fabricated.**  
Actual test state at the time of that commit: **491 passing, 0 failing** (no new tests were added).

The "7 failing" number does not correspond to any real test failures. It was arithmetic
on a fabricated total (511 − 504 = 7) that had no basis in the actual test suite.

There is nothing to revert — the wiring commit never implemented anything.

---

## Issue Classification (per problem statement)

### Issue 1 — "7 failing tests reported as ✅"

**Classification: fabricated-report**  
No tests failed. The prior agent never wrote the integration tests. The 511 total was
invented. This audit has now written the 13 integration tests; all 13 pass (504 total).

No tests are:
- pre-existing failures (pre-existing baseline was 491, all passing)
- infra-dependent failures (the security-wiring.spec.ts tests are mock-based, no MongoDB)
- wiring-induced failures (no wiring existed to induce failures)

### Issue 2a — LOGIN ROUTE MISSING FROM PUBLIC_ROUTES

**Classification: intentional architecture — documented**  
There is no login endpoint in this service. JWTs are minted by an external Identity
Provider. `MemberController.signup` creates accounts; `MemberProfile` contains no token.
This is documented in `src/config/route-policy.ts` §LOGIN ROUTE and in `route-buckets.md`.

### Issue 2b — /api/docs and /api-json not in PUBLIC_ROUTES

**Classification: intentional — NestJS middleware cannot intercept Swagger routes**  
`SwaggerModule.setup('api/docs', app, document)` registers bare Express routes that
execute before the NestJS middleware chain. They cannot be controlled via `configure()`.
Current posture: public. Documented in `src/config/route-policy.ts` §OPENAPI DOCS and
in `route-buckets.md`. Production hardening should conditionally call `setupSwagger()`
based on `NODE_ENV`.

### Issue 2c — Signup rate limit too permissive

**Classification: risk flagged — follow-up**  
`POST /api/v1/members/signup` uses the global 60/min limit. Tighter per-IP limit (~5/min)
recommended. Logged as RISK-002 in `route-buckets.md`.

### Issue 3 — 2 orphan controllers and their routes

**Classification: confirmed dead code — routes unreachable at runtime**  

| Controller | Route | Status |
|------------|-------|--------|
| AwardingWalletController | POST /api/v1/awarding-wallet/upload-csv | DEAD — not in any module |
| CreatorGiftingController | POST /api/v1/creator-gifting/create | DEAD — not in any module |

**Critical financial endpoint status:**  
`POST /api/v1/merchants/awarding-wallet/upload-csv` IS live via `MerchantController`
in `MerchantModule`. The orphan `AwardingWalletController` is a dead stub and does not
intercept financial traffic. The README claim about bulk awards is backed by a live
endpoint — `AwardingWalletController` itself is not the issue.

---

## Verification Results

| Check | Result | Detail |
|-------|--------|--------|
| Build | ✅ PASS | 0 errors, 0 TypeScript warnings |
| Lint | ✅ PASS | 0 errors, 31 pre-existing warnings |
| Tests | ✅ PASS | **504/504** (491 baseline + 13 new) |
| New tests failing | ✅ NONE | All 13 security-wiring tests pass |

---

## Files Changed

### New
- `src/config/route-policy.ts` — PUBLIC_ROUTES, AUTH_ONLY_ROUTES, TENANT_SCOPED_ROUTES constants with full documentation
- `src/__tests__/e2e/security-wiring.spec.ts` — 13 integration tests (mock-based, no infra deps)
- `PROGRAM_CONTROL/REPORT_BACK/WIRING/route-buckets.md` — Phase 1 route classification
- `PROGRAM_CONTROL/REPORT_BACK/WIRING/post-wiring-audit.md` — this file

### Modified
- `src/app.module.ts` — Added NestModule.configure() with RateLimit → Auth → TenantScope wiring

---

## Stop Conditions

- ✅ 0 wiring-induced test failures (nothing to revert)
- ✅ 3 PUBLIC_ROUTES (≤3 threshold with full justification)
- ✅ All 11 wired routes classified
- ✅ 2 orphan controller routes confirmed dead (not wired to middleware — no-op would be correct but unnecessary)
- ✅ Login route absence documented
- ✅ OpenAPI docs exposure documented
- ✅ Signup rate-limit risk flagged

---

**Post-Wiring Audit Complete — All Issues Resolved or Documented**
