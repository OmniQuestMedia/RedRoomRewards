# Wallet & Escrow Architecture

**Document Type**: Technical Specification  
**Status**: Authoritative  
**Date**: 2025-12-23  
**Source**: XXXChatNow Established Patterns  
**Applies To**: RedRoomRewards Platform

---

## Executive Summary

This document defines the wallet and escrow architecture for RedRoomRewards, based on established patterns and requirements from XXXChatNow. This architecture ensures financial integrity, audit compliance, and proper separation of concerns between feature modules, performance queues, and wallet services.

---

## 1. Platform Context

RedRoomRewards is designed to be a loyalty and rewards system that is:
- **Separate from XXXChatNow**: Not tied exclusively to any single platform
- **Not a UI feature**: Server-side authority for all financial operations
- **Auditable first**: Compliance and correctness over raw speed

**Integration Context**: While initially integrating with XXXChatNow (an adult live-streaming platform with interactive paid features), RedRoomRewards maintains clear boundaries and can support multiple platforms.

---

## 2. Wallet States (Conceptual Ledger Buckets)

All funds in the system exist in one of four distinct states. These states are **explicitly tracked**, not inferred:

### 2.1 User Available Balance
- **Definition**: Points that a user can freely spend
- **Operations**: Can be deducted for purchases, transferred (admin-mediated only)
- **Visibility**: Shown to user as "available balance"

### 2.2 Escrow / Held Balance
- **Definition**: Points deducted from user but not yet credited to recipient
- **Purpose**: Enable instant refunds, prevent premature settlement, support disputes
- **Duration**: Temporary state until settlement or refund
- **Visibility**: Shown to user as "pending" or "held"

### 2.3 Model Earned Balance
- **Definition**: Points credited to a model's account after performance completion
- **Settlement Source**: Always from escrow, never directly from user
- **Visibility**: Model earnings, available for withdrawal/redemption

### 2.4 Refunded Balance
- **Definition**: Points returned to user from escrow
- **Tracking**: Separate category for audit and analytics
- **Result**: Returns to User Available Balance

**Critical Rule**: These states are distinct ledger buckets, not derived calculations. Every point has a clear state at all times.

---

## 3. Escrow Semantics

### 3.1 Core Principles

**Immediate Deduction**:
- Funds are deducted from user's available balance at the moment of purchase
- User cannot spend the same points twice
- Balance check happens atomically with deduction

**Escrow Hold**:
- Deducted funds are placed into escrow, not directly credited to model
- Escrow is the default for ALL interactive purchases
- Escrow is NOT optional

**Settlement Authority**:
- Only the Performance Queue can authorize settlement
- Feature modules cannot settle funds
- Wallet service executes settlement but doesn't decide it

### 3.2 Escrow Purpose

1. **Instant Refunds**: Return funds to user without model interaction
2. **Prevent Premature Settlement**: No payment before performance delivery
3. **Dispute Resolution**: Hold funds during investigation
4. **Compliance Auditing**: Track uncommitted funds separately
5. **Performance Tracking**: Link payment to performance completion

### 3.3 Escrow Operations

**Hold (Deduct to Escrow)**:
```
User Available Balance: -X points
Escrow Balance: +X points
Result: User cannot re-spend, model hasn't received yet
```

**Settle (Escrow to Earned)**:
```
Escrow Balance: -X points
Model Earned Balance: +X points
Result: Model has earned the points, irreversible
```

**Refund (Escrow to Available)**:
```
Escrow Balance: -X points
User Available Balance: +X points
Result: User gets points back, model never receives
```

**Partial Refund**:
```
Escrow Balance: -X points
User Available Balance: +Y points
Model Earned Balance: +(X-Y) points
Result: Split between refund and settlement
```

---

## 4. Settlement Authority Model

### 4.1 Separation of Concerns

The system enforces strict boundaries:

| Component | Allowed Actions | Prohibited Actions |
|-----------|----------------|-------------------|
| **Feature Modules** (slot, menu, spin wheel, etc.) | • Request escrow hold<br>• Emit queue intake event<br>• Report user actions | • Settle funds<br>• Refund funds<br>• Deduct user balance directly<br>• Make settlement decisions |
| **Performance Queue** | • Decide settle/refund/abandon<br>• Authorize settlement<br>• Authorize refunds<br>• Track performance state | • Deduct user balance<br>• Execute ledger changes directly<br>• Modify wallet balances |
| **Wallet Service** | • Execute atomic ledger changes<br>• Deduct to escrow<br>• Settle escrow to earned<br>• Refund escrow to available<br>• Enforce idempotency | • Make business decisions<br>• Decide settlement timing<br>• Determine refund amounts<br>• Apply feature-specific rules |

