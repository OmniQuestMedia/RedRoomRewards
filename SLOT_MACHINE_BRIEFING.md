# Slot Machine Implementation Briefing

**Repository**: RedRoomRewards  
**Last Updated**: 2026-01-04  
**Status**: Authoritative  
**Version**: 1.0

---

## Executive Summary

This document defines the slot machine feature implementation within the RedRoomRewards loyalty platform. It emphasizes the boundary between game logic (external systems) and point/balance management (RedRoomRewards), establishes the loyalty service as standalone and deterministic, and outlines the behavior rules for slot machine integration.

**Core Principle**: RedRoomRewards manages points and balances only. All game logic, RNG, and win determination occur in external systems.

---

## 1. Slot Machine Feature Overview

### 1.1 Purpose

Provide a Vegas-style slot machine experience for viewers during live broadcasts where:
- Users spend loyalty points to play
- External system determines win/loss outcomes
- RedRoomRewards manages point deduction and awards
- All operations are server-side and abuse-resistant

### 1.2 Scope

**RedRoomRewards Responsibilities** (This Repository):
- ✅ Point balance management
- ✅ Escrow for pending spins
- ✅ Settlement of wins/losses
- ✅ Refund processing for failures
- ✅ Audit trail of all transactions
- ✅ Balance reconciliation

**External System Responsibilities** (XXXChatNow or Game Service):
- ✅ Slot machine UI/UX
- ✅ RNG (Random Number Generator)
- ✅ Win determination logic
- ✅ Reel animation and presentation
- ✅ Game rules and paytables
- ✅ User interaction handling

### 1.3 Integration Model

```
User Action → External System → RedRoomRewards → Queue → Settlement
                    ↓                   ↓            ↓         ↓
              [UI/Game Logic]    [Escrow Points]  [Authorize] [Award/Refund]
```

**Data Flow**:
1. User initiates spin in external system
2. External system requests escrow from RedRoomRewards
3. RedRoomRewards holds points in escrow
4. External system determines outcome (RNG)
5. Queue service authorizes settlement/refund
6. RedRoomRewards completes transaction
7. External system displays result to user

---

## 2. Architectural Boundaries

### 2.1 Separation of Concerns

**Financial vs. Game Logic**:

| Concern | RedRoomRewards | External System |
|---------|----------------|-----------------|
| Point Deduction | ✅ | ❌ |
| Escrow Management | ✅ | ❌ |
| Settlement Authorization | ✅ (via Queue) | ❌ |
| RNG Implementation | ❌ | ✅ |
| Win Determination | ❌ | ✅ |
| Game Rules | ❌ | ✅ |
| UI/Animation | ❌ | ✅ |
| Audit Logging (Financial) | ✅ | ❌ |
| User Display | ❌ | ✅ |

**Rationale**: Clear separation ensures:
- RedRoomRewards maintains financial integrity
- External systems control user experience
- Game logic changes don't affect financial code
- Financial changes don't break game UI

### 2.2 Boundary Enforcement

**Prohibited in RedRoomRewards**:
- ❌ RNG implementations
- ❌ Win/loss calculation logic
- ❌ Paytable definitions
- ❌ Reel symbols or configurations
- ❌ Animation timing or effects
- ❌ User interface components
- ❌ Direct settlement without queue authority

**Required in RedRoomRewards**:
- ✅ Idempotent escrow operations
- ✅ Atomic balance updates
- ✅ Immutable transaction logs
- ✅ Queue-authorized settlement only
- ✅ Optimistic locking for concurrency
- ✅ Comprehensive error handling

---

## 3. Loyalty Service as Standalone

### 3.1 Independence Principle

**Principle**: RedRoomRewards operates independently of any single consumer application.

**Characteristics**:
- Self-contained point management
- No dependencies on external system availability
- Well-defined API boundaries
- Graceful degradation when external systems fail
- Queue-based asynchronous processing

