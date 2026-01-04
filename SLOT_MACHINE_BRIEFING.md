# Slot Machine Briefing

> **Last Updated**: 2026-01-04
>
> This document describes the slot machine logic implementation, encapsulation principles, and integration with the RedRoomRewards loyalty service as a standalone component.

---

## Executive Summary

The slot machine feature is a **Vegas-style game** integrated with RedRoomRewards loyalty platform. Key principles:

- **Server-Side Authority**: All game logic, RNG, win determination, and balance calculations execute server-side
- **Standalone Component**: Slot machine logic is encapsulated and operates independently from other systems
- **Loyalty Integration**: RedRoomRewards processes point deductions and awards as a **facts-based service**
- **Deterministic Functions**: Game outcomes are reproducible, auditable, and verifiable
- **Abuse Resistance**: Rate limiting, cooldowns, and validation prevent manipulation

---

## 1. Architecture and Encapsulation

### 1.1 Separation of Concerns

The slot machine implementation follows strict encapsulation:

```
┌─────────────────────────────────────┐
│   External System (XXXChatNow)     │
│  - UI/UX rendering                  │
│  - User interactions                │
│  - Game animations                  │
│  - Real-time broadcasts             │
└──────────────┬──────────────────────┘
               │ Facts API
               │ (outcome, bet, result)
               ▼
┌─────────────────────────────────────┐
│   Slot Machine Service (External)   │
│  - RNG execution                    │
│  - Reel outcome determination       │
│  - Win/loss calculation             │
│  - Paytable logic                   │
└──────────────┬──────────────────────┘
               │ Transaction Facts
               │ (user, amount, reason)
               ▼
┌─────────────────────────────────────┐
│   RedRoomRewards (Loyalty Service)  │
│  - Point deduction (bet placement)  │
│  - Point award (win processing)     │
│  - Ledger recording                 │
│  - Balance management               │
└─────────────────────────────────────┘
```

### 1.2 What RedRoomRewards Does

RedRoomRewards is **exclusively responsible** for:
- **Point Redemption**: Deducting points when a user places a bet (escrow hold)
- **Point Accrual**: Awarding points when a user wins
- **Ledger Integrity**: Recording all transactions immutably
- **Balance Management**: Maintaining accurate wallet balances
- **Audit Trails**: Comprehensive logging of all point movements

### 1.3 What RedRoomRewards Does NOT Do

RedRoomRewards **explicitly does NOT**:
- Execute random number generation (RNG)
- Determine slot machine outcomes (win/loss)
- Calculate paytable multipliers
- Render game UI or animations
- Handle real-time broadcast events
- Store game history or statistics (beyond transactions)

---

## 2. Slot Machine Logic Implementation

### 2.1 External System Responsibilities

The slot machine logic resides in an **external system** (e.g., XXXChatNow game service) and includes:

#### Random Number Generation (RNG)
- Cryptographically secure RNG (e.g., `crypto.randomBytes`)
- Seeded RNG for reproducibility (if required for auditing)
- Fair distribution across all possible outcomes
- No client-side RNG; all generation is server-side

#### Reel Outcome Determination
- Define reel strips (symbols and their positions)
- Calculate stop positions for each reel
- Determine visible symbols based on stop positions
- Apply cascading or special feature logic (if applicable)

#### Win Calculation
- Evaluate paylines for winning combinations
- Apply paytable multipliers to bet amount
- Calculate total win amount across all paylines
- Handle special features (wilds, scatters, bonus rounds)

#### Example: Simplified Slot Machine Logic
```typescript
// External system (NOT in RedRoomRewards)
class SlotMachineEngine {
  private rng: SecureRNG;
  private paytable: Paytable;

  spin(betAmount: number): SpinResult {
    // 1. Generate random stop positions
    const stopPositions = this.generateStopPositions();
    
    // 2. Determine visible symbols
    const visibleSymbols = this.getVisibleSymbols(stopPositions);
    
    // 3. Evaluate paylines
    const winningLines = this.evaluatePaylines(visibleSymbols);
    
    // 4. Calculate total win
    const totalWin = this.calculateWin(winningLines, betAmount);
    
    return {
      reelPositions: stopPositions,
      symbols: visibleSymbols,
      winAmount: totalWin,
      winningLines,
      timestamp: Date.now(),
    };
  }
}
```

