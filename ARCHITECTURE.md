# Architecture

**Repository**: RedRoomRewards  
**Last Updated**: 2026-01-04  
**Status**: Authoritative

---

## Executive Summary

This document defines the architectural boundaries, domain responsibilities, and service composition principles for the RedRoomRewards loyalty platform. All development must adhere to these foundational principles to maintain system integrity, security, and scalability.

---

## 1. Architectural Domains and Boundaries

### 1.1 RedRoomRewards Domain (This Repository)

**Core Responsibility**: Loyalty point accounting, ledger management, and financial integrity.

**Owned Functions**:
- ✅ Loyalty point ledger (immutable transaction log)
- ✅ Wallet and balance management
- ✅ Point accrual and redemption APIs
- ✅ Expiration rules and enforcement
- ✅ Audit trails and compliance reporting
- ✅ Idempotency and duplicate prevention
- ✅ Admin operations for point adjustments

**Boundary Rules**:
- Accepts **facts** from external systems (user X earned Y points for reason Z)
- Does NOT make business decisions about earning or redemption eligibility
- Does NOT contain UI, game logic, or randomness engines
- Does NOT process payments or handle tipping
- Server-side authority for all financial operations

### 1.2 External System Domain (XXXChatNow and Others)

**Core Responsibility**: User experience, content delivery, and business logic.

**Owned Functions**:
- ✅ Promotion design and card generation
- ✅ User authentication and session management
- ✅ UI/UX presentation and dashboards
- ✅ Chat, broadcasting, and streaming
- ✅ Game logic and RNG implementations
- ✅ Business rules for earning/redemption eligibility
- ✅ Token and purchase processing

**Integration with RedRoomRewards**:
- Sends point award/redemption requests with full context
- Receives wallet balance and transaction confirmations
- Handles own failure modes and retry logic
- Must respect idempotency requirements

### 1.3 Separation of Concerns

**Financial vs. Feature Logic**:
```
❌ PROHIBITED: Feature modules deciding to settle/refund directly
✅ REQUIRED: Feature modules request escrow, Queue authorizes settlement

❌ PROHIBITED: UI/game logic in RedRoomRewards
✅ REQUIRED: Clear API boundaries accepting structured facts

❌ PROHIBITED: RedRoomRewards making business decisions
✅ REQUIRED: External systems send decisions as facts
```

**Security Boundaries**:
- Authentication/authorization: Handled at API gateway before RedRoomRewards
- Financial operations: Server-side validation and execution only
- PII handling: Minimal (user IDs only, no names/emails in financial records)
- Secrets management: Environment variables, never in code

---

## 2. Boundaries per User Defaults

### 2.1 Default Behavior

**Principle**: Predictable and reliable system behavior through well-defined defaults.

**User-Level Defaults**:
- Point expiration: 365 days from issuance (configurable per promotion)
- Wallet currency: "points" (system standard)
- Initial balance: 0 points
- Membership level: Determined by external system
- Time zone: UTC for all timestamps

**Promotion-Level Overrides**:
- Custom expiration days via `bonus_expiration_days` field
- Special multipliers for specific membership levels
- Category-specific earning rates

**Enforcement**:
- Defaults applied automatically when optional fields omitted
- Overrides validated against acceptable ranges
- All defaults documented in API specifications
- Changes to defaults require migration path

### 2.2 Configuration Management

**Project Defaults Location**:
- `/infra/config/defaults.json` - System-wide defaults
- Environment variables for deployment-specific overrides
- API contract defines required vs. optional fields

**Change Control**:
- Default changes require architectural review
- Backward compatibility mandatory
- Migration scripts for existing data
- Version documentation in changelog

---

## 3. Domain Clarity

### 3.1 Explicit Scope Definition

**RedRoomRewards Scope**:
```
┌─────────────────────────────────────────┐
│         RedRoomRewards Domain           │
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────┐  │
│  │  Ledger  │  │ Wallets  │  │Queue │  │
│  └────┬─────┘  └────┬─────┘  └──┬───┘  │
│       │             │            │      │
│  Immutable    Balance Mgmt   Authority │
│  Transaction  with Escrow    & Settle  │
│                                         │
└─────────────────────────────────────────┘
         ▲                    │
         │ Facts              │ Confirmations
         │                    ▼
┌─────────────────────────────────────────┐
│      External Systems (XXXChatNow)      │
│                                         │
│  Business Logic │ UI/UX │ Auth │ Games │
└─────────────────────────────────────────┘
```

### 3.2 Responsibility Matrix

| Function | RedRoomRewards | External System |
|----------|----------------|-----------------|
| Promotion Design | ❌ | ✅ |
| Card Generation | ❌ | ✅ |
| Promotion Execution | ✅ | ❌ |
| Multiplier Enforcement | ✅ | ❌ |
| Expiration Logic | ✅ | ❌ |
| User Dashboard | ❌ | ✅ |
| Reporting Tools | ❌ | ✅ |
| Ledger Integrity | ✅ | ❌ |
| Balance Accuracy | ✅ | ❌ |
| Game/RNG Logic | ❌ | ✅ |
| Win Determination | ❌ | ✅ |

### 3.3 Data Flow Principles

**Inbound to RedRoomRewards**:
1. External system determines user earned points
2. Request sent with: `user_id`, `amount`, `reason`, `idempotency_key`
3. RedRoomRewards validates and records transaction
4. Balance updated atomically with ledger entry
5. Confirmation returned with transaction ID

**Outbound from RedRoomRewards**:
1. External system queries wallet balance
2. RedRoomRewards returns current balance and state
3. Optional: Transaction history for reconciliation
4. Webhooks for balance change notifications (if configured)

---

## 4. Clean Interfaces

### 4.1 API Design Principles