**Critical Principle**: Business logic is separate from financial execution. The queue decides WHAT to do; the wallet does HOW to do it.

### 4.2 Settlement Rules

**Escrow → Earned (Settlement)** occurs ONLY when:
- Performance Queue marks item as **Finished**
- Performance was actually delivered
- No disputes are pending
- Settlement request includes valid authorization

**Escrow → Refund (Refund)** occurs when:
- Performance Queue marks item as **Abandoned**
- User disconnects before performance starts
- Model initiates refund
- Rope-drop timeout expires without performance
- Admin authorizes refund

**Partial Refunds**:
- Expressed as **token values**, never percentages
- Must specify both refund amount and settle amount
- Sum must equal original escrow amount
- Useful for partial performance or quality issues

### 4.3 Idempotency & Authorization

Every settlement or refund request MUST include:
- **Idempotency Key**: Prevents duplicate settlements
- **Queue Item ID**: Links to performance record
- **Authorization Token**: Proves queue authority
- **Reason Code**: For audit trail
- **Request Timestamp**: For ordering and timeout detection

---

## 5. Feature Compliance Status

### 5.1 Fully Compliant Features

**Slot Machine**:
- ✅ Deducts to escrow atomically
- ✅ Emits standardized queue intake event
- ✅ Never settles directly
- ✅ Properly reports outcomes to queue

**Chip Menu**:
- ✅ Deducts to escrow atomically
- ✅ Emits standardized queue intake event
- ✅ Never settles directly
- ✅ Follows escrow semantics

**Performance Queue**:
- ✅ Sole authority for settlement/refunds
- ✅ Does not touch wallet balances directly
- ✅ Properly authorizes wallet operations

**Wallet Service**:
- ✅ Atomic transaction execution
- ✅ Idempotent operations
- ✅ No embedded business logic
- ✅ Proper error handling and rollback

### 5.2 Legacy / Contained

**Spin Wheel** (Archived):
- ❌ Used direct deduction and settlement
- ❌ Lacked escrow mechanism
- ❌ No idempotency support
- ❌ Used literal chat strings
- **Status**: Feature-flagged, not a design reference

**Rule**: Legacy patterns must NOT be used in RedRoomRewards implementation.

---

## 6. Idempotency & Audit Guarantees

### 6.1 Idempotency Requirements

**All wallet operations MUST**:
- Accept an idempotency key (UUID recommended)
- Check for duplicate requests before processing
- Return the same result for duplicate keys
- Store idempotency results for 24+ hours minimum
- Be safe to retry without side effects

**Idempotency Key Scope**:
- Unique per operation type (deduct, settle, refund)
- Client-generated, server-validated
- Persisted with transaction record
- Used for duplicate detection

### 6.2 Audit Trail Requirements

**Every transaction MUST record**:
- Transaction ID (unique, immutable)
- User ID (or model ID)
- Amount (positive for credit, negative for debit)
- State transition (available→escrow, escrow→earned, etc.)
- Idempotency key
- Request ID (for tracing)
- Timestamp (ISO 8601)
- Reason code (structured, not free-text)
- Previous balance
- New balance
- Metadata (contextual info)

**Audit Log Restrictions**:
- **NO PII** beyond user/model identifiers
- No secrets, tokens, or credentials
- No personally identifiable information
- Structured data only (JSON)

**Retention**:
- Minimum **7 years** for compliance
- Immutable once written
- Queryable by admin for audit/disputes

### 6.3 Transaction Ordering

- All transactions have monotonic timestamps
- Balance calculations respect transaction order
- Concurrent operations use optimistic locking
- Version conflicts trigger retry with backoff

---

## 7. Messaging & Compliance

### 7.1 Financial Event Messaging

Financial state changes trigger **template-based** chat messages:

**Compliant Approach**:
```json
{
  "event": "escrow_held",
  "template": "points_held_for_performance",
  "variables": {
    "amount": 100,
    "item_type": "chip_menu_action"
  }
}
```

**Non-Compliant** (Legacy):
```javascript
// DO NOT DO THIS
sendChat(`You spent ${amount} chips on ${action}!`);
```

### 7.2 Decoupling Principles

- **Wallet service** emits financial events
- **Messaging service** consumes events and formats messages
- Templates are versioned and testable
- Messages reflect state transitions, not feature whims
- No embedded strings in wallet code

### 7.3 Compliance Implications

- Audit logs contain reason codes, not user-facing text
- Messages can be updated without changing wallet logic
- Multi-language support without wallet changes
- Legal review of templates, not code

---

## 8. API Contract

### 8.1 Escrow Operations