### 2.2 Deterministic Functions

**All slot machine functions must be deterministic** to ensure:
- **Reproducibility**: Same inputs produce same outputs
- **Auditability**: Outcomes can be verified independently
- **Compliance**: Regulatory audits can validate fairness

#### Deterministic RNG (for auditing)
```typescript
// Seeded RNG for reproducible outcomes
function seededRNG(seed: string): number {
  // Use cryptographic hash function
  const hash = crypto.createHash('sha256').update(seed).digest();
  return parseInt(hash.toString('hex').slice(0, 8), 16) / 0xFFFFFFFF;
}

// Example: Deterministic spin
function deterministicSpin(userId: string, spinId: string, betAmount: number) {
  const seed = `${userId}-${spinId}-${betAmount}`;
  const random = seededRNG(seed);
  const stopPosition = Math.floor(random * NUM_REEL_POSITIONS);
  return stopPosition;
}
```

### 2.3 Paytable and Configuration

Paytable defines winning combinations and multipliers:

```typescript
interface Paytable {
  [symbol: string]: {
    [count: number]: number; // count -> multiplier
  };
}

const EXAMPLE_PAYTABLE: Paytable = {
  'CHERRY': { 3: 5, 4: 10, 5: 50 },
  'SEVEN': { 3: 10, 4: 25, 5: 100 },
  'BAR': { 3: 20, 4: 50, 5: 200 },
  'DIAMOND': { 3: 50, 4: 150, 5: 500 },
};
```

---

## 3. Integration with RedRoomRewards

### 3.1 Facts-Based Integration Pattern

External systems submit **facts** to RedRoomRewards; they do NOT delegate logic.

#### Bet Placement (Point Deduction)
```typescript
// External system initiates bet
POST /api/redemptions/escrow
{
  "idempotencyKey": "spin-abc123",
  "userId": "user-456",
  "amount": 100,
  "reason": "slot_machine_bet",
  "queueItemId": "queue-789",
  "metadata": {
    "spinId": "abc123",
    "gameType": "slot_machine",
    "betAmount": 100
  }
}
```

RedRoomRewards Response:
```json
{
  "transactionId": "txn-001",
  "escrowId": "esc-001",
  "amountRedeemed": 100,
  "newAvailableBalance": 900,
  "escrowBalance": 100,
  "queueItemId": "queue-789"
}
```

#### Win Processing (Point Accrual)
```typescript
// External system reports win
POST /api/accruals/award
{
  "idempotencyKey": "win-abc123",
  "userId": "user-456",
  "amount": 500,
  "reason": "slot_machine_win",
  "metadata": {
    "spinId": "abc123",
    "gameType": "slot_machine",
    "betAmount": 100,
    "winAmount": 500,
    "winningSymbols": ["SEVEN", "SEVEN", "SEVEN"]
  }
}
```

RedRoomRewards Response:
```json
{
  "transactionId": "txn-002",
  "amountAwarded": 500,
  "newBalance": 1400,
  "timestamp": "2026-01-04T06:35:00Z"
}
```

### 3.2 Settlement and Refund Flow

After the spin completes, the external system instructs settlement:

```typescript
// Queue service processes settlement
POST /api/queue/settle
{
  "queueItemId": "queue-789",
  "escrowId": "esc-001",
  "action": "settle", // or "refund"
  "metadata": {
    "spinId": "abc123",
    "outcome": "win",
    "winAmount": 500
  }
}
```

- **Settle**: Releases escrow hold; points are permanently deducted
- **Refund**: Returns escrowed points to user's available balance

---

## 4. Loyalty Service as Standalone Component

### 4.1 Independence from Game Logic

RedRoomRewards operates **completely independently** of slot machine implementation:

- **No Game State**: RedRoomRewards does not store reel positions, symbols, or outcomes
- **No Business Rules**: RedRoomRewards does not enforce bet limits, win caps, or game-specific rules
- **No UI/UX**: RedRoomRewards provides API only; no game rendering
- **No Real-Time Events**: RedRoomRewards does not broadcast game events to clients

