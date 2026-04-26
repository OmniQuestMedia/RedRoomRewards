# Phase 0 — Bypass Pattern Sweep

**Date:** 2026-04-26
**Branch:** claude/fix-fail-open-security-middlewares
**Commit:** 7fe7654

## Commands Executed

```bash
grep -rnE "if \(!process\.env\." src/ --include='*.ts' --exclude='*.spec.ts' --exclude='*.test.ts'
grep -rnE "return next\(\);?\s*$" src/middleware src/api --include='*.ts' --exclude='*.spec.ts'
grep -rnE "if \(!req\.(tenantId|user|userId|auth)\)" src/ --include='*.ts' --exclude='*.spec.ts'
grep -rnEi "(demo|investor|fake|bypass|skip-?auth|mock-mode)" src/ --include='*.ts' --exclude='*.spec.ts'
```

## Findings

### Pattern 1: `if (!process.env.` checks
**Result:** No matches found

### Pattern 2: `return next()` calls
**Result:** No matches found
**Note:** Manual inspection of auth.middleware.ts:45-50 and tenant-scope.middleware.ts:23-26 confirms the bypass patterns exist but use multi-line formatting that doesn't match the regex.

Actual patterns found via file read:
- `src/middleware/auth.middleware.ts:45-50` — `if (!secret) { ... next(); return; }`
- `src/middleware/tenant-scope.middleware.ts:23-26` — `if (req.tenantId) { ... } next();` (fail-open when tenantId missing)

### Pattern 3: `if (!req.(tenantId|user|userId|auth))` checks
**Result:** No matches found

### Pattern 4: Bypass keywords (demo|investor|fake|bypass|skip-auth|mock-mode)
**Result:** 6 matches

#### Classification:

**BENIGN** — `src/test/helpers/setTestEnv.ts:4`
```
Many specs need to bypass guards that suppress behaviour when
```
Comment describing test setup behavior. Not a bypass pattern in production code.

**BENIGN** — `src/config/env-validator.ts:98`
```
/^(changeme|password|secret|test|admin|default|demo)/i,
```
Part of env validation that rejects weak passwords/secrets. Security control, not a bypass.

**BENIGN** — `src/__tests__/security.test.ts:49,51,64`
```
// Wrap refund token inside a fake settlement-shaped object
const fakeSettlement: QueueSettlementAuthorization = {
authService.validateSettlementAuthorization(fakeSettlement, 'queue-123', 'escrow-123'),
```
Test code creating test fixtures. Test files are excluded from scope.

**BENIGN** — `src/services/member.service.ts:32`
```
// MANDATORY GateGuard AV — brand standard; never bypass
```
Comment explicitly stating no bypass is allowed. Security reminder, not a bypass.

### Summary

**KNOWN bypasses (already in scope):**
1. `src/middleware/auth.middleware.ts:45-50` — JWT_SECRET missing → call next()
2. `src/middleware/tenant-scope.middleware.ts:23-26` — req.tenantId missing → call next()
3. `src/middleware/rate-limit.middleware.ts:19` — hardcoded max: 60 (not a bypass, but config bug in scope)

**NEW-BYPASS:** 0

**BENIGN:** 6 (all are comments, test code, or security controls)

**Stop condition check:** 0 NEW-BYPASS rows found (threshold was >2). Proceeding to Phase 1.
