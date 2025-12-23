# Queue Integration Guide

**Document Type**: Integration Specification  
**Status**: Authoritative  
**Date**: 2025-12-23  
**Applies To**: Performance Queue Service

---

## Overview

This document defines how the Performance Queue service integrates with the RedRoomRewards wallet and escrow system. The queue is the **sole authority** for settlement and refund decisions.

**Reference**: See `/docs/WALLET_ESCROW_ARCHITECTURE.md` Section 4 for architecture details.

---

## Queue Authority Model

### What Queue CAN Do
- ✅ Decide when to settle escrow
- ✅ Decide when to refund escrow
- ✅ Decide partial settlement amounts
- ✅ Track performance lifecycle
- ✅ Issue settlement authorization tokens
- ✅ Issue refund authorization tokens

### What Queue CANNOT Do
- ❌ Deduct user balance directly
- ❌ Credit model balance directly
- ❌ Modify wallet balances
- ❌ Create ledger entries
- ❌ Execute financial transactions

**Principle**: Queue makes decisions (WHAT), Wallet Service executes transactions (HOW).

---

## Integration Flow

### 1. Queue Item Creation

**Trigger**: Feature module holds funds in escrow

**Input**: Queue intake event from feature
```typescript
interface QueueIntakeRequest {
  userId: string;
  modelId: string;
  escrowId: string;  // Critical: links queue to escrow
  amount: number;
  featureType: string;
  priority?: number;
  metadata?: Record<string, any>;
}
```

**Process**:
1. Feature holds funds in escrow
2. Feature emits queue intake request
3. Queue validates request
4. Queue creates queue item with status "queued"
5. Queue links to escrow via escrowId

**Implementation**:
```typescript
async function enqueue(request: QueueIntakeRequest): Promise<QueueItem> {
  // Validate escrow exists and is in "held" status
  const escrow = await escrowService.getEscrow(request.escrowId);
  if (!escrow || escrow.status !== EscrowStatus.HELD) {
    throw new Error('Invalid escrow for queue');
  }
  
  // Create queue item
  const queueItem: QueueItem = {
    queueItemId: generateId(),
    userId: request.userId,
    modelId: request.modelId,
    escrowId: request.escrowId,
    amount: request.amount,
    featureType: request.featureType,
    status: QueueItemStatus.QUEUED,
    priority: request.priority || 0,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    metadata: request.metadata
  };
  
  await queueRepository.insert(queueItem);
  return queueItem;
}
```

---

### 2. Performance Start

**Trigger**: Model begins performance

**Process**:
1. Queue marks item as "in_progress"
2. Queue updates startedAt timestamp
3. No wallet interaction yet

**Implementation**:
```typescript
async function startPerformance(queueItemId: string): Promise<QueueItem> {
  const item = await queueRepository.findById(queueItemId);
  
  if (item.status !== QueueItemStatus.QUEUED) {
    throw new Error('Item not in queued status');
  }
  
  item.status = QueueItemStatus.IN_PROGRESS;
  item.startedAt = new Date();
  
  await queueRepository.update(item);
  return item;
}
```

---

### 3. Performance Completion (Settlement)

**Trigger**: Performance successfully completed

**Process**:
1. Queue decides to settle
2. Queue generates settlement authorization token
3. Queue calls Wallet Service to settle escrow
4. Queue marks item as "finished"
5. Queue updates completedAt timestamp

**Authorization Token**:
```typescript
interface QueueSettlementAuthorization {
  queueItemId: string;
  token: string;  // Signed JWT
  escrowId: string;
  modelId: string;
  amount: number;
  reason: TransactionReason;
  issuedAt: Date;
  expiresAt: Date;
}
```

**Token Generation**:
```typescript
function generateSettlementToken(
  queueItem: QueueItem
): QueueSettlementAuthorization {
  const payload = {
    queueItemId: queueItem.queueItemId,
    escrowId: queueItem.escrowId,
    modelId: queueItem.modelId,
    amount: queueItem.amount,
    reason: TransactionReason.PERFORMANCE_COMPLETED,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
  };
  
  const token = jwt.sign(payload, config.queueAuthSecret, {
    algorithm: 'HS256',
    expiresIn: '5m'
  });
  
  return { ...payload, token };
}
```

**Settlement Call**:
```typescript
async function finishPerformance(
  queueItemId: string,
  modelId: string
): Promise<{ queueItem: QueueItem; settlement: EscrowSettleResponse }> {
  const item = await queueRepository.findById(queueItemId);
  
  if (item.status !== QueueItemStatus.IN_PROGRESS) {
    throw new Error('Item not in progress');
  }
  
  // Generate authorization
  const authorization = generateSettlementToken(item);
  
  // Call wallet service to settle
  const settlementRequest: EscrowSettleRequest = {
    escrowId: item.escrowId,
    modelId,
    amount: item.amount,
    queueItemId: item.queueItemId,
    reason: TransactionReason.PERFORMANCE_COMPLETED,
    authorizationToken: authorization.token,
    idempotencyKey: generateIdempotencyKey(queueItemId, 'settle'),
    requestId: generateRequestId(),
    metadata: {
      featureType: item.featureType,
      performanceDuration: Date.now() - item.startedAt!.getTime()
    }
  };
  
  const settlement = await walletService.settleEscrow(
    settlementRequest,
    authorization
  );
  
  // Update queue item
  item.status = QueueItemStatus.FINISHED;
  item.completedAt = new Date();
  await queueRepository.update(item);
  
  return { queueItem: item, settlement };
}
```

