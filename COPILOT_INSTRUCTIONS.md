# COPILOT_INSTRUCTIONS.md

**Repository**: RedRoomRewards  
**Purpose**: Standardize GitHub Copilot behavior across all OmniQuestMedia repositories  
**Date**: 2025-12-15  
**Status**: Authoritative

---

## Overview

This document defines mandatory rules for GitHub Copilot when generating code, documentation, or pull requests in the RedRoomRewards repository. All AI-assisted development must follow these instructions without exception.

**Enforcement**: Copilot MUST reference this file before taking any action. All outputs must respect security, audit, and minimal-change principles defined herein.

---

## Core Principles

### 1. Repository as Source of Truth

**Rule**: The repository content is the single source of truth. External assumptions or patterns are prohibited.

**Requirements**:
- ✅ Always read and understand existing code before generating new code
- ✅ Follow established patterns and conventions in the codebase
- ✅ Respect existing architecture decisions (see `/DECISIONS.md`)
- ✅ Reference documentation in `/docs/` for context
- ❌ Do NOT invent behaviors not documented in the repository
- ❌ Do NOT assume patterns from other projects apply here
- ❌ Do NOT override explicit architectural decisions

**Validation**:
- Before generating code: Read relevant files in `/src/`, `/docs/`, and `/api/`
- Before suggesting changes: Review `/DECISIONS.md` and `/docs/UNIVERSAL_ARCHITECTURE.md`
- If uncertain: Ask for clarification rather than assuming

---

### 2. No Backdoors or Bypasses

**Rule**: Security and integrity controls are mandatory. Bypassing them is strictly forbidden.

**Prohibitions**:
- ❌ No code that skips authentication or authorization checks
- ❌ No debug endpoints in production code
- ❌ No commented-out security validations
- ❌ No temporary bypass flags that could be forgotten
- ❌ No test-only code paths in production logic
- ❌ No hardcoded credentials, API keys, or secrets

**Requirements**:
- ✅ All endpoints require authentication (see `/api/openapi.yaml`)
- ✅ All inputs must be validated server-side
- ✅ All financial operations require idempotency keys
- ✅ All transactions must be logged to audit trail
- ✅ Use environment variables for configuration

**Enforcement**:
- Code reviews will reject any bypass mechanisms
- Security scanners (CodeQL) will flag violations
- See `/SECURITY.md` for detailed security requirements

---

### 3. Ledger-First Logic

**Rule**: All point movements must go through the ledger system. Direct balance updates are prohibited.

**Requirements**:
- ✅ Every point award creates a ledger transaction
- ✅ Every point redemption creates a ledger transaction
- ✅ Ledger entries are immutable (write-once)
- ✅ Balance corrections require new compensating transactions
- ✅ All transactions include full audit context

**Workflow**:
```
1. Validate request (idempotency key, user exists, amount valid)
2. Check for duplicate (idempotency key lookup)
3. Create ledger transaction record
4. Update wallet balance (atomic with transaction)
5. Log to audit trail
6. Return transaction + wallet state
```

**Prohibitions**:
- ❌ No direct wallet balance updates without ledger entry
- ❌ No balance modifications without transaction context
- ❌ No ledger entry modifications after creation
- ❌ No skipping idempotency checks for "performance"

**Rationale**: Ledger-first ensures:
- Complete audit trail for compliance
- Accurate balance reconciliation
- Prevention of double-spend
- Debugging capability for all transactions

---

### 4. No Invented Behavior

**Rule**: Only implement behavior explicitly documented in specifications. Do not invent features.

**Requirements**:
- ✅ Read specifications in `/docs/specs/` before implementing
- ✅ Follow API contract in `/api/openapi.yaml` exactly
- ✅ Implement only what's documented, nothing extra
- ✅ Ask for specification updates if gaps exist

**Prohibitions**:
- ❌ No "helpful" features not in the spec
- ❌ No assumptions about business rules
- ❌ No creative interpretations of requirements
- ❌ No "I thought it would be useful" additions

**Examples**:

**Good**:
```typescript
// Spec says: Award 100 points for signup
await ledger.createTransaction({
  userId,
  amount: 100,
  type: 'credit',
  reason: 'user_signup_bonus',
  idempotencyKey
});
```

**Bad**:
```typescript
// Inventing bonus multiplier not in spec
const amount = isFirstSignup ? 200 : 100; // ❌ Where did 200 come from?
```