### 4.2 Service Boundaries

RedRoomRewards exposes these slot machine-related capabilities:

| Capability | RedRoomRewards | External System |
|------------|----------------|-----------------|
| RNG execution | ❌ No | ✅ Yes |
| Outcome determination | ❌ No | ✅ Yes |
| Point deduction (bet) | ✅ Yes | ❌ No |
| Point award (win) | ✅ Yes | ❌ No |
| Balance calculation | ✅ Yes | ❌ No |
| Transaction recording | ✅ Yes | ❌ No |
| Escrow management | ✅ Yes | ❌ No |
| Settlement authority | ✅ Yes | ❌ No |
| UI rendering | ❌ No | ✅ Yes |
| Real-time broadcast | ❌ No | ✅ Yes |

### 4.3 Composable API Design

RedRoomRewards provides **composable primitives** that external systems orchestrate:

1. **Escrow Hold** (`POST /api/redemptions/escrow`)
   - Holds points in escrow for pending transaction
   - Returns escrow ID for later settlement/refund

2. **Award Points** (`POST /api/accruals/award`)
   - Credits points to user wallet
   - Idempotent with key tracking

3. **Settle Escrow** (`POST /api/queue/settle`)
   - Finalizes escrow hold (deducts points permanently)
   - Queue-based processing for settlement authority

4. **Refund Escrow** (`POST /api/queue/refund`)
   - Returns escrowed points to user
   - Used for errors, cancellations, or system failures

External systems compose these primitives into higher-level flows (bet → spin → win → settle).

---

## 5. Behavioral Rules and Principles

### 5.1 Server-Side Authority

**Absolute Rule**: Server is always authoritative for all financial operations.

- **Client Cannot Deduct Points**: UI cannot modify balances
- **Client Cannot Award Points**: Only server-validated wins are credited
- **Client Cannot Skip Escrow**: All bets must go through escrow hold
- **Client Cannot Bypass Settlement**: Queue service has settlement authority

### 5.2 Idempotency and Duplicate Prevention

**Every transaction must be idempotent** to prevent double-spend:

- **Idempotency Keys**: Required for all bets and wins
- **Duplicate Detection**: Same key returns cached result, no new transaction
- **Request Tracking**: All requests logged with unique identifiers
- **Retry Safety**: API calls are safe to retry on network errors

### 5.3 Rate Limiting and Abuse Prevention

**Protect against rapid-fire betting and manipulation:**

- **Per-User Cooldown**: Minimum time between spins (e.g., 2 seconds)
- **Per-User Rate Limit**: Maximum spins per hour/day
- **Bet Amount Validation**: Minimum and maximum bet amounts enforced
- **Balance Validation**: Insufficient balance rejects bet immediately
- **IP-Based Throttling**: Limit requests from single IP address

### 5.4 Audit Trail Requirements

**Every spin generates comprehensive audit records:**

- **Bet Transaction**: Records escrow hold with bet amount, user, timestamp
- **Win Transaction**: Records point award with win amount, outcome metadata
- **Settlement Record**: Records escrow settlement or refund
- **Immutability**: All records are append-only; never updated or deleted
- **7-Year Retention**: Minimum retention for regulatory compliance

### 5.5 Fair Play and Compliance

**Ensure provably fair gameplay:**

- **Transparent Paytable**: Publicly documented win probabilities
- **Auditable RNG**: RNG can be independently verified
- **No Retroactive Changes**: Past spins cannot be altered
- **Dispute Resolution**: Audit logs support user dispute investigation
- **Regulatory Compliance**: Meets jurisdiction-specific gaming regulations

---

## 6. Error Handling and Edge Cases

### 6.1 Insufficient Balance

**User attempts to bet more points than available:**

```typescript
// Request
POST /api/redemptions/escrow
{ "userId": "user-456", "amount": 1000 }

// Response (400 Bad Request)
{
  "error": "INSUFFICIENT_BALANCE",
  "message": "User has 500 points available, but 1000 requested",
  "availableBalance": 500,
  "requestedAmount": 1000
}
```

### 6.2 Duplicate Bet Prevention