---

### 4. Performance Abandonment (Refund)

**Trigger**: Performance cancelled or abandoned

**Process**:
1. Queue decides to refund
2. Queue generates refund authorization token
3. Queue calls Wallet Service to refund escrow
4. Queue marks item as "abandoned"
5. Queue updates completedAt timestamp

**Refund Scenarios**:
- User disconnects before performance starts
- Model declines performance
- Rope-drop timeout expires
- Admin cancels performance

**Refund Call**:
```typescript
async function abandonPerformance(
  queueItemId: string,
  reason: TransactionReason
): Promise<{ queueItem: QueueItem; refund: EscrowRefundResponse }> {
  const item = await queueRepository.findById(queueItemId);
  
  if (item.status === QueueItemStatus.FINISHED) {
    throw new Error('Cannot abandon finished performance');
  }
  
  // Generate authorization
  const authorization = generateRefundToken(item, reason);
  
  // Call wallet service to refund
  const refundRequest: EscrowRefundRequest = {
    escrowId: item.escrowId,
    userId: item.userId,
    amount: item.amount,
    queueItemId: item.queueItemId,
    reason,
    authorizationToken: authorization.token,
    idempotencyKey: generateIdempotencyKey(queueItemId, 'refund'),
    requestId: generateRequestId(),
    metadata: {
      featureType: item.featureType,
      abandonReason: reason
    }
  };
  
  const refund = await walletService.refundEscrow(
    refundRequest,
    authorization
  );
  
  // Update queue item
  item.status = QueueItemStatus.ABANDONED;
  item.statusReason = reason;
  item.completedAt = new Date();
  await queueRepository.update(item);
  
  return { queueItem: item, refund };
}
```

---

### 5. Partial Completion (Partial Settlement)

**Trigger**: Partial performance delivered

**Process**:
1. Queue decides to split settlement
2. Queue calculates refund and settle amounts
3. Queue generates partial settlement authorization
4. Queue calls Wallet Service to partial settle
5. Queue marks item as "partial"

**Use Cases**:
- Performance interrupted mid-way
- Quality issues
- Partial fulfillment

**Validation**:
```typescript
// refundAmount + settleAmount MUST equal original escrow amount
if (refundAmount + settleAmount !== item.amount) {
  throw new Error('Partial amounts must sum to escrow amount');
}

if (refundAmount < 0 || settleAmount < 0) {
  throw new Error('Amounts cannot be negative');
}
```

**Partial Settlement Call**:
```typescript
async function partialCompletion(
  queueItemId: string,
  refundAmount: number,
  settleAmount: number,
  reason: TransactionReason
): Promise<{ queueItem: QueueItem; partialSettle: EscrowPartialSettleResponse }> {
  const item = await queueRepository.findById(queueItemId);
  
  // Validate amounts
  if (refundAmount + settleAmount !== item.amount) {
    throw new Error('Amounts must sum to escrow total');
  }
  
  // Generate authorization
  const authorization = generatePartialSettlementToken(
    item,
    refundAmount,
    settleAmount,
    reason
  );
  
  // Call wallet service
  const partialRequest: EscrowPartialSettleRequest = {
    escrowId: item.escrowId,
    userId: item.userId,
    modelId: item.modelId,
    refundAmount,
    settleAmount,
    queueItemId: item.queueItemId,
    reason,
    authorizationToken: authorization.token,
    idempotencyKey: generateIdempotencyKey(queueItemId, 'partial'),
    requestId: generateRequestId(),
    metadata: {
      featureType: item.featureType,
      partialReason: reason
    }
  };
  
  const partialSettle = await walletService.partialSettleEscrow(
    partialRequest,
    authorization
  );
  
  // Update queue item
  item.status = QueueItemStatus.PARTIAL;
  item.statusReason = reason;
  item.completedAt = new Date();
  await queueRepository.update(item);
  
  return { queueItem: item, partialSettle };
}
```

---

## Authorization Token Security

### Token Structure
```json
{
  "queueItemId": "queue-123",
  "escrowId": "esc-456",
  "modelId": "model-789",
  "amount": 100,
  "reason": "performance_completed",
  "issuedAt": "2025-12-23T12:00:00Z",
  "expiresAt": "2025-12-23T12:05:00Z"
}
```