**When Uncertain**:
1. Check `/api/openapi.yaml` for endpoint contract
2. Check `/docs/specs/` for feature specifications
3. Check `/docs/UNIVERSAL_ARCHITECTURE.md` for architectural guidance
4. If still uncertain: Ask, don't assume

---

## Code Generation Rules

### 5. Minimal Changes Only

**Rule**: Make the smallest possible changes to achieve the goal. Surgical edits, not rewrites.

**Requirements**:
- ✅ Change only the files necessary for the task
- ✅ Modify only the lines necessary within those files
- ✅ Preserve existing working code
- ✅ Keep existing patterns and style
- ✅ Update tests for changed code only

**Prohibitions**:
- ❌ No refactoring unless explicitly requested
- ❌ No style changes unrelated to the task
- ❌ No "while I'm here" improvements
- ❌ No reformatting of unchanged code
- ❌ No deleting working code to replace with "better" code

**Example**:

**Task**: Add email field to user wallet

**Good** (minimal):
```typescript
// In src/wallets/wallet.model.ts
export interface Wallet {
  userId: string;
  balance: number;
  currency: string;
  email?: string; // Only add this line
  version: number;
}
```

**Bad** (excessive):
```typescript
// ❌ Don't rewrite entire file with new patterns
export class WalletModel extends BaseModel {
  // Converting to class when interface worked fine
  // Changing naming conventions
  // Adding validators not requested
  // etc.
}
```

---

### 6. Type Safety and Validation

**Rule**: Use TypeScript strict mode. Validate all inputs. No `any` types.

**Requirements**:
- ✅ TypeScript strict mode enabled (`tsconfig.json`)
- ✅ Explicit types for all function parameters and returns
- ✅ Validation for all API inputs (use validators)
- ✅ Error handling for all async operations
- ✅ Mongoose schemas with validation rules

**Prohibitions**:
- ❌ No `any` types (use `unknown` if necessary, then narrow)
- ❌ No `@ts-ignore` comments (fix the type issue)
- ❌ No trusting client data without validation
- ❌ No assumptions about data shape

**Example**:

**Good**:
```typescript
async function earnPoints(req: EarnRequest): Promise<TransactionResponse> {
  // Validate input
  if (!req.userId || typeof req.userId !== 'string') {
    throw new ValidationError('Invalid userId');
  }
  if (!req.amount || req.amount <= 0) {
    throw new ValidationError('Amount must be positive');
  }
  // ... implementation
}
```

**Bad**:
```typescript
async function earnPoints(req: any): Promise<any> { // ❌ No any types
  // Assuming req has the right shape without validation
  const result = await ledger.add(req.userId, req.amount); // ❌ Not validated
  return result;
}
```

---

### 7. Testing Requirements

**Rule**: All code must have tests. Financial logic requires comprehensive test coverage.

**Requirements**:

**For All Code**:
- ✅ Unit tests for all functions
- ✅ Integration tests for API endpoints
- ✅ Error case tests (what happens when it fails?)
- ✅ Tests must pass before PR merge

**For Financial Logic** (ledger, wallets, earn, redeem):
- ✅ Unit tests for all code paths
- ✅ Integration tests for transaction flows
- ✅ Edge case tests:
  - Zero amounts
  - Negative amounts
  - Boundary conditions (min/max values)
  - Concurrent operations
  - Idempotency (duplicate requests)
  - Insufficient balance
- ✅ Human review required (see `/COPILOT_GOVERNANCE.md` Section 2.1)

**Test Structure**:
```typescript
describe('EarnPoints', () => {
  describe('successful operations', () => {
    it('should award points and create transaction', async () => {
      // Test happy path
    });
    
    it('should handle duplicate request idempotently', async () => {
      // Test idempotency
    });
  });
  
  describe('error handling', () => {
    it('should reject negative amounts', async () => {
      // Test validation
    });
    
    it('should reject missing idempotency key', async () => {
      // Test security
    });
  });
});
```

---

### 8. Security-First Development

**Rule**: Security is not optional. All code must follow security best practices.

**Requirements**:
- ✅ Server-side validation for all inputs
- ✅ Authentication on all endpoints (except `/health`)
- ✅ Authorization checks before operations
- ✅ Rate limiting on all endpoints
- ✅ Idempotency keys for all state changes
- ✅ Logging without exposing sensitive data
- ✅ Environment variables for secrets