**Benefits**:
- Multiple applications can integrate
- External system downtime doesn't corrupt balances
- Financial integrity maintained regardless of game state
- Easy to test in isolation

### 3.2 API-First Design

**API Contract**: `/api/openapi.yaml`

**Key Endpoints for Slot Machine**:
```
POST /escrow/request
  - Request points to be held in escrow
  - Returns escrow_id and authorization token

POST /escrow/settle
  - Complete escrow (award winnings or forfeit bet)
  - Requires queue authorization token

POST /escrow/refund
  - Refund escrowed points (on failure)
  - Requires queue authorization token

GET /wallets/{userId}
  - Check current balance (available + escrow)
```

**Idempotency**:
- All requests include `idempotency_key` (UUID)
- Duplicate requests return same result
- 24-hour idempotency window
- Safe to retry on network failure

### 3.3 No Circular Dependencies

**Dependency Direction**:
```
External System → RedRoomRewards API
  (requests)         (responses)

RedRoomRewards ↛ External System
  (never calls)     (never depends)
```

**Exceptions** (Optional):
- Webhooks for balance updates (if external system subscribes)
- Event notifications (one-way, fire-and-forget)

**Rationale**: External systems can change or be replaced without affecting RedRoomRewards.

---

## 4. Deterministic Behavior Rules

### 4.1 Determinism Definition

**Principle**: Given the same inputs, RedRoomRewards always produces the same outputs.

**Guaranteed Behaviors**:
- Same escrow request (idempotency key) → Same escrow_id
- Same settlement authorization → Same final balance
- Same refund request → Same restoration of points
- Balance queries are always accurate and current

**Non-Deterministic Elements** (Handled by External Systems):
- RNG outcomes (win/loss)
- User choices or timing
- UI presentation order
- Animation durations

### 4.2 State Machine

**Slot Machine Transaction States**:

```
START
  ↓
REQUEST_ESCROW
  ↓ (success)
ESCROW_HELD ──────┐
  ↓               ↓
SETTLE         REFUND
  ↓               ↓
COMPLETE ← ─ ─ ─ ─┘
```

**State Transitions**:
1. **START → REQUEST_ESCROW**: User initiates spin
2. **REQUEST_ESCROW → ESCROW_HELD**: Points moved to escrow
3. **ESCROW_HELD → SETTLE**: External system reports win/loss
4. **ESCROW_HELD → REFUND**: External system reports error
5. **SETTLE/REFUND → COMPLETE**: Transaction finalized

**Transition Rules**:
- Each state transition creates a ledger entry
- State changes are atomic
- Invalid transitions are rejected
- Timeouts trigger automatic refund

### 4.3 Idempotency Guarantees

**Escrow Request Idempotency**:
```typescript
// First request
POST /escrow/request
{
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user123",
  "amount": 100,
  "feature": "slot_machine"
}
// Response: { escrow_id: "esc_abc123", status: "held" }

// Duplicate request (same idempotency_key)
POST /escrow/request { ... same data ... }
// Response: { escrow_id: "esc_abc123", status: "held" }
// (Same escrow_id returned, no new escrow created)
```

**Settlement Idempotency**:
- Queue generates authorization token bound to escrow
- Token is single-use but idempotent
- Duplicate settlement attempts return cached result
- No double-award or double-refund possible

---

## 5. Slot Machine Transaction Flow

### 5.1 Successful Spin (Win)

**Step-by-Step**:

1. **User Action**: User clicks "Spin" (cost: 100 points)
2. **External System**: Validates user has sufficient balance
3. **Escrow Request**:
   ```
   POST /escrow/request
   {
     "idempotency_key": "uuid-1",
     "user_id": "user123",
     "amount": 100,
     "feature": "slot_machine",
     "metadata": { "spin_id": "spin_456" }
   }
   ```
