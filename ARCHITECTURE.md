# Architecture

> **Last Updated**: 2026-01-04
>
> This document describes the architectural principles, domain boundaries, and service separation for RedRoomRewards, a ledger-based loyalty and rewards platform.

---

## Executive Summary

RedRoomRewards follows a **composable, service-oriented architecture** that emphasizes:
- Clear separation between secure financial operations and client-facing features
- Immutable ledger as the source of truth for all point transactions
- Standalone, reusable services with well-defined interfaces
- Server-side authority for all business logic and balance calculations

---

## Domain Boundaries and Service Separation

### Core Principle: Separation of Concerns

RedRoomRewards is **exclusively responsible for**:
- **Loyalty Points Management**: Point accrual, redemption, and expiration
- **Ledger Operations**: Immutable transaction recording and audit trails
- **Wallet Management**: User and model balance tracking with optimistic locking
- **Financial Integrity**: Balance calculations, escrow holds, and settlement authority

RedRoomRewards **explicitly does NOT handle**:
- **Game/UI Logic**: Slot machines, tipping interfaces, chat features
- **Authentication**: User login, session management, OAuth flows
- **Content Delivery**: Video streaming, broadcast management, chat rooms
- **Payment Processing**: Token purchases, credit card processing, payment gateways

### Delineation Between Feature Logic and Secure Processes

#### Secure Financial Processes (RedRoomRewards Authority)
These operations require cryptographic-level integrity and are treated as financial transactions:

1. **Point Accrual**
   - Signup bonuses, referral rewards, promotional credits
   - Server-side validation of eligibility and amount caps
   - Idempotent operations with request tracking

2. **Point Redemption**
   - Escrow holds for pending transactions
   - Settlement/refund authority through queue-based processing
   - Prevention of double-spend and balance manipulation

3. **Balance Management**
   - Optimistic locking to prevent race conditions
   - Three-state tracking: available, escrowed, earned
   - Point-in-time snapshots and reconciliation

4. **Audit and Compliance**
   - Immutable ledger entries (append-only, never modified)
   - 7-year retention for regulatory compliance
   - Comprehensive transaction metadata and traceability

#### Feature/UI Logic (External System Authority)
These operations occur in client systems (e.g., XXXChatNow) and provide **facts** to RedRoomRewards:

1. **Game Outcomes**
   - Slot machine results, win/loss determinations
   - RNG execution and outcome generation
   - Client submits outcome as fact; RedRoomRewards processes point movement

2. **User Interactions**
   - UI rendering, button clicks, form submissions
   - Real-time chat and broadcast features
   - Tipping, gifting, and social interactions

3. **Content Management**
   - Promotion design and card generation
   - Dashboard layouts and reporting tools
   - User profile and preference management

### Integration Pattern: Facts, Not Logic

External systems (like XXXChatNow) submit **facts** to RedRoomRewards via API:
```
POST /ledger/transactions
{
  "idempotencyKey": "unique-request-id",
  "userId": "user-123",
  "amount": 50,
  "reason": "slot_machine_win",
  "metadata": {
    "gameId": "slot-xyz",
    "outcome": "triple-cherry"
  }
}
```

RedRoomRewards:
- Validates the request (idempotency, user exists, amount within bounds)
- Records the transaction in the immutable ledger
- Updates wallet balances atomically
- Returns success/failure without executing game logic

---

## Boundaries per User Defaults
- Clearly outline the separation of concerns in user settings and defaults
- Adherence to default user boundaries ensures predictable and reliable system behavior
- Default values (e.g., expiration days, bonus multipliers) are configurable but validated server-side
- No client can override security-critical defaults without explicit API authorization

---

## Domain Clarity
- Define domains with explicit scope, ensuring each domain has a dedicated function and responsibility
- Promotion design and card generation occur on the XXXChatNow system, while processing, enforcement of multipliers, and expiration logic remain strictly within RedRoomRewards
- User dashboards and reporting tools are implemented within client integrations, but RedRoomRewards ensures ledger integrity and accuracy
- Each domain maintains its own data models, validation rules, and business logic

---

## Clean Interfaces
- Foster minimal coupling by designing transparent and well-documented interfaces
- All promotion payloads passed to RedRoomRewards must specify required fields such as `user_id`, `membership_level`, and point allocations
- Optional overrides like `bonus_expiration_days` may modify defaults within permitted ranges
- API contracts are defined in OpenAPI 3.0 specification (`/api/openapi.yaml`)
- All endpoints enforce strict input validation and return standardized error responses

