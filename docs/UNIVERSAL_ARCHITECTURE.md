# Universal Architecture and Governance

**Document Type**: Architectural Mandate  
**Status**: Authoritative  
**Last Updated**: 2025-12-15  
**Applies To**: All RedRoomRewards development

---

## Executive Summary

This document defines the mandatory architectural principles and prohibitions for the RedRoomRewards platform. All code, documentation, and development practices must comply with these rules without exception.

---

## 1. System Purpose and Scope

**RedRoomRewards** is a standalone loyalty and rewards platform that:
- Manages user loyalty points and balances
- Records all transactions in immutable ledgers
- Provides APIs for external systems to award/redeem points
- Enforces expiry rules and wallet management
- Maintains comprehensive audit trails

### What RedRoomRewards IS:
- A ledger-based financial transaction system
- A wallet and balance management service
- An auditable point tracking platform
- A well-defined API service with clear boundaries

### What RedRoomRewards IS NOT:
- A broadcasting or streaming platform
- A chat or messaging system
- A UI/UX application with frontend components
- A tipping or payment processor
- A game logic or randomness engine

---

## 2. Strict Prohibitions

### 2.1 Legacy Code Prohibition

**ABSOLUTE PROHIBITION**: No code, patterns, or logic from archived XXXChatNow systems may be referenced, copied, adapted, or used in RedRoomRewards.

- **Archive Location**: `/archive/xxxchatnow-seed/`
- **Purpose**: Historical reference and audit only
- **Access**: View-only for understanding prior architecture mistakes
- **Usage**: ZERO reuse permitted

**Rationale**: Legacy XXXChatNow code contains:
- Architectural patterns incompatible with current design
- Security vulnerabilities and technical debt
- Entangled business logic that violates separation of concerns
- UI/chat/broadcast logic that does not belong in a loyalty system

**Enforcement**:
- Code reviews must verify no legacy patterns exist
- Any PR containing legacy code patterns will be rejected
- This prohibition is documented in `SECURITY.md`

### 2.2 Runtime UI/Chat/Broadcast Code Prohibition

**ABSOLUTE PROHIBITION**: RedRoomRewards must not contain:
- Frontend UI components or views
- Chat message handling or broadcasting logic
- Tipping or direct payment processing
- Streaming or media handling
- Game logic or RNG implementations (except as external input)

**Rationale**: These concerns belong in consumer applications, not the loyalty platform. RedRoomRewards accepts **facts** (user X earned Y points for reason Z), not **logic** (determine if user X should earn points).

---

## 3. Canonical Directory Structure

RedRoomRewards follows this **mandatory** structure:

```
/
├── archive/              # Legacy code (view-only, no reuse)
│   └── xxxchatnow-seed/
├── api/                  # API contracts and specifications
│   └── openapi.yaml
├── src/                  # Application source code
│   ├── ledger/          # Transaction recording
│   ├── wallets/         # Balance management
│   ├── services/        # Business logic
│   └── webhooks/        # External integrations
├── infra/               # Infrastructure and configuration
│   ├── migrations/      # Database migrations
│   ├── db/             # Database configuration
│   └── config/         # Application config
├── docs/                # Documentation
├── .github/             # GitHub workflows and actions
│   └── workflows/
└── [governance files]   # Root-level governance docs
```

**Violations**: Any code placed outside this structure requires architectural review and explicit approval.

---

## 4. Architectural Principles

### 4.1 Server-Side Authority
- All business logic executes server-side
- Clients provide input, server decides outcome
- Never trust client-supplied calculations or decisions

### 4.2 Immutability and Audit
- Ledger entries are write-once, never modified
- Corrections are new transactions, not updates
- All transactions logged with full context
- 7+ year retention for audit compliance

### 4.3 Idempotency
- All financial operations accept idempotency keys
- Duplicate requests return same result without side effects
- Request tracking prevents double-spend

### 4.4 Atomicity
- Balance updates are atomic with ledger entries
- Database transactions ensure consistency
- Rollback on any failure in transaction chain

### 4.5 Optimistic Locking
- Wallet operations use version fields
- Prevent race conditions on concurrent updates
- Retry logic on version conflicts