4. **RedRoomRewards**:
   - Validates user balance (≥100 available)
   - Creates escrow item (100 points held)
   - Updates wallet (available: -100, escrow: +100)
   - Returns escrow_id and queue reference
5. **External System**:
   - Runs RNG and determines outcome (e.g., win 500 points)
   - Adds to queue for settlement
6. **Queue Service**:
   - Processes queue item
   - Generates settlement authorization token
   - Sends to RedRoomRewards
7. **Settlement**:
   ```
   POST /escrow/settle
   {
     "escrow_id": "esc_abc123",
     "queue_authorization": "jwt_token",
     "outcome": "win",
     "award_amount": 500
   }
   ```
8. **RedRoomRewards**:
   - Validates queue authorization
   - Completes escrow (forfeit 100 bet)
   - Awards winnings (available: +500)
   - Creates ledger entries (debit: -100, credit: +500)
   - Returns final balance
9. **External System**: Displays win animation and new balance

**Net Result**: User balance +400 points (won 500, spent 100)

### 5.2 Successful Spin (Loss)

**Step-by-Step** (1-5 same as above):

6. **Queue Service**: Determines loss outcome
7. **Settlement**:
   ```
   POST /escrow/settle
   {
     "escrow_id": "esc_abc123",
     "queue_authorization": "jwt_token",
     "outcome": "loss",
     "award_amount": 0
   }
   ```
8. **RedRoomRewards**:
   - Validates queue authorization
   - Completes escrow (forfeit 100 bet)
   - No award (loss)
   - Creates ledger entry (debit: -100)
   - Returns final balance
9. **External System**: Displays loss animation

**Net Result**: User balance -100 points (lost bet)

### 5.3 Failed Spin (Refund)

**Failure Scenarios**:
- External system crashes before determining outcome
- Network timeout during RNG call
- Invalid game state detected
- User disconnects mid-spin

**Step-by-Step** (1-5 same as above):

6. **Queue Service**: Detects failure, initiates refund
7. **Refund**:
   ```
   POST /escrow/refund
   {
     "escrow_id": "esc_abc123",
     "queue_authorization": "jwt_token",
     "reason": "system_error"
   }
   ```
8. **RedRoomRewards**:
   - Validates queue authorization
   - Refunds escrow (escrow: -100, available: +100)
   - Creates ledger entry (credit: +100, reason: "refund_system_error")
   - Returns final balance
9. **External System**: Notifies user of refund

**Net Result**: User balance unchanged (full refund)

---

## 6. Security and Abuse Prevention

### 6.1 Server-Side Authority

**Principle**: All financial decisions made server-side.

**Protected Against**:
- Client-side balance manipulation
- Fake win claims
- Unauthorized settlements
- Direct balance updates
- Bypassing escrow

**Controls**:
- Queue authorization required for settlement
- Signature validation on authorization tokens
- Idempotency prevents duplicate settlements
- Optimistic locking prevents race conditions
- Audit logs for all transactions

### 6.2 Rate Limiting

**Spin Rate Limits**:
- Per user: 1 spin per 5 seconds (configurable)
- Per IP: 10 spins per minute
- Per session: 100 spins per hour

**Enforcement**:
- API gateway rate limiting
- Token bucket algorithm
- 429 status code on limit exceeded
- Retry-After header provided

**Rationale**: Prevent abuse, bot attacks, and accidental rapid-fire spins.

### 6.3 Balance Validation

**Pre-Escrow Checks**:
- User must have sufficient available balance
- Minimum balance threshold (e.g., ≥spin cost)
- Maximum escrow limit per user (e.g., 10,000 points)
- Account status check (not suspended/banned)

**Concurrent Spin Prevention**:
- User can only have one active slot machine escrow at a time
- Attempting second spin returns error until first completes
- Timeout releases escrow for new attempt

---

## 7. Timeout and Error Handling

### 7.1 Escrow Timeout

**Policy**: Escrowed points automatically refunded after timeout.