**Prohibitions**:
- ❌ No client-side validation only
- ❌ No trusting client-supplied data
- ❌ No secrets in code or logs
- ❌ No PII in logs beyond user IDs
- ❌ No SQL injection vectors (use parameterized queries)
- ❌ No XSS vulnerabilities

**See Also**: `/SECURITY.md` for complete security policy

---

### 9. Documentation Standards

**Rule**: Code must be self-documenting. Add comments only for complex logic.

**Requirements**:
- ✅ Clear, descriptive function and variable names
- ✅ JSDoc for all public functions
- ✅ README files in all directories
- ✅ API changes reflected in `/api/openapi.yaml`
- ✅ Architecture changes reflected in `/docs/UNIVERSAL_ARCHITECTURE.md`

**When to Comment**:
- Complex algorithms or business logic
- Rationale for non-obvious decisions
- Security considerations
- Performance optimizations
- Workarounds for external system issues

**When NOT to Comment**:
- Obvious code (`i++; // increment i` ❌)
- Restating function names
- Outdated comments (update or remove)

**Example**:

**Good**:
```typescript
/**
 * Awards points to a user's wallet with idempotent processing.
 * 
 * @param request - Earn request with userId, amount, reason
 * @returns Transaction response with updated wallet
 * @throws ValidationError if input invalid
 * @throws InsufficientBalanceError if redemption exceeds balance
 */
async function earnPoints(request: EarnRequest): Promise<TransactionResponse> {
  // Check for duplicate using idempotency key to prevent double-award
  const existing = await findByIdempotencyKey(request.idempotencyKey);
  if (existing) {
    return existing; // Return cached result
  }
  
  // ... rest of implementation
}
```

---

## Prohibited Patterns

### 10. Legacy Code Prohibition

**ABSOLUTE PROHIBITION**: No code from `/archive/xxxchatnow-seed/` may be used.

**Rules**:
- ❌ No copying code from archive
- ❌ No adapting patterns from archive
- ❌ No referencing archived files
- ❌ Archive is for historical reference only

**Rationale**:
- Archived code has security vulnerabilities
- Archived code uses incompatible architecture
- Archived code violates current standards
- See `/docs/UNIVERSAL_ARCHITECTURE.md` Section 2.1

**Enforcement**:
- Code reviews will reject any legacy patterns
- Automated checks may flag similar code

---

### 11. Scope Restrictions

**Rule**: RedRoomRewards is a loyalty platform only. Certain code types are prohibited.

**Prohibited in This Repository**:
- ❌ Frontend UI components or views
- ❌ Chat or messaging logic
- ❌ Broadcasting or streaming code
- ❌ Tipping or payment processing
- ❌ Game logic or RNG implementations
- ❌ Media handling or transcoding

**Allowed in This Repository**:
- ✅ Wallet and balance management
- ✅ Ledger and transaction recording
- ✅ Point earning/redemption APIs
- ✅ Audit trail and compliance
- ✅ Admin operations for point management
- ✅ Webhook handlers for external events

**Rationale**: RedRoomRewards accepts **facts** from external systems (user X earned Y points), not **logic** (determine if user should earn points).

**See**: `/docs/UNIVERSAL_ARCHITECTURE.md` Section 1 for detailed scope

---

## Pull Request Guidelines

### 12. PR Description Requirements

**Rule**: All PRs must have clear descriptions following the template.

**Required Elements**:
- ✅ Summary of changes (what and why)
- ✅ Reference to specifications or issues
- ✅ Testing performed (unit, integration, manual)
- ✅ Security considerations
- ✅ Breaking changes (if any)
- ✅ Checklist from `/COPILOT_GOVERNANCE.md`

**Example PR Description**:
```markdown
## Summary
Implements point earning endpoint per `/api/openapi.yaml`.

## Changes
- Added `POST /earn` endpoint handler
- Created `EarnService` with ledger integration
- Added idempotency key handling
- Updated tests for earn flow

## Testing
- ✅ Unit tests: All pass (15 new tests)
- ✅ Integration tests: Earn flow tested
- ✅ Edge cases: Zero, negative, duplicate requests
- ✅ Manual: Tested with curl and Postman

## Security
- Server-side validation implemented
- Idempotency enforced
- Authentication required
- No sensitive data logged

## References
- API Contract: `/api/openapi.yaml` (POST /earn)
- Architecture: `/docs/UNIVERSAL_ARCHITECTURE.md`
```