**Hold Funds in Escrow**:
```http
POST /wallets/{userId}/escrow/hold
X-Idempotency-Key: {uuid}
Content-Type: application/json

{
  "amount": 100,
  "reason": "chip_menu_purchase",
  "queueItemId": "queue-123",
  "metadata": {
    "featureType": "chip_menu",
    "actionId": "act-456"
  }
}

Response 201 Created:
{
  "transactionId": "txn-789",
  "escrowId": "esc-012",
  "previousBalance": 500,
  "newAvailableBalance": 400,
  "escrowBalance": 100,
  "timestamp": "2025-12-23T12:00:00Z"
}
```

**Settle Escrow (Queue Authority)**:
```http
POST /wallets/escrow/{escrowId}/settle
X-Idempotency-Key: {uuid}
Authorization: Queue-Token {token}
Content-Type: application/json

{
  "modelId": "model-123",
  "amount": 100,
  "queueItemId": "queue-123",
  "reason": "performance_completed"
}

Response 200 OK:
{
  "transactionId": "txn-790",
  "settledAmount": 100,
  "modelEarnedBalance": 1100,
  "timestamp": "2025-12-23T12:05:00Z"
}
```

**Refund Escrow (Queue Authority)**:
```http
POST /wallets/escrow/{escrowId}/refund
X-Idempotency-Key: {uuid}
Authorization: Queue-Token {token}
Content-Type: application/json

{
  "userId": "user-123",
  "amount": 100,
  "queueItemId": "queue-123",
  "reason": "performance_abandoned"
}

Response 200 OK:
{
  "transactionId": "txn-791",
  "refundedAmount": 100,
  "userAvailableBalance": 500,
  "timestamp": "2025-12-23T12:03:00Z"
}
```

**Partial Refund**:
```http
POST /wallets/escrow/{escrowId}/partial-settle
X-Idempotency-Key: {uuid}
Authorization: Queue-Token {token}
Content-Type: application/json

{
  "userId": "user-123",
  "modelId": "model-123",
  "refundAmount": 30,
  "settleAmount": 70,
  "queueItemId": "queue-123",
  "reason": "partial_performance"
}

Response 200 OK:
{
  "transactionId": "txn-792",
  "refundedAmount": 30,
  "settledAmount": 70,
  "userAvailableBalance": 430,
  "modelEarnedBalance": 1070,
  "timestamp": "2025-12-23T12:04:00Z"
}
```

### 8.2 Balance Queries

**Get User Balance (All States)**:
```http
GET /wallets/{userId}/balance

Response 200 OK:
{
  "userId": "user-123",
  "available": 400,
  "escrow": 100,
  "total": 500,
  "asOf": "2025-12-23T12:00:00Z"
}
```

**Get Escrow Details**:
```http
GET /wallets/{userId}/escrow

Response 200 OK:
{
  "userId": "user-123",
  "escrowItems": [
    {
      "escrowId": "esc-012",
      "amount": 100,
      "createdAt": "2025-12-23T12:00:00Z",
      "queueItemId": "queue-123",
      "featureType": "chip_menu",
      "status": "held"
    }
  ],
  "totalEscrow": 100
}
```

---

## 9. Implementation Guidelines

### 9.1 Database Schema Considerations

**Wallets Collection**:
- User ID (indexed, unique)
- Available balance (decimal)
- Escrow balance (decimal)
- Version (for optimistic locking)
- Created timestamp
- Updated timestamp

**Escrow Items Collection**:
- Escrow ID (unique)
- User ID (indexed)
- Amount (decimal)
- Status (held, settled, refunded)
- Queue item ID (indexed)
- Created timestamp
- Settled/refunded timestamp
- Reason code

**Transactions Collection** (Immutable Ledger):
- Transaction ID (unique)
- User ID or Model ID (indexed)
- Amount (decimal, signed)
- Type (credit, debit)
- State transition (available→escrow, etc.)
- Idempotency key (indexed, unique per type)
- Previous balance
- New balance
- Timestamp (indexed)
- Reason code
- Metadata (JSON)

### 9.2 Atomic Operations

**Deduct to Escrow**:
1. Start database transaction
2. Check user available balance ≥ amount
3. Lock wallet row (optimistic lock via version)
4. Deduct from available balance
5. Create escrow item with "held" status
6. Insert immutable transaction record
7. Commit transaction
8. If conflict, retry with exponential backoff

**Settle Escrow**:
1. Start database transaction
2. Verify escrow exists and status is "held"
3. Verify queue authorization token
4. Lock wallet rows (user escrow, model earned)
5. Deduct from user escrow balance
6. Credit model earned balance
7. Update escrow item status to "settled"
8. Insert immutable transaction records (2x)
9. Commit transaction