### Token Signing
- Algorithm: HS256 (HMAC with SHA-256)
- Secret: Shared secret between queue and wallet service
- Expiry: 5 minutes (short-lived)

### Token Validation (Wallet Service)
```typescript
function validateQueueAuthorization(
  token: string,
  request: EscrowSettleRequest
): boolean {
  try {
    // Verify JWT signature
    const payload = jwt.verify(token, config.queueAuthSecret) as any;
    
    // Check expiry
    if (new Date(payload.expiresAt) < new Date()) {
      throw new Error('Token expired');
    }
    
    // Validate request matches token
    if (payload.queueItemId !== request.queueItemId) {
      throw new Error('Queue item ID mismatch');
    }
    
    if (payload.escrowId !== request.escrowId) {
      throw new Error('Escrow ID mismatch');
    }
    
    if (payload.amount !== request.amount) {
      throw new Error('Amount mismatch');
    }
    
    return true;
  } catch (error) {
    throw new InvalidAuthorizationError(error.message);
  }
}
```

---

## Error Handling

### Queue Errors
```typescript
class QueueError extends Error {
  constructor(
    message: string,
    public code: string,
    public queueItemId?: string
  ) {
    super(message);
    this.name = 'QueueError';
  }
}

class InvalidQueueStateError extends QueueError {
  constructor(queueItemId: string, currentState: string, expectedState: string) {
    super(
      `Invalid queue state. Expected ${expectedState}, got ${currentState}`,
      'INVALID_QUEUE_STATE',
      queueItemId
    );
  }
}

class EscrowLinkageError extends QueueError {
  constructor(escrowId: string) {
    super(
      `Escrow not found or invalid: ${escrowId}`,
      'ESCROW_LINKAGE_ERROR'
    );
  }
}
```

### Wallet Service Errors
Handle all wallet service errors:
- `InsufficientBalanceError` (402)
- `EscrowNotFoundError` (404)
- `EscrowAlreadyProcessedError` (409)
- `InvalidAuthorizationError` (403)
- `OptimisticLockError` (409)

### Retry Strategy
```typescript
async function settleWithRetry(
  request: EscrowSettleRequest,
  authorization: QueueSettlementAuthorization,
  maxRetries: number = 3
): Promise<EscrowSettleResponse> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await walletService.settleEscrow(request, authorization);
    } catch (error) {
      lastError = error;
      
      // Retry on transient errors only
      if (error instanceof OptimisticLockError && attempt < maxRetries - 1) {
        await sleep(Math.pow(2, attempt) * 100); // Exponential backoff
        continue;
      }
      
      // Don't retry on permanent errors
      throw error;
    }
  }
  
  throw lastError!;
}
```

---

## Idempotency

### Queue Operations
Queue must generate unique idempotency keys:
```typescript
function generateIdempotencyKey(
  queueItemId: string,
  operation: 'settle' | 'refund' | 'partial'
): string {
  // Format: queue-{queueItemId}-{operation}
  return `queue-${queueItemId}-${operation}`;
}
```

### Duplicate Settlement Protection
- Same queueItemId cannot be settled twice
- Wallet service enforces this with idempotency
- Queue should also track processed items

---

## Monitoring and Alerts

### Key Metrics
- Queue processing time (queued → finished)
- Settlement success rate
- Refund rate
- Authorization token failures
- Escrow orphans (held but no queue item)

### Alerts
- **Critical**: Escrow held without queue item (>5 minutes)
- **Warning**: High refund rate (>20% of items)
- **Warning**: Authorization failures (>1% of calls)
- **Info**: Long queue processing time (>1 hour)

---

## Testing Requirements

### Unit Tests
- [ ] Queue item creation
- [ ] Performance start/finish
- [ ] Settlement authorization generation
- [ ] Refund authorization generation
- [ ] Partial settlement calculations
- [ ] Error handling for all scenarios

### Integration Tests
- [ ] End-to-end escrow flow (hold → settle)
- [ ] End-to-end refund flow (hold → refund)
- [ ] Partial settlement flow
- [ ] Idempotency (duplicate settlement attempts)
- [ ] Authorization validation
- [ ] Error propagation

### Edge Cases
- [ ] User disconnects during performance
- [ ] Queue item abandoned after settlement call
- [ ] Authorization token expired
- [ ] Escrow already processed
- [ ] Amount mismatch in partial settlement

---

## Deployment Checklist

Before deploying queue service:
- [ ] Shared secret configured between queue and wallet service
- [ ] Authorization token expiry appropriate (5 minutes)
- [ ] Retry logic configured
- [ ] Monitoring dashboards set up
- [ ] Alerts configured
- [ ] Documentation updated
- [ ] Integration tests passing

---

## Document Maintenance

**Version**: 1.0  
**Last Updated**: 2025-12-23  
**Review Schedule**: Quarterly or when architecture changes

---

**This integration guide is authoritative for queue service implementation.**
