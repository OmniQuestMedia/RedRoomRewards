# COPILOT_GOVERNANCE.md

**Repository-Specific GitHub Copilot Governance**

This document extends the organization-level policy and defines specific rules for the RedRoomRewards repository.

**Organization Policy:** See [OmniQuestMedia/Org-Policies/COPILOT_GOVERNANCE_ORG.md](https://github.com/OmniQuestMedia/Org-Policies/blob/main/COPILOT_GOVERNANCE_ORG.md)

---

## Section 1: Repository Summary

**RedRoomRewards** is a loyalty and rewards platform designed to manage customer incentives across the XXXChatNow ecosystem.

### Key Characteristics:
- **Technology Stack:** Node.js and TypeScript APIs
- **Core Functionality:** Ledger-based system for managing user accounts and point balances
- **Architecture:** Clean separation from XXXChatNow core platform with defined API boundaries
- **Purpose:** Manages loyalty points, model promo wallets, expiry rules, and comprehensive audit trails

### Domain Ownership:
- Loyalty points (only)
- Model promo wallets
- Expiry rules and enforcement
- Ledgers and reconciliation
- Immutable transaction records

---

## Section 2: Extra Repository-Specific Rules

When working on RedRoomRewards code, GitHub Copilot and AI assistants must adhere to these additional rules:

### 2.1 Ledger and Balance Integrity

**Critical:** All point movements are financial transactions and must be treated with the same rigor as monetary transactions.

- **Human Review Required:** All changes to ledger logic, balance calculations, or transaction recording MUST be reviewed by a human before merging
- **Comprehensive Testing:** Changes to financial logic MUST include:
  - Unit tests for all code paths
  - Integration tests for transaction flows
  - Edge case tests (zero amounts, negative scenarios, boundary conditions)
- **Immutability:** Ledger entries are immutable once created; corrections must be new transactions
- **Atomicity:** All balance updates must use database transactions with proper rollback handling
- **Optimistic Locking:** Wallet operations must use optimistic locking to prevent race conditions

### 2.2 Idempotency and Double-Spend Prevention

**Critical:** The system must prevent duplicate point awards or redemptions.

- **Idempotency Keys:** All award and redemption endpoints MUST accept and enforce idempotency keys
- **Duplicate Detection:** The system MUST detect and prevent processing of duplicate requests
- **Request Tracking:** Every financial operation must be traceable to a unique request identifier
- **Retry Safety:** API calls must be safe to retry without creating duplicate transactions
- **State Validation:** Before any point movement, validate current state and expected state match

### 2.3 Safe and Auditable Logging

**Critical:** All financial operations must be comprehensively logged without exposing sensitive data.

- **Audit Trails:** Every point movement must create an immutable audit log entry with:
  - Timestamp
  - User/model identifier
  - Amount and direction (credit/debit)
  - Source/reason
  - Request identifier
  - Previous and new balance
- **Security:** Logs MUST NOT contain:
  - API keys or secrets
  - Personal identifying information beyond user IDs
  - Session tokens or authentication credentials
- **Retention:** Audit logs must be retained according to regulatory requirements
- **Tamper Evidence:** Audit logs should be write-only and include integrity verification

### 2.4 Documented API Boundary with XXXChatNow

**Critical:** Integration points must be explicitly defined and documented.

- **Contract Definition:** All API endpoints called by XXXChatNow must be documented with:
  - Endpoint path and HTTP method
  - Request/response schemas
  - Error codes and meanings
  - Performance SLAs (<300ms target)
  - Authentication requirements
- **Ownership Clarity:** RedRoomRewards APIs MUST NOT:
  - Make decisions about game logic or randomness
  - Know details about UI/UX presentation
  - Implement business rules belonging to XXXChatNow
- **Facts Not Logic:** Integration points accept factual data (amounts, user IDs, reasons) not game logic
- **Graceful Degradation:** XXXChatNow must be able to function if loyalty service is temporarily unavailable
- **Version Management:** API changes must be versioned and backward compatible

---

## Section 3: Required Documentation

The following documentation files MUST be maintained and kept current in this repository:

### 3.1 COPILOT_GOVERNANCE.md (This File)
- **Purpose:** Defines repository-specific rules for AI-assisted development
- **Update Frequency:** Review quarterly or when architectural changes occur
- **Owner:** Repository maintainers

### 3.2 COPILOT_REPO_BRIEFING.md
- **Purpose:** Provides detailed context about repository structure, technology choices, and development practices
- **Required Content:**
  - Architecture overview
  - Key design decisions and rationale
  - Development setup instructions
  - Testing strategy
  - Deployment process
- **Update Frequency:** Update when significant architectural changes occur

### 3.3 COPILOT_PR_CHECKLIST.md
- **Purpose:** Defines required checks and validations before PR approval
- **Required Content:**
  - Code quality checks
  - Test coverage requirements
  - Security review items
  - Documentation updates
  - Financial logic review requirements
- **Update Frequency:** Update when process changes occur

---

## Compliance and Enforcement

All pull requests must demonstrate compliance with:
1. Organization-level Copilot governance policies
2. Repository-specific rules defined in this document
3. Completion of items in COPILOT_PR_CHECKLIST.md

Non-compliance may result in PR rejection and required rework.

---

**Last Updated:** 2025-12-11
**Review Schedule:** Quarterly or as needed
**Document Owner:** RedRoomRewards Repository Maintainers