**User submits same bet multiple times:**

```typescript
// First request succeeds
POST /api/redemptions/escrow
{ "idempotencyKey": "spin-abc123", "amount": 100 }
// Response: 200 OK, escrow created

// Second request (duplicate key)
POST /api/redemptions/escrow
{ "idempotencyKey": "spin-abc123", "amount": 100 }
// Response: 200 OK, returns original escrow (no new transaction)
```

### 6.3 Settlement Failure

**Queue service fails to settle escrow:**

- **Retry Logic**: Automatic retries with exponential backoff
- **Dead Letter Queue**: Failed settlements moved to DLQ for investigation
- **Manual Intervention**: Admin can manually settle/refund after review
- **User Notification**: User notified of pending resolution

### 6.4 System Downtime

**RedRoomRewards is unavailable during spin:**

- **Graceful Degradation**: External system disables slot machine UI
- **User Communication**: Display maintenance message to users
- **No Point Loss**: Escrow holds are preserved; settled after recovery
- **Refund Policy**: Long-term outages trigger automatic refunds

---

## 7. Security Considerations

### 7.1 Authentication and Authorization

- **Authenticated Requests**: All API calls require valid JWT token
- **User Authorization**: Users can only bet/win their own points
- **Role-Based Access**: Admin endpoints require elevated privileges
- **Rate Limiting**: Per-user and IP-based rate limits enforced

### 7.2 Input Validation

- **Amount Validation**: Bet amounts must be positive integers within bounds
- **User ID Validation**: User must exist and be active
- **Metadata Sanitization**: Strip potentially malicious data from metadata
- **Schema Validation**: All requests validated against OpenAPI schema

### 7.3 Audit Logging

- **Comprehensive Logging**: Every API call logged with timestamp, user, request ID
- **Sensitive Data Exclusion**: No secrets or tokens in logs
- **Tamper Evidence**: Logs are write-only with integrity verification
- **Retention**: Minimum 7-year retention for audit and compliance

---

## 8. Future Enhancements

### 8.1 Bonus Features

- **Free Spins**: Award free spins without point deduction
- **Progressive Jackpots**: Accumulate jackpot pool across users
- **Multipliers**: Apply multipliers to wins during special events
- **Tournaments**: Track leaderboard and award prizes

### 8.2 Analytics and Reporting

- **Win/Loss Statistics**: Track RTP (return to player) percentages
- **User Behavior**: Analyze betting patterns and engagement
- **Revenue Reporting**: Calculate effective point consumption
- **Fraud Detection**: Identify suspicious betting patterns

### 8.3 Multi-Game Support

- **Game Variants**: Support multiple slot machine themes
- **Progressive Difficulty**: Adjust paytables based on user level
- **Cross-Game Balances**: Unified wallet across all games

---

## 9. Change Log

### 2026-01-04
- Initial creation of Slot Machine Briefing document
- Documented slot machine logic implementation and encapsulation principles
- Defined loyalty service as standalone component with clear boundaries
- Described deterministic functions for reproducibility and auditability
- Outlined behavioral rules: server authority, idempotency, rate limiting, audit trails
- Documented facts-based integration pattern between external systems and RedRoomRewards

---

## 10. Summary

**Key Takeaways:**

1. **Slot machine logic lives in external system** (XXXChatNow game service)
2. **RedRoomRewards processes point movements** as facts submitted by external system
3. **Server-side authority** for all financial operations and balance calculations
4. **Deterministic functions** enable reproducibility, auditability, and compliance
5. **Loyalty service is standalone** with composable API primitives
6. **Comprehensive audit trails** support dispute resolution and regulatory compliance

---

**See Also**:
- [`/docs/specs/SLOT_MACHINE_SPEC_v1.0.md`](/docs/specs/SLOT_MACHINE_SPEC_v1.0.md) - Detailed feature specification
- [`ARCHITECTURE.md`](/ARCHITECTURE.md) - Overall system architecture
- [`SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md`](/SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md) - Security policies
- [`/api/openapi.yaml`](/api/openapi.yaml) - API contract specification

---

**Questions or Feedback**: Contact engineering@omniquestmedia.com