**Minimal Coupling**:
- RESTful APIs with versioned endpoints
- OpenAPI 3.0 specification as source of truth
- Clear request/response schemas
- Structured error codes and messages
- Idempotency keys for all state changes

**Transparency**:
- All endpoints documented with examples
- Business rules explicit in specifications
- No hidden behavior or side effects
- Predictable error handling
- Comprehensive logging for debugging

### 4.2 Promotion Payload Requirements

**Required Fields**:
```typescript
{
  user_id: string;              // External system user identifier
  amount: number;               // Points to award (positive integer)
  reason: string;               // Reason code (enum)
  idempotency_key: string;      // UUID for duplicate prevention
  membership_level?: string;    // For multiplier calculations
}
```

**Optional Overrides**:
```typescript
{
  bonus_expiration_days?: number;  // Override default 365 days
  metadata?: Record<string, any>;  // Contextual information
  queue_priority?: string;         // For settlement ordering
}
```

**Validation Rules**:
- `user_id`: Non-empty string, max 255 chars
- `amount`: Positive integer, max 1,000,000 per transaction
- `reason`: Must be from predefined enum
- `idempotency_key`: Valid UUID format
- `bonus_expiration_days`: 1-730 days (if specified)

### 4.3 Interface Contracts

**SLA Commitments**:
- Response time: <300ms for balance queries
- Response time: <500ms for transaction recording
- Availability: 99.9% uptime target
- Idempotency: 24-hour window for duplicate detection

**Error Handling**:
- 4xx errors: Client issues (bad request, unauthorized)
- 5xx errors: Server issues (retry with exponential backoff)
- Structured error responses with error codes
- Request tracing via X-Request-ID header

---

## 5. Service Composition

### 5.1 Small, Composable Services

**Microservices Approach**:
```
RedRoomRewards (Monorepo)
├── Ledger Service       # Transaction recording
├── Wallet Service       # Balance management
├── Queue Service        # Settlement authority
├── Expiration Service   # Point expiration
├── Admin Service        # Manual operations
└── Webhook Service      # External notifications
```

**Service Characteristics**:
- Single responsibility per service
- Independent deployability (future state)
- Shared data layer with access control
- Inter-service communication via well-defined interfaces
- Fault isolation and graceful degradation

### 5.2 Composition Patterns

**Request Flow Example - Point Earning**:
```
1. External System → POST /earn endpoint
2. API Gateway → Authentication/authorization
3. Wallet Service → Idempotency check
4. Ledger Service → Record transaction
5. Wallet Service → Update balance (atomic)
6. Response → Transaction confirmation
7. Webhook Service → Notify subscribers (async)
```

**Escrow and Settlement**:
```
1. Feature Module → Request escrow via Wallet Service
2. Wallet Service → Move points to escrow state
3. Queue Service → Authorize settlement/refund
4. Wallet Service → Complete settlement or refund
5. Ledger Service → Record final transaction
```

### 5.3 Strict Separation

**Token/Purchase Logic (External)**:
- Payment processing
- Token purchase flows
- Transaction fees
- Chargeback handling
- Payment gateway integration

**Points/Ledger Logic (RedRoomRewards)**:
- Point accrual and redemption
- Ledger transaction recording
- Balance reconciliation
- Liability tracking
- Audit trail maintenance

**Boundary Enforcement**:
- No payment logic in RedRoomRewards
- No loyalty logic in payment systems
- Clear API contracts between systems
- Each system owns its data and decisions

---

## 6. Implementation Principles

### 6.1 Server-Side Authority

**All Financial Operations**:
- Balance calculations on server only
- Transaction validation server-side
- Business rules enforced server-side
- Never trust client-supplied amounts or decisions

### 6.2 Immutability

**Ledger Design**:
- Append-only transaction log
- No updates or deletes on transactions
- Corrections via compensating transactions
- Complete audit trail for compliance

### 6.3 Idempotency

**Duplicate Prevention**:
- Mandatory idempotency keys
- 24-hour cache for duplicate detection
- Same result returned for duplicate requests
- No side effects on retry

### 6.4 Atomicity

**Transaction Integrity**:
- Database transactions for multi-step operations
- Rollback on any failure
- Ledger and wallet updates are atomic
- Consistent state always maintained

### 6.5 Security First

**Security Principles**:
- Authentication required on all endpoints (except health check)
- Server-side input validation
- No secrets in code or logs
- PII minimization (user IDs only)
- Rate limiting and abuse prevention

---

## 7. Documentation and Governance

**Required Reading**:
- `/docs/UNIVERSAL_ARCHITECTURE.md` - Detailed architectural guidance
- `/COPILOT_GOVERNANCE.md` - AI development rules
- `/SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` - Security principles
- `/api/openapi.yaml` - API contract specification

**Decision Records**:
- All architectural decisions documented in `/DECISIONS.md`
- Changes require review and approval
- Rationale captured for future reference

---

## 8. Version History

- **2026-01-04**: Comprehensive architecture documentation
  - Expanded domain boundaries and responsibilities
  - Detailed separation of concerns
  - Service composition patterns
  - Clean interface specifications
  - Implementation principles
- **2026-01-02**: Updated promotion payload responsibilities
- **2025-12-15**: Initial architecture established

---

## Summary

RedRoomRewards is a loyalty platform with **clear boundaries**, **clean interfaces**, and **composable services**. It accepts facts from external systems, maintains financial integrity through immutable ledgers, and provides reliable APIs for point management.

**Key Takeaways**:
- ✅ Separation of UI/game/feature logic from financial operations
- ✅ Small, focused services with single responsibilities
- ✅ Server-side authority for all financial decisions
- ✅ Immutable audit trails for compliance
- ✅ Clean API boundaries with external systems

**For questions or clarifications**, consult the documentation hierarchy and submit PRs for updates.