---

### 13. Commit Message Standards

**Rule**: Use semantic commit messages with clear descriptions.

**Format**: `<type>(<scope>): <description>`

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `test`: Adding or updating tests
- `refactor`: Code restructuring (no behavior change)
- `chore`: Maintenance tasks
- `security`: Security fixes

**Examples**:

**Good**:
```
feat(wallets): implement GET /wallets/{userId} endpoint
fix(ledger): prevent race condition in balance updates
docs(api): update OpenAPI spec with redeem endpoint
test(earn): add edge case tests for negative amounts
security(auth): add rate limiting to all endpoints
```

**Bad**:
```
updated files          ❌ Not descriptive
fix stuff              ❌ Too vague
WIP                    ❌ Should not be committed
asdf                   ❌ Meaningless
```

---

## Compliance and Enforcement

### 14. Mandatory Reviews

**Rule**: Certain code changes require human review before merge.

**Human Review Required**:
- ✅ Ledger logic changes
- ✅ Balance calculation updates
- ✅ Transaction recording modifications
- ✅ Security-sensitive code
- ✅ Authentication/authorization changes
- ✅ Database schema migrations

**Rationale**: Financial integrity is critical. AI-assisted code needs human verification for these sensitive areas.

**See**: `/COPILOT_GOVERNANCE.md` Section 2.1

---

### 15. Automated Checks

**Rule**: All automated checks must pass before merge.

**CI/CD Pipeline**:
- ✅ CodeQL security analysis
- ✅ Unit test suite (100% pass required)
- ✅ Integration test suite
- ✅ TypeScript compilation
- ✅ Dependency security (Dependabot)

**Branch Protection**:
- Required: All status checks pass
- Required: At least one approval
- Required: Up to date with base branch

**See**: `.github/workflows/` for CI configuration

---

### 16. Non-Compliance Consequences

**Rule**: Violations result in PR rejection and required rework.

**Enforcement**:
- Code review will identify violations
- Automated checks will flag issues
- PR cannot merge until compliant
- Merged non-compliant code will be reverted

**Appeal Process**:
- If rule seems incorrect: Propose change to this document
- If uncertainty exists: Ask for clarification
- If exception needed: Explicit approval required with documentation

---

## Quick Reference Checklist

Before generating code, verify:

- [ ] Read existing code in relevant files
- [ ] Reviewed `/api/openapi.yaml` for API contract
- [ ] Checked `/docs/UNIVERSAL_ARCHITECTURE.md` for architectural rules
- [ ] Confirmed no legacy code patterns being used
- [ ] Verified no prohibited functionality (UI, chat, broadcast)
- [ ] Ensured ledger-first approach for point movements
- [ ] Included idempotency keys for state changes
- [ ] Added validation for all inputs
- [ ] Created tests for all code paths
- [ ] Followed minimal-change principle
- [ ] Used TypeScript strict mode (no `any` types)
- [ ] Documented security considerations
- [ ] Prepared clear PR description

---

## Resources

**Required Reading**:
- `/docs/UNIVERSAL_ARCHITECTURE.md` - Architectural principles and prohibitions
- `/COPILOT_GOVERNANCE.md` - Repository-specific AI development rules
- `/SECURITY.md` - Security policy and requirements
- `/DECISIONS.md` - Historical decisions and rationale
- `/api/openapi.yaml` - API contract (source of truth)

**Development References**:
- `/src/README.md` - Source code organization
- `/infra/README.md` - Infrastructure guidelines
- `/docs/specs/` - Feature specifications

---

## Version History

- **2025-12-15**: Initial version
  - Established core principles (repo as source of truth, no backdoors, ledger-first, no invented behavior)
  - Defined code generation rules
  - Documented security and testing requirements
  - Set prohibited patterns and scope restrictions
  - Created PR and commit message guidelines

---

## Feedback and Updates

This is a living document. As we learn from experience:

1. **Found ambiguity?** Submit PR to clarify
2. **Rule needs exception?** Discuss and document
3. **New pattern needed?** Update this file first, then implement

**Owner**: RedRoomRewards Repository Maintainers  
**Review Schedule**: Quarterly or as needed

---

**Remember**: These instructions exist to maintain quality, security, and consistency. Follow them for successful contributions.