**Refund Escrow**:
1. Start database transaction
2. Verify escrow exists and status is "held"
3. Verify queue authorization token
4. Lock wallet rows (user available, user escrow)
5. Deduct from user escrow balance
6. Credit user available balance
7. Update escrow item status to "refunded"
8. Insert immutable transaction records (2x)
9. Commit transaction

### 9.3 Error Handling

**Insufficient Balance**:
- HTTP 402 Payment Required
- Message: "Insufficient available balance"
- Include current balance in response

**Escrow Not Found**:
- HTTP 404 Not Found
- Message: "Escrow item not found"

**Already Settled/Refunded**:
- HTTP 409 Conflict
- Message: "Escrow already processed"
- Include current status

**Invalid Authorization**:
- HTTP 403 Forbidden
- Message: "Invalid queue authorization"

**Optimistic Lock Conflict**:
- Retry operation automatically (up to 3 times)
- If retries exhausted, HTTP 503 Service Unavailable

---

## 10. Open Design Questions

The following items are **intentionally undecided** and require further exploration:

### 10.1 Physical Escrow Location
- Should escrow physically reside in:
  - XXXChatNow database?
  - RedRoomRewards database?
  - Mirrored across both?
- Decision impacts: API latency, consistency model, deployment complexity

### 10.2 Ledger Sharing
- Should tokens and loyalty points share a single ledger?
- Or separate ledgers with cross-references?
- Decision impacts: Audit complexity, query performance, reporting

### 10.3 Cross-Platform Aggregation
- How are rewards aggregated across multiple consuming platforms?
- Single loyalty account or per-platform accounts?
- Decision impacts: User experience, data model, privacy

### 10.4 Chargeback Propagation
- How do payment chargebacks affect loyalty points?
- Immediate deduction or dispute period?
- Decision impacts: User experience, fraud prevention

### 10.5 Promotions & Bonus Credits
- How are promotional points tracked separately from earned points?
- Do they have different expiry rules?
- Can they be refunded?
- Decision impacts: Wallet complexity, business rules

**Status**: These questions are documented but not blocking current implementation. Default to simplest approach that maintains architectural flexibility.

---

## 11. RedRoomRewards Assumptions

The following assumptions guide RedRoomRewards design:

### 11.1 Ownership
- RedRoomRewards **owns or coordinates** loyalty balances
- Not exclusively tied to XXXChatNow
- Designed for multi-platform support

### 11.2 Priorities
1. **Auditable**: Compliance first
2. **Correct**: Proper accounting over speed
3. **Secure**: No financial errors tolerated
4. **Fast**: Performance important but third priority

### 11.3 User Model
- Users create RedRoomRewards account
- Link to XXXChatNow (and other platform) credentials
- Single loyalty identity across platforms

### 11.4 Transaction SLA
- **Posting**: Up to 48 hours is acceptable
- **Best effort**: Faster posting when possible
- **Real-time**: Balance checks are real-time
- **Settlement**: Async processing acceptable for non-urgent operations

### 11.5 Wallet Operations
- **Safe first**: No double-spend, no lost funds
- **Auditable second**: Every operation logged
- **Fast third**: Optimize after correctness ensured

---

## 12. Migration from Legacy

### 12.1 Legacy Spin Wheel Status
- Fully inventoried and understood
- Feature-flagged / gated (not default)
- Does NOT follow escrow semantics
- Must NOT be used as design reference
- Existing installations contained, not upgraded

### 12.2 Compliant Feature Pattern
All new features MUST:
1. Use Wallet Service for all balance operations
2. Deduct to escrow, never directly to model
3. Emit queue intake events
4. Never settle or refund directly
5. Use idempotency keys
6. Use structured reason codes
7. Use template-based messaging

### 12.3 Feature Certification
Before production deployment, features must demonstrate:
- ✅ Escrow-first flow
- ✅ Idempotent operations
- ✅ Proper error handling
- ✅ Audit logging
- ✅ No direct settlements
- ✅ Queue integration
- ✅ Comprehensive tests

---

## 13. Document Maintenance

**Version**: 1.0  
**Last Updated**: 2025-12-23  
**Status**: Living document  
**Review Schedule**: Quarterly or when architectural changes occur

**Change Process**:
1. Propose changes via PR
2. Document rationale in commit message
3. Update version and date
4. Notify dependent teams

**Related Documents**:
- `/docs/UNIVERSAL_ARCHITECTURE.md` - Overall architecture
- `/COPILOT_GOVERNANCE.md` - Development rules
- `/api/openapi.yaml` - API contract
- `/SECURITY.md` - Security requirements

---

**This architecture document is authoritative for RedRoomRewards wallet and escrow implementation. All code must comply with these specifications.**