**Timeout Duration**: 5 minutes (configurable)

**Timeout Process**:
1. Escrow created at timestamp T
2. If no settlement by T+5min, timeout triggered
3. Automatic refund initiated by queue service
4. Points returned to available balance
5. Ledger entry: "refund_timeout"

**Rationale**: Prevents points stuck in escrow indefinitely due to crashes or network issues.

### 7.2 Queue Failures

**Scenarios**:
- Queue service unavailable
- Authorization token expired
- Settlement request malformed

**Handling**:
- Exponential backoff retry (3 attempts)
- Alert monitoring team on repeated failures
- Manual intervention if needed
- User notified of delay (external system)

**Fallback**:
- If queue down >5 minutes, automatic refunds triggered
- Financial integrity maintained
- Users not penalized for system failures

### 7.3 Error Responses

**Client Errors (4xx)**:
- `400 Bad Request`: Invalid request format
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Insufficient permissions
- `409 Conflict`: Duplicate idempotency key with different data
- `422 Unprocessable Entity`: Insufficient balance

**Server Errors (5xx)**:
- `500 Internal Server Error`: Unexpected server issue
- `503 Service Unavailable`: Temporary unavailability (retry)
- `504 Gateway Timeout`: Upstream service timeout

**Error Response Format**:
```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "User does not have sufficient balance for this operation",
    "user_message": "You don't have enough points for this spin.",
    "request_id": "req_xyz789"
  }
}
```

---

## 8. Data Models

### 8.1 Escrow Item

**Schema**:
```typescript
interface EscrowItem {
  escrow_id: string;              // Unique identifier
  user_id: string;                // User owning the points
  amount: number;                 // Points held in escrow
  feature: string;                // "slot_machine"
  status: EscrowStatus;           // "held" | "settled" | "refunded"
  created_at: Date;               // Escrow creation timestamp
  expires_at: Date;               // Automatic refund time
  settled_at?: Date;              // Settlement timestamp
  queue_item_id?: string;         // Reference to queue item
  metadata: {
    spin_id?: string;             // External system spin ID
    session_id?: string;          // User session ID
  };
  idempotency_key: string;        // Request idempotency key
}
```

### 8.2 Ledger Transaction

**Schema**:
```typescript
interface LedgerTransaction {
  transaction_id: string;         // Unique identifier
  user_id: string;                // User account
  amount: number;                 // Signed amount (+credit, -debit)
  balance_type: BalanceType;      // "available" | "escrow"
  reason: string;                 // "slot_machine_bet" | "slot_machine_win" | "refund_timeout"
  timestamp: Date;                // Transaction time (UTC)
  previous_balance: number;       // Balance before transaction
  new_balance: number;            // Balance after transaction
  escrow_id?: string;             // Related escrow item
  idempotency_key: string;        // Request idempotency key
  metadata: Record<string, any>;  // Additional context
}
```

### 8.3 Wallet State

**Schema**:
```typescript
interface Wallet {
  user_id: string;                // User identifier
  available_balance: number;      // Points available for use
  escrow_balance: number;         // Points held in escrow
  earned_balance: number;         // Total lifetime earnings
  total_balance: number;          // available + escrow (computed)
  version: number;                // Optimistic locking version
  updated_at: Date;               // Last update timestamp
}
```

**Invariant**: `total_balance = available_balance + escrow_balance`

---

## 9. Queue Integration

### 9.1 Queue Service Role

**Responsibilities**:
- Process escrow requests asynchronously
- Determine settlement or refund (based on external system input)
- Generate authorization tokens
- Handle timeouts and retries
- Maintain processing order

**Authority Model**:
```
Feature Module (Slot Machine) → Request Escrow
Queue Service → Authorize Settlement/Refund
Wallet Service → Execute Settlement/Refund
```

**Rationale**: Queue service is the only authority that can approve settlement/refund, preventing direct manipulation.

