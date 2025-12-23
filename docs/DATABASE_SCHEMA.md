# Database Schema Documentation

**Document Type**: Technical Specification  
**Status**: Authoritative  
**Date**: 2025-12-23  
**Database**: MongoDB  
**Applies To**: RedRoomRewards Platform

---

## Overview

This document defines the MongoDB schema for the RedRoomRewards wallet and escrow system. All schemas support the architecture defined in `/docs/WALLET_ESCROW_ARCHITECTURE.md`.

**Key Principles**:
- Immutable ledger entries (transactions collection)
- Optimistic locking for concurrent updates
- Comprehensive indexing for performance
- No PII beyond user/model identifiers
- 7+ year retention compliance

---

## Collections

### 1. wallets

**Purpose**: Store user wallet balances with multiple states

**Schema**:
```typescript
{
  _id: ObjectId,
  userId: string,              // Unique user identifier
  availableBalance: Decimal128, // Points available for spending
  escrowBalance: Decimal128,    // Points held in escrow
  currency: string,             // Default: "points"
  version: number,              // Optimistic locking version
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
```javascript
// Primary access pattern
{ userId: 1 }  // unique

// Audit queries
{ updatedAt: 1 }
{ createdAt: 1 }
```

**Validation Rules**:
- `userId` is required and must be unique
- `availableBalance` >= 0 (cannot go negative)
- `escrowBalance` >= 0
- `version` >= 0
- `currency` defaults to "points"

**Optimistic Locking**:
- Increment `version` on every update
- Check current version matches expected version before update
- Retry on version conflict

**Notes**:
- Use `Decimal128` for monetary precision
- Never modify without ledger entry
- Always update `updatedAt` timestamp

---

### 2. model_wallets

**Purpose**: Store model earning balances

**Schema**:
```typescript
{
  _id: ObjectId,
  modelId: string,              // Unique model identifier
  earnedBalance: Decimal128,    // Points earned from performances
  currency: string,             // Default: "points"
  type: string,                 // "promotional" or "earnings"
  version: number,              // Optimistic locking version
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
```javascript
// Primary access pattern
{ modelId: 1, type: 1 }  // compound unique

// Audit queries
{ updatedAt: 1 }
{ createdAt: 1 }
```

**Validation Rules**:
- `modelId` is required
- `modelId` + `type` combination must be unique
- `earnedBalance` >= 0
- `type` must be "promotional" or "earnings"
- `version` >= 0

**Notes**:
- Models can have multiple wallet types
- Most common type is "earnings"
- "promotional" type for platform-funded rewards

---

### 3. escrow_items

**Purpose**: Track individual escrow holds awaiting settlement or refund

**Schema**:
```typescript
{
  _id: ObjectId,
  escrowId: string,             // Unique escrow identifier
  userId: string,               // User who initiated transaction
  amount: Decimal128,           // Amount held
  status: string,               // "held", "settled", "refunded"
  queueItemId: string,          // Performance queue item ID
  featureType: string,          // Feature that created escrow
  reason: string,               // Transaction reason code
  metadata: object,             // Additional context (no PII)
  createdAt: Date,
  processedAt: Date | null,     // When settled or refunded
  modelId: string | null        // Set when settled
}
```

**Indexes**:
```javascript
// Primary access
{ escrowId: 1 }  // unique

// Query patterns
{ userId: 1, status: 1 }
{ queueItemId: 1 }  // unique
{ status: 1, createdAt: 1 }

// Cleanup queries
{ processedAt: 1 }
```

**Validation Rules**:
- `escrowId` is required and unique
- `userId` is required
- `amount` > 0
- `status` must be "held", "settled", or "refunded"
- `queueItemId` is required and unique
- `featureType` is required
- `processedAt` is null when status is "held"
- `modelId` is required when status is "settled"

**Status Transitions**:
- `held` → `settled` (with modelId set)
- `held` → `refunded`
- No other transitions allowed

**Notes**:
- Once processed, status cannot change
- Processed items kept for audit trail
- Consider archiving old processed items

---

### 4. transactions (Ledger)

**Purpose**: Immutable ledger of all financial transactions

**Schema**:
```typescript
{
  _id: ObjectId,
  entryId: string,              // Unique ledger entry ID
  transactionId: string,        // Transaction ID (may group entries)
  accountId: string,            // User or model ID
  accountType: string,          // "user" or "model"
  amount: Decimal128,           // Signed amount (+ credit, - debit)
  type: string,                 // "credit" or "debit"
  balanceState: string,         // "available", "escrow", "earned"
  stateTransition: string,      // e.g., "available→escrow"
  reason: string,               // Structured reason code
  idempotencyKey: string,       // For duplicate prevention
  requestId: string,            // Request tracing ID
  balanceBefore: Decimal128,    // Balance before transaction
  balanceAfter: Decimal128,     // Balance after transaction
  timestamp: Date,              // Transaction timestamp
  currency: string,             // Default: "points"
  metadata: object,             // Additional context (no PII)
  escrowId: string | null,      // Related escrow ID
  queueItemId: string | null,   // Related queue item ID
  featureType: string | null,   // Initiating feature
  correlationId: string | null  // For grouped transactions
}
```

**Indexes**:
```javascript
// Primary access
{ entryId: 1 }  // unique
{ transactionId: 1 }

// Query patterns
{ accountId: 1, timestamp: -1 }
{ accountId: 1, type: 1, timestamp: -1 }
{ idempotencyKey: 1, type: 1 }  // unique compound
{ escrowId: 1 }
{ queueItemId: 1 }
{ correlationId: 1 }

// Audit queries
{ timestamp: 1 }
{ reason: 1, timestamp: 1 }
{ featureType: 1, timestamp: 1 }

// Reconciliation
{ accountId: 1, balanceState: 1, timestamp: 1 }
```

**Validation Rules**:
- `entryId` is required and unique
- `transactionId` is required
- `accountId` is required
- `accountType` must be "user" or "model"
- `amount` != 0
- `type` must be "credit" or "debit"
- `balanceState` must be "available", "escrow", or "earned"
- `stateTransition` is required
- `reason` is required
- `idempotencyKey` is required
- `idempotencyKey` + type must be unique
- `requestId` is required
- All balance fields are required
- `timestamp` defaults to now

**Immutability**:
- **NEVER** update or delete entries
- Corrections are new transactions
- Use TTL index for archival (after 7+ years)

**Notes**:
- This is the source of truth for all financial operations
- Supports comprehensive audit trails
- Enables balance reconciliation
- Critical for compliance and dispute resolution

---

### 5. idempotency_records

**Purpose**: Track processed requests to prevent duplicates

**Schema**:
```typescript
{
  _id: ObjectId,
  key: string,                  // Idempotency key
  operationType: string,        // "hold", "settle", "refund", etc.
  requestHash: string,          // Hash of request body
  result: object,               // Stored response
  statusCode: number,           // HTTP status code
  createdAt: Date,
  expiresAt: Date               // TTL expiry (24+ hours)
}
```

**Indexes**:
```javascript
// Primary access
{ key: 1, operationType: 1 }  // unique compound

// TTL cleanup
{ expiresAt: 1 }  // TTL index
```

**Validation Rules**:
- `key` is required
- `operationType` is required
- `key` + `operationType` must be unique
- `requestHash` is required
- `result` is required
- `statusCode` is required
- `expiresAt` must be > createdAt

**TTL Configuration**:
```javascript
db.idempotency_records.createIndex(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
)
```

**Notes**:
- Automatically cleaned up after expiry
- Default TTL: 24 hours (configurable)
- Prevents double-spend and duplicate settlements
- Hash prevents request tampering

---

### 6. queue_items

**Purpose**: Track performance queue items linked to escrow

**Schema**:
```typescript
{
  _id: ObjectId,
  queueItemId: string,          // Unique queue item ID
  userId: string,               // User requesting performance
  modelId: string,              // Model performing
  escrowId: string,             // Associated escrow
  amount: Decimal128,           // Amount in escrow
  featureType: string,          // Feature that created item
  status: string,               // "queued", "in_progress", "finished", "abandoned", "partial"
  priority: number,             // Queue priority (higher = sooner)
  statusReason: string | null,  // Reason for current status
  metadata: object,             // Additional context
  createdAt: Date,
  startedAt: Date | null,
  completedAt: Date | null
}
```

**Indexes**:
```javascript
// Primary access
{ queueItemId: 1 }  // unique

// Queue processing
{ status: 1, priority: -1, createdAt: 1 }
{ modelId: 1, status: 1 }
{ userId: 1, status: 1 }

// Escrow linkage
{ escrowId: 1 }  // unique

// Cleanup
{ completedAt: 1 }
```

**Validation Rules**:
- `queueItemId` is required and unique
- `userId` is required
- `modelId` is required
- `escrowId` is required and unique
- `amount` > 0
- `status` must be valid enum value
- `priority` >= 0

**Status Flow**:
```
queued → in_progress → finished
queued → abandoned
in_progress → abandoned
in_progress → partial
```

**Notes**:
- Sole authority for settlement/refund decisions
- Links escrow to performance lifecycle
- Status determines if settlement or refund occurs

---

### 7. audit_trail

**Purpose**: Extended audit information for compliance

**Schema**:
```typescript
{
  _id: ObjectId,
  auditId: string,              // Unique audit entry ID
  ledgerEntryId: string,        // Reference to transaction
  ipAddress: string | null,     // Requester IP (if available)
  userAgent: string | null,     // Requester user agent
  initiatedBy: string | null,   // Service or user that initiated
  auditContext: object,         // Additional context (no PII)
  auditedAt: Date
}
```

**Indexes**:
```javascript
// Primary access
{ auditId: 1 }  // unique
{ ledgerEntryId: 1 }

// Audit queries
{ auditedAt: 1 }
{ initiatedBy: 1, auditedAt: 1 }
```

**Validation Rules**:
- `auditId` is required and unique
- `ledgerEntryId` is required
- `auditedAt` defaults to now

**Privacy**:
- IP addresses hashed or anonymized after 90 days
- No PII in auditContext
- User agent for fraud detection only

---

## Relationships

```
wallets (1) ←→ (many) transactions
  via accountId where accountType="user" and balanceState="available"

wallets (1) ←→ (many) escrow_items
  via userId

model_wallets (1) ←→ (many) transactions
  via accountId where accountType="model" and balanceState="earned"

escrow_items (1) ←→ (1) queue_items
  via escrowId (one-to-one)

escrow_items (1) ←→ (many) transactions
  via escrowId

transactions (1) ←→ (1) audit_trail
  via ledgerEntryId (optional, compliance feature)
```

---

## Data Migration

### Initial Wallet Creation
```javascript
// Create wallet for new user
db.wallets.insertOne({
  userId: "user-123",
  availableBalance: NumberDecimal("0"),
  escrowBalance: NumberDecimal("0"),
  currency: "points",
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

### Initial Model Wallet Creation
```javascript
// Create earnings wallet for model
db.model_wallets.insertOne({
  modelId: "model-456",
  earnedBalance: NumberDecimal("0"),
  currency: "points",
  type: "earnings",
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

---

## Backup and Retention

### Backup Strategy
- **Full backups**: Daily
- **Incremental backups**: Hourly
- **Point-in-time recovery**: Enabled
- **Backup retention**: 90 days minimum

### Data Retention
- **transactions**: Minimum 7 years (2555+ days)
- **audit_trail**: Minimum 7 years
- **wallets**: Indefinite (while account active)
- **escrow_items**: Archive after 1 year (keep settled/refunded)
- **idempotency_records**: 24 hours (auto-expire)
- **queue_items**: Archive after 90 days

### Archival Process
```javascript
// Archive old processed escrow items
db.escrow_items_archive.insertMany(
  db.escrow_items.find({
    processedAt: { $lt: new Date(Date.now() - 365*24*60*60*1000) },
    status: { $in: ["settled", "refunded"] }
  })
);
```

---

## Performance Considerations

### Sharding Strategy
- **wallets**: Shard by `userId` (hash-based)
- **model_wallets**: Shard by `modelId` (hash-based)
- **transactions**: Shard by `accountId` (hash-based)
- **escrow_items**: Shard by `userId` (hash-based)

### Read Replicas
- Balance queries can use read replicas
- Transaction writes must use primary
- Read preference: `primaryPreferred` for balance queries

### Caching Strategy
- Cache user balances with short TTL (5-10 seconds)
- Cache model balances with short TTL
- No caching for transaction writes
- Cache idempotency checks (in-memory)

---

## Monitoring and Alerts

### Key Metrics
- Wallet version conflicts (optimistic lock failures)
- Transaction write latency
- Escrow hold failures
- Idempotency cache hit rate
- Reconciliation discrepancies

### Alerts
- **Critical**: Any reconciliation failure
- **Warning**: High optimistic lock conflict rate (>1% of operations)
- **Warning**: Transaction write latency >100ms (p95)
- **Info**: Large balance changes (>10,000 points)

---

## Security Considerations

### Access Control
- **wallets**: Read: user/admin, Write: wallet_service only
- **transactions**: Read: user/admin, Write: wallet_service only (append-only)
- **escrow_items**: Read: user/model/admin, Write: wallet_service/queue_service
- **queue_items**: Read: user/model/admin, Write: queue_service only

### Encryption
- Encrypt at rest: All collections
- Encrypt in transit: TLS 1.3
- Field-level encryption: Not required (no PII stored)

### Audit Logging
- Log all write operations
- Log all failed authorization attempts
- Log all reconciliation runs
- No PII in logs (user IDs only)

---

## Schema Versioning

**Current Version**: 1.0  
**Last Updated**: 2025-12-23

### Migration Process
1. Create new schema version document
2. Implement backward-compatible changes
3. Run migration scripts in staging
4. Deploy application with migration support
5. Run migration in production
6. Verify data integrity
7. Update schema version

---

**This schema is authoritative for RedRoomRewards database implementation. All code must comply with these specifications.**