---

## Service Composition Over Monoliths

RedRoomRewards follows a **composable service architecture** to enable:
- **Independent Scaling**: Services can scale based on their specific load patterns
- **Fault Isolation**: Failures in one service don't cascade to others
- **Testability**: Each service has clear inputs/outputs and can be tested independently
- **Maintainability**: Changes to one service don't require redeploying the entire system

### Core Services

#### 1. Ledger Service
- **Responsibility**: Immutable transaction recording
- **Interface**: Append-only writes, read queries with filtering
- **Dependencies**: Database only (no external service calls)
- **Guarantees**: Atomicity, idempotency, 7-year retention

#### 2. Wallet Service
- **Responsibility**: User and model balance management
- **Interface**: Balance queries, escrow operations, settlement
- **Dependencies**: Ledger service for transaction recording
- **Guarantees**: Optimistic locking, no double-spend, eventual consistency

#### 3. Point Accrual Service
- **Responsibility**: Credit operations (bonuses, referrals, promotions)
- **Interface**: Award points with validation and caps
- **Dependencies**: Wallet service, ledger service
- **Guarantees**: Idempotency, eligibility validation, audit trails

#### 4. Point Redemption Service
- **Responsibility**: Debit operations (purchases, redemptions)
- **Interface**: Escrow holds, settlement/refund processing
- **Dependencies**: Wallet service, ledger service, queue service
- **Guarantees**: No overspending, settlement authority, rollback support

#### 5. Point Expiration Service
- **Responsibility**: Scheduled expiration of aged points
- **Interface**: Batch processing with configurable rules
- **Dependencies**: Wallet service, ledger service
- **Guarantees**: Fair expiration (FIFO), audit trails, no retroactive changes

#### 6. Admin Operations Service
- **Responsibility**: Manual adjustments, refunds, corrections
- **Interface**: Administrative actions with enhanced logging
- **Dependencies**: Wallet service, ledger service
- **Guarantees**: Authorization checks, full audit trails, human review logging

### Service Communication Principles

1. **Synchronous for Reads**: Direct service-to-service calls for queries
2. **Asynchronous for State Changes**: Queue-based processing for mutations
3. **Event Broadcasting**: Publish domain events for cross-system integration
4. **No Circular Dependencies**: Services form a directed acyclic graph (DAG)

### Token and Purchase Logic Separation

**XXXChatNow Handles**:
- Credit card processing and payment gateway integration
- Token purchase transactions and receipt generation
- Refund policies and chargeback handling
- Tax calculation and compliance

**RedRoomRewards Handles**:
- Point accrual when tokens are purchased (as a fact from XXXChatNow)
- Point redemption when points are spent
- Ledger entries for all point movements
- Liability tracking and reconciliation

This separation ensures:
- Financial regulations are handled in appropriate domains
- Payment card industry (PCI) compliance is isolated to payment systems
- RedRoomRewards can operate independently of payment provider changes
- Clear audit trails show the relationship between purchases and points

---

## Architectural Prohibitions

⚠️ **The following patterns are strictly forbidden**:

1. **No Monolithic Coupling**: Services must not share database connections or in-memory state
2. **No Client-Side Balance Calculations**: All balance logic must execute server-side
3. **No Mutable Ledger Entries**: Corrections must be new transactions, never updates
4. **No Synchronous Chains**: Avoid call chains longer than 3 services deep
5. **No Secrets in Code**: Environment variables or secret management only
6. **No Backdoors**: No undocumented overrides or hidden admin endpoints

---

## Change Log

### 2026-01-04
- Expanded architecture document with comprehensive service separation details
- Added delineation between secure financial processes and feature/UI logic
- Documented composable service architecture with clear responsibilities
- Clarified integration pattern (facts, not logic) for external systems
- Added architectural prohibitions and service communication principles

### 2026-01-02
- Updated to clarify promotion payload responsibilities between XXXChatNow and RedRoomRewards

---

**See Also**:
- [`/docs/UNIVERSAL_ARCHITECTURE.md`](/docs/UNIVERSAL_ARCHITECTURE.md) - Foundational architectural principles
- [`/docs/WALLET_ESCROW_ARCHITECTURE.md`](/docs/WALLET_ESCROW_ARCHITECTURE.md) - Wallet escrow implementation details
- [`/docs/EVENT_ARCHITECTURE.md`](/docs/EVENT_ARCHITECTURE.md) - Event-driven patterns
- [`/api/openapi.yaml`](/api/openapi.yaml) - API contract specification