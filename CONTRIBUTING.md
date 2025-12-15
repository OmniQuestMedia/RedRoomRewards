# Contributing to RedRoomRewards

Thank you for your interest in contributing to RedRoomRewards! This document provides guidelines and instructions for contributing to this project.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Security](#security)
- [Questions](#questions)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive experience for everyone. We expect all contributors to:

- Be respectful and considerate
- Accept constructive criticism gracefully
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment or discriminatory language
- Personal attacks or trolling
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

### Enforcement

Instances of unacceptable behavior may be reported to the project maintainers. All complaints will be reviewed and investigated promptly and fairly.

---

## Getting Started

### Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Version 9 or higher
- **MongoDB**: Version 6 or higher (for local development)
- **Git**: For version control
- **TypeScript**: Familiarity with TypeScript required

### Setting Up Development Environment

1. **Fork the Repository**
   ```bash
   # Fork via GitHub UI, then clone your fork
   git clone https://github.com/YOUR_USERNAME/RedRoomRewards.git
   cd RedRoomRewards
   ```

2. **Add Upstream Remote**
   ```bash
   git remote add upstream https://github.com/OmniQuestMedia/RedRoomRewards.git
   ```

3. **Install Dependencies** (when package.json exists)
   ```bash
   npm install
   ```

4. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

5. **Verify Setup** (when implemented)
   ```bash
   npm run build
   npm test
   ```

### Required Reading

Before contributing, please read:

- **[COPILOT_INSTRUCTIONS.md](COPILOT_INSTRUCTIONS.md)** - Core development rules
- **[docs/UNIVERSAL_ARCHITECTURE.md](docs/UNIVERSAL_ARCHITECTURE.md)** - Architectural principles
- **[COPILOT_GOVERNANCE.md](COPILOT_GOVERNANCE.md)** - Repository-specific rules
- **[SECURITY.md](SECURITY.md)** - Security policy
- **[api/openapi.yaml](api/openapi.yaml)** - API contract

---

## Development Workflow

### 1. Choose an Issue

- Browse [open issues](https://github.com/OmniQuestMedia/RedRoomRewards/issues)
- Look for issues tagged `good first issue` if you're new
- Comment on the issue to claim it and avoid duplicate work

### 2. Create a Feature Branch

```bash
# Update your local main branch
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/your-feature-name
# OR
git checkout -b fix/your-bug-fix
```

**Branch Naming Convention**:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `test/` - Test additions
- `refactor/` - Code refactoring
- `security/` - Security fixes

### 3. Make Your Changes

Follow these principles:

**Minimal Changes**:
- Change only what's necessary for your task
- Don't refactor unrelated code
- Preserve existing working code
- Keep PRs focused on a single concern

**Code Quality**:
- Use TypeScript strict mode
- No `any` types without justification
- Follow existing patterns in the codebase
- Write self-documenting code

**Security**:
- Validate all inputs server-side
- Use environment variables for secrets
- Never commit credentials
- Follow security guidelines in [SECURITY.md](SECURITY.md)

### 4. Test Your Changes

**Required Tests**:
- Unit tests for all new functions
- Integration tests for API endpoints
- Edge case tests for financial logic
- All existing tests must still pass

**Run Tests**:
```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
npm run test:coverage      # With coverage report
```

**Financial Logic Testing**:

If your changes affect ledger, wallets, earn, or redeem:
- ✅ Test all code paths
- ✅ Test edge cases (zero, negative, boundaries)
- ✅ Test idempotency (duplicate requests)
- ✅ Test concurrent operations
- ✅ Test error conditions

### 5. Lint and Format

```bash
npm run lint               # Check linting
npm run lint:fix          # Auto-fix issues
npm run format            # Format code
```

### 6. Commit Your Changes

Use semantic commit messages:

```bash
git add .
git commit -m "feat(wallets): implement GET /wallets/{userId} endpoint"
```

**Commit Message Format**: `<type>(<scope>): <description>`

**Types**:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `test` - Testing
- `refactor` - Code restructuring
- `security` - Security fix

**Good Examples**:
```
feat(earn): add POST /earn endpoint with idempotency
fix(ledger): prevent race condition in transaction creation
docs(api): update OpenAPI spec with webhook endpoints
test(redeem): add edge case tests for insufficient balance
security(auth): implement rate limiting on all endpoints
```

### 7. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

---

## Coding Standards

### TypeScript Guidelines

**Type Safety**:
```typescript
// ✅ Good: Explicit types
function earnPoints(request: EarnRequest): Promise<TransactionResponse> {
  // ...
}

// ❌ Bad: Using any
function earnPoints(request: any): Promise<any> {
  // ...
}
```

**Validation**:
```typescript
// ✅ Good: Validate inputs
if (!request.userId || typeof request.userId !== 'string') {
  throw new ValidationError('Invalid userId');
}

// ❌ Bad: Trust client data
const wallet = await getWallet(request.userId); // Not validated
```

**Error Handling**:
```typescript
// ✅ Good: Proper error handling
try {
  const result = await ledger.createTransaction(data);
  return result;
} catch (error) {
  logger.error('Transaction creation failed', { error, data });
  throw new TransactionError('Failed to create transaction');
}

// ❌ Bad: Swallowing errors
try {
  return await ledger.createTransaction(data);
} catch (error) {
  return null; // Lost error context
}
```

### Architectural Patterns

**Ledger-First**:
```typescript
// ✅ Good: Create transaction, then update balance
const transaction = await ledger.createTransaction({
  userId,
  amount,
  type: 'credit',
  reason,
  idempotencyKey
});
const wallet = await wallets.updateBalance(userId, transaction);

// ❌ Bad: Update balance directly
wallet.balance += amount; // No audit trail
await wallet.save();
```

**Idempotency**:
```typescript
// ✅ Good: Check for duplicate requests
const existing = await findByIdempotencyKey(idempotencyKey);
if (existing) {
  return existing; // Return cached result
}

// ❌ Bad: Process every request
const transaction = await createTransaction(data); // Duplicate risk
```

### File Organization

```
src/
├── ledger/
│   ├── ledger.service.ts      # Business logic
│   ├── ledger.model.ts        # Data models
│   ├── ledger.controller.ts   # API handlers
│   └── __tests__/             # Tests
│       └── ledger.service.test.ts
├── wallets/
│   ├── wallets.service.ts
│   ├── wallets.model.ts
│   └── __tests__/
└── ...
```

---

## Testing Requirements

### Test Coverage

- **Minimum**: 80% code coverage overall
- **Financial Logic**: 100% coverage required
- **All PRs**: Must include tests for new code

### Test Structure

```typescript
describe('EarnPoints', () => {
  beforeEach(async () => {
    // Setup test fixtures
  });

  afterEach(async () => {
    // Cleanup
  });

  describe('successful operations', () => {
    it('should award points and create transaction', async () => {
      const request = {
        userId: 'user123',
        amount: 100,
        reason: 'test_award',
        idempotencyKey: 'key123'
      };

      const result = await earnPoints(request);

      expect(result.transaction).toBeDefined();
      expect(result.transaction.amount).toBe(100);
      expect(result.wallet.balance).toBe(100);
    });

    it('should handle duplicate requests idempotently', async () => {
      const request = { /* ... */ };
      
      const result1 = await earnPoints(request);
      const result2 = await earnPoints(request); // Same idempotency key
      
      expect(result1.transaction.id).toBe(result2.transaction.id);
    });
  });

  describe('error handling', () => {
    it('should reject negative amounts', async () => {
      const request = { userId: 'user123', amount: -100, /* ... */ };
      
      await expect(earnPoints(request)).rejects.toThrow(ValidationError);
    });
  });
});
```

### Running Specific Tests

```bash
npm test -- ledger.service.test.ts    # Single file
npm test -- --watch                    # Watch mode
npm test -- --coverage                 # With coverage
```

---

## Pull Request Process

### Before Submitting

**Checklist**:
- [ ] Code follows style guidelines (linter passes)
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Tests added/updated (all passing)
- [ ] Documentation updated if needed
- [ ] No breaking changes (or documented if necessary)
- [ ] Security considerations addressed
- [ ] No secrets or credentials in code

### Creating the PR

1. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open PR on GitHub**:
   - Navigate to the original repository
   - Click "New Pull Request"
   - Select your fork and branch
   - Fill out the PR template

### PR Description Template

```markdown
## Summary
Brief description of what this PR does and why.

## Changes
- List of specific changes made
- Another change
- One more change

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed
- [ ] All tests passing

## Security Considerations
- Server-side validation: Yes/No
- Idempotency: Yes/No/N/A
- Authentication required: Yes/No/N/A
- Sensitive data handling: Details if applicable

## Breaking Changes
None / [Description of breaking changes and migration path]

## References
- Issue #123
- Related to API contract: /api/openapi.yaml
- Spec: /docs/specs/feature-spec.md
```

### Review Process

1. **Automated Checks**: CI/CD pipeline runs
   - CodeQL security analysis
   - Super-Linter
   - Test suite
   - Build verification

2. **Human Review**: Maintainer reviews code
   - For financial logic: **Mandatory human review**
   - For other code: Review within 3-5 business days

3. **Address Feedback**:
   - Make requested changes
   - Push updates to same branch
   - Respond to comments

4. **Approval and Merge**:
   - Requires: All checks pass + approval(s)
   - Merge: Squash and merge (default)

---

## Security

### Reporting Vulnerabilities

**Do NOT** open public issues for security vulnerabilities.

**Instead**:
- Email: security@omniquestmedia.com (or appropriate contact)
- Include: Detailed description, steps to reproduce, impact assessment
- See: [SECURITY.md](SECURITY.md) for full process

### Security Guidelines

- ✅ Validate all inputs server-side
- ✅ Use environment variables for secrets
- ✅ Never commit credentials or API keys
- ✅ Implement authentication on all endpoints
- ✅ Use idempotency keys for state changes
- ✅ Log operations without exposing sensitive data

### Prohibited

- ❌ No legacy code from `/archive/`
- ❌ No backdoors or bypass mechanisms
- ❌ No secrets in code or logs
- ❌ No client-side validation only

---

## Questions

### Where to Ask

- **General Questions**: [GitHub Discussions](https://github.com/OmniQuestMedia/RedRoomRewards/discussions)
- **Bug Reports**: [GitHub Issues](https://github.com/OmniQuestMedia/RedRoomRewards/issues)
- **Security Issues**: security@omniquestmedia.com

### Documentation

- **Architecture**: [docs/UNIVERSAL_ARCHITECTURE.md](docs/UNIVERSAL_ARCHITECTURE.md)
- **API Contract**: [api/openapi.yaml](api/openapi.yaml)
- **Development Rules**: [COPILOT_INSTRUCTIONS.md](COPILOT_INSTRUCTIONS.md)
- **Governance**: [COPILOT_GOVERNANCE.md](COPILOT_GOVERNANCE.md)

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## Acknowledgments

Thank you for contributing to RedRoomRewards! Your efforts help build a secure, reliable loyalty platform.

**Key Resources**:
- [COPILOT_INSTRUCTIONS.md](COPILOT_INSTRUCTIONS.md) - Mandatory reading
- [docs/UNIVERSAL_ARCHITECTURE.md](docs/UNIVERSAL_ARCHITECTURE.md) - Architecture guide
- [SECURITY.md](SECURITY.md) - Security policy

---

**Questions?** Open a [GitHub Discussion](https://github.com/OmniQuestMedia/RedRoomRewards/discussions) or review our documentation.