### 4.6 Clear API Boundaries
- APIs accept **facts**, not **logic**
- Integration points are well-documented contracts
- External systems must handle their own failure modes
- RedRoomRewards focuses solely on loyalty point accounting

---

## 5. Security Requirements

### 5.1 Data Protection
- Never log sensitive data (PII beyond user IDs, secrets, tokens)
- Use environment variables for all secrets
- Encrypt data at rest and in transit

### 5.2 Authentication and Authorization
- All APIs require authentication
- Role-based access control (Admin, Model, Viewer)
- JWT tokens for stateless auth

### 5.3 Input Validation
- Validate all inputs server-side
- Reject malformed or suspicious requests
- Rate limiting on all endpoints

### 5.4 Dependency Security
- Regular security updates via Dependabot
- CodeQL scanning for vulnerabilities
- No dependencies with known critical CVEs

---

## 6. Development Standards

### 6.1 Technology Stack
- **Runtime**: Node.js with TypeScript
- **Database**: MongoDB with Mongoose ODM
- **API**: REST with OpenAPI 3.0 specification
- **Testing**: Comprehensive unit and integration tests

### 6.2 Code Quality
- TypeScript strict mode enabled
- ESLint and Prettier for code style
- 100% test coverage for financial logic

### 6.3 Git Workflow
- Feature branches from `main` or `develop`
- PR reviews required for all changes
- CI/CD checks must pass before merge
- Semantic commit messages

### 6.4 Human Review Requirements
- **Mandatory human review** for:
  - Ledger logic changes
  - Balance calculation updates
  - Transaction recording modifications
  - Security-sensitive code
- See `COPILOT_GOVERNANCE.md` Section 2.1

---

## 7. Integration Philosophy

RedRoomRewards integrates with external systems (e.g., XXXChatNow) via:

### 7.1 API Contract
- Well-defined OpenAPI specifications
- Versioned endpoints for stability
- Backward compatibility requirements
- SLA targets: <300ms response time

### 7.2 Webhook Support
- Incoming webhooks for external events
- Signature verification required
- Idempotent processing
- Async queuing for reliability

### 7.3 Facts Over Logic
- External systems send: "User X earned 100 points for action Y"
- RedRoomRewards does NOT decide if points should be earned
- RedRoomRewards records and manages the transaction
- External systems handle their own business rules

---

## 8. Non-Regression Rules

### 8.1 Forward-Only Development
- Never downgrade or remove existing features without explicit approval
- All changes extend or enhance, never diminish
- Deprecation requires migration path and advance notice

### 8.2 Specification Driven
- All features documented in versioned specs
- Code conflicts with specs require spec update first
- Specs are source of truth, not code

### 8.3 Testing Discipline
- New features require new tests
- Changed code requires updated tests
- All existing tests must continue passing
- No test deletions without justification

---

## 9. Compliance and Enforcement

### 9.1 Code Review Checklist
- Verify no legacy code patterns
- Confirm no prohibited functionality
- Validate directory structure compliance
- Check security requirements met
- Ensure tests provide adequate coverage

### 9.2 Automated Checks
- CodeQL for security vulnerabilities
- Dependabot for dependency updates
- CI/CD pipeline must pass

### 9.3 Consequences of Non-Compliance
- PRs violating these rules will be rejected
- Merged code found in violation must be reverted
- Architectural deviations require explicit approval

---

## 10. Documentation Requirements

All developers must read and comply with:
- This document (`UNIVERSAL_ARCHITECTURE.md`)
- `/COPILOT_GOVERNANCE.md` - AI development rules
- `/SECURITY.md` - Security policy and procedures
- `/DECISIONS.md` - Historical decisions and rationale
- `/api/openapi.yaml` - API contract specification

---

## Version History

- **2025-12-15**: Initial version created during repository foundation cleanup
  - Established legacy code prohibition
  - Defined canonical directory structure
  - Documented architectural principles
  - Set security and compliance requirements

---

## Questions or Clarifications

For questions about this architecture:
1. Review the specification documents in `/docs/`
2. Consult `COPILOT_GOVERNANCE.md` for development rules
3. Discuss in PR reviews for specific cases
4. Update this document via PR for clarifications

**This is a living document.** As architecture evolves, update this document to reflect new decisions while maintaining core principles.