### 9.2 Authorization Token

**Token Structure** (JWT):
```json
{
  "iss": "queue-service",
  "aud": "wallet-service",
  "exp": 1704393600,           // 5 minutes from issue
  "iat": 1704393300,
  "jti": "token_unique_id",
  "escrow_id": "esc_abc123",
  "queue_item_id": "queue_456",
  "action": "settle",          // "settle" | "refund"
  "amount": 500,               // Award amount (settle only)
  "outcome": "win"             // "win" | "loss" (settle only)
}
```

**Validation**:
- Signature verification (shared secret)
- Expiry check (must be within 5 minutes)
- Escrow ID match
- Action validity
- Amount consistency (if settle)

### 9.3 Queue Processing

**Processing Steps**:
1. Escrow request added to queue
2. External system provides outcome (via callback or poll)
3. Queue validates outcome
4. Queue generates authorization token
5. Queue calls RedRoomRewards settlement endpoint
6. Queue marks item as complete
7. Queue sends webhook to external system (optional)

**Ordering**:
- FIFO (First In, First Out) by default
- Priority queue support (e.g., VIP users)
- Timeout items processed immediately

---

## 10. Testing and Validation

### 10.1 Test Scenarios

**Happy Path**:
- User spins and wins
- User spins and loses
- Multiple spins in sequence
- Concurrent users spinning

**Edge Cases**:
- Insufficient balance attempt
- Duplicate spin request (idempotency)
- Concurrent spin attempt by same user
- Escrow timeout
- Maximum escrow limit reached

**Failure Cases**:
- Queue service down during spin
- Database connection lost mid-transaction
- Invalid authorization token
- Expired authorization token
- Network timeout during settlement

**Security Tests**:
- Unauthorized settlement attempt
- Fake authorization token
- Balance manipulation attempt
- Replay attack with old tokens

### 10.2 Integration Testing

**Test Environment**:
- Mock external system for RNG
- Test queue service
- Test database with isolated data
- Synthetic users and balances

**Test Suite Coverage**:
- Escrow request → settlement flow
- Escrow request → refund flow
- Idempotency verification
- Concurrent operations
- Timeout handling
- Error responses

### 10.3 Performance Testing

**Load Testing**:
- 100 concurrent spins
- 1,000 spins per minute
- Database connection pool sizing
- Queue throughput

**Benchmarks**:
- Escrow request: <100ms p95
- Settlement: <200ms p95
- Balance query: <50ms p95

---

## 11. Monitoring and Observability

### 11.1 Metrics

**Business Metrics**:
- Total spins per hour
- Win rate (external system)
- Average bet amount
- Total points wagered
- Total points awarded

**Operational Metrics**:
- Escrow request rate
- Settlement latency
- Refund rate
- Timeout rate
- Error rate by type

**Alerting Thresholds**:
- Refund rate >10%: Warning
- Timeout rate >5%: Warning
- Error rate >1%: Critical
- Settlement latency >500ms: Warning

### 11.2 Logging

**Logged Events**:
- Escrow request (user_id, amount, idempotency_key)
- Escrow created (escrow_id, user_id, amount)
- Settlement requested (escrow_id, outcome, amount)
- Settlement completed (transaction_id, final_balance)
- Refund issued (escrow_id, reason)
- Errors (with request_id for debugging)

**Log Level**:
- INFO: Normal operations
- WARN: Retries, timeouts
- ERROR: Failures requiring attention
- DEBUG: Detailed flow (dev only)

### 11.3 Dashboards

**Real-Time Dashboard**:
- Active escrows count
- Settlements per minute
- Refunds per minute
- Average latency
- Error rate

**Business Dashboard**:
- Daily active users (slot machine)
- Total wagered (daily, weekly, monthly)
- Total awarded
- House edge (external system metric)

---

## 12. Compliance and Audit

### 12.1 Audit Trail

**Requirements**:
- Every spin creates ledger entries
- All state transitions logged
- Immutable transaction records
- 7+ year retention

**Audit Information**:
- User ID and spin ID
- Escrow amount and timestamp
- Settlement outcome and amount
- Final balance after transaction
- Queue authorization token ID (for verification)

### 12.2 Reconciliation

**Daily Reconciliation**:
- Sum all escrow amounts = sum of escrow_balance in wallets
- Sum all ledger debits = sum all ledger credits (over time)
- No orphaned escrows (all settled or refunded)

**Alerts**:
- Reconciliation mismatch
- Long-lived escrows (>1 hour)
- Balance discrepancies

### 12.3 Dispute Resolution

**User Dispute Process**:
1. User reports issue (e.g., "points not awarded")
2. Support retrieves transaction history by user_id and timestamp
3. Ledger provides complete audit trail
4. Escrow status verified
5. Settlement authorization token verified
6. Issue resolved or escalated

**Common Issues**:
- Delayed settlement (check queue)
- Display bug (external system, not RedRoomRewards)
- Timeout refund (automatic, expected behavior)

---

## 13. Future Enhancements

### 13.1 Planned Features

**Progressive Jackpots**:
- Shared jackpot pool across users
- Percentage of each bet contributes
- Requires separate jackpot escrow management

**Tournament Mode**:
- Leaderboard tracking
- Buy-in and prize pool
- Scheduled tournaments

**Multi-Line Spins**:
- Multiple bet amounts per spin
- Complex payout structures
- Requires enhanced escrow logic

### 13.2 Scalability Considerations

**Horizontal Scaling**:
- Stateless API servers (scale independently)
- Database sharding by user_id
- Queue service clustering
- Cache layer for balance queries

**Performance Optimization**:
- Read replicas for balance queries
- Write-ahead logging for transactions
- Batch processing for settlements

---

## 14. Summary

The slot machine feature in RedRoomRewards demonstrates clear architectural boundaries:

**RedRoomRewards (This Repository)**:
- ✅ Standalone loyalty service
- ✅ Deterministic behavior (idempotent, consistent)
- ✅ Escrow and settlement only
- ✅ No game logic or RNG

**External Systems**:
- ✅ Game logic and RNG
- ✅ UI/UX and animations
- ✅ Business rules for eligibility

**Key Principles**:
1. **Separation of Concerns**: Financial vs. game logic
2. **Server-Side Authority**: No client-side trust
3. **Deterministic Behavior**: Predictable and testable
4. **Queue Authorization**: Only queue can approve settlement
5. **Idempotency**: Safe retries, no double-spend
6. **Audit Trail**: Complete transaction history
7. **Graceful Degradation**: Refunds on failures

---

## 15. References

**Related Documentation**:
- `/ARCHITECTURE.md` - Overall architecture
- `/SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` - Security principles
- `/docs/WALLET_ESCROW_ARCHITECTURE.md` - Escrow design
- `/docs/QUEUE_INTEGRATION_GUIDE.md` - Queue service details
- `/api/openapi.yaml` - API contract

**Specifications**:
- `/docs/specs/SLOT_MACHINE_SPEC_v1.0.md` - Detailed spec
- `/docs/specs/RRR_LOYALTY_ENGINE_SPEC_v1.1.md` - Loyalty engine spec

---

## Version History

- **2026-01-04**: Initial slot machine implementation briefing
  - Defined boundaries and responsibilities
  - Established loyalty service as standalone
  - Documented deterministic behavior rules
  - Detailed transaction flows
  - Specified security and abuse prevention
  - Outlined data models and queue integration
  - Defined testing and monitoring requirements

---

**Document Owner**: RedRoomRewards Repository Maintainers  
**Review Schedule**: Quarterly or before major changes  
**Next Review**: 2026-04-04

---

**Remember**: Slot machine game logic belongs in external systems. RedRoomRewards provides reliable, auditable point management only.
