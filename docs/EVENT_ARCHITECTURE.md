# Real-Time Event-Driven Architecture

## Overview

The RedRoomRewards platform implements a robust event-driven architecture for real-time wallet and ledger updates. This design ensures all balance changes are immediately propagated to interested subscribers while maintaining strict idempotency and consistency guarantees.

## Architecture Components

### 1. Event Bus

The `EventBus` is the central component that manages event publishing and subscription:

- **In-memory event distribution** with fire-and-forget semantics
- **Idempotency guarantees** via event ID and idempotency key deduplication
- **Automatic retry logic** for failed event handlers (configurable)
- **Priority-based subscriber ordering** for deterministic event processing
- **Metrics and monitoring** integration for operational visibility

### 2. Event Types

All events extend `BaseRewardEvent` and include:

- `eventId`: Unique identifier for the event
- `eventType`: Discriminator for event type
- `idempotencyKey`: Key for deduplication
- `timestamp`: When the event was created
- `correlationId`: Optional ID for tracing related events
- `source`: System that emitted the event
- `version`: Schema version for evolution

#### Wallet Event Types

1. **ESCROW_HELD**: Funds moved from available to escrow
2. **ESCROW_SETTLED**: Funds moved from escrow to model earnings
3. **ESCROW_REFUNDED**: Funds returned from escrow to available
4. **ESCROW_PARTIAL_SETTLED**: Partial refund and settlement
5. **BALANCE_UPDATED**: Generic balance change notification
6. **LEDGER_ENTRY_CREATED**: New ledger entry recorded

### 3. Event Publishers

`WalletEventPublisher` provides static methods for publishing wallet events:

```typescript
await WalletEventPublisher.publishEscrowHeld({
  userId: 'user-123',
  escrowId: 'escrow-456',
  amount: 100,
  reason: TransactionReason.PERFORMANCE_REQUEST,
  queueItemId: 'queue-789',
  featureType: 'performance',
  transactionId: 'tx-abc',
  userAvailableBalance: 900,
  userEscrowBalance: 100,
  idempotencyKey: 'hold-123',
});
```

### 4. Event Subscribers

Any component can subscribe to events by registering with the event bus:

```typescript
const eventBus = getEventBus();

eventBus.subscribe({
  subscriberId: 'my-subscriber',
  eventTypes: [WalletEventType.ESCROW_HELD],
  handler: async (event) => {
    // Process event
    console.log('Escrow held:', event);
  },
  priority: 10, // Lower = higher priority
});
```

## Idempotency Guarantees

### Event-Level Idempotency

The event bus prevents duplicate event processing through:

1. **Event ID tracking**: Each event has a unique ID that is tracked
2. **Idempotency key tracking**: Operations with the same key are deduplicated
3. **TTL-based cleanup**: Old events are removed from cache after configurable TTL

### Operation-Level Idempotency

Wallet operations include their own idempotency checks:

1. **Database-backed idempotency records**: Stored in `IdempotencyRecordModel`
2. **Operation type scoping**: Same key can be reused for different operation types
3. **Result caching**: Original responses are stored for duplicate requests

## Race Condition Handling

### Optimistic Locking

All wallet operations use optimistic locking to prevent race conditions:

```typescript
// Update wallet with version check
const updated = await WalletModel.findOneAndUpdate(
  { 
    userId: { $eq: userId },
    version: { $eq: currentVersion }, // Optimistic lock
  },
  {
    $set: {
      availableBalance: newBalance,
      version: currentVersion + 1, // Increment version
    },
  },
  { new: true }
);

if (!updated) {
  throw new OptimisticLockError('wallet', userId);
}
```

### Automatic Retry Logic

When an optimistic lock conflict occurs:

1. Operation catches `OptimisticLockError`
2. Waits with exponential backoff (100ms, 200ms, 400ms, ...)
3. Retries the operation (up to 3 attempts by default)
4. Fails with error if all retries exhausted

### Concurrency Safety

The combination of optimistic locking and retry logic ensures:

- **No lost updates**: Concurrent operations don't overwrite each other
- **Eventual consistency**: Operations eventually succeed or fail decisively
- **Balance integrity**: Total balance always equals sum of all state balances

## Usage Examples

### Example 1: Real-Time Balance Cache

```typescript
import { getBalanceCache } from './events/balance-snapshot-cache';

// Cache automatically subscribes to balance events
const cache = getBalanceCache();

// Fast balance lookup without DB query
const balance = cache.getBalance('user-123', 'user');
if (balance) {
  console.log('Available:', balance.availableBalance);
  console.log('Escrow:', balance.escrowBalance);
  console.log('Last updated:', balance.lastUpdated);
}
```

### Example 2: Activity Feed Integration

```typescript
const eventBus = getEventBus();

eventBus.subscribe({
  subscriberId: 'activity-feed',
  eventTypes: [
    WalletEventType.ESCROW_HELD,
    WalletEventType.ESCROW_SETTLED,
    WalletEventType.ESCROW_REFUNDED,
  ],
  handler: async (event) => {
    // Create activity feed entry
    await activityFeedService.createEntry({
      userId: event.userId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      metadata: {
        amount: event.amount,
        reason: event.reason,
      },
    });
  },
});
```

### Example 3: Notification Service

```typescript
eventBus.subscribe({
  subscriberId: 'notification-service',
  eventTypes: [WalletEventType.ESCROW_SETTLED],
  handler: async (event) => {
    // Notify model of earnings
    await notificationService.send({
      recipientId: event.modelId,
      template: 'earnings_received',
      variables: {
        amount: event.amount,
        timestamp: event.timestamp,
      },
    });
  },
});
```

### Example 4: Analytics and Reporting

```typescript
eventBus.subscribe({
  subscriberId: 'analytics',
  eventTypes: [
    WalletEventType.ESCROW_HELD,
    WalletEventType.ESCROW_SETTLED,
  ],
  handler: async (event) => {
    // Track metrics
    await analyticsService.track({
      eventType: event.eventType,
      userId: event.userId,
      amount: event.amount,
      timestamp: event.timestamp,
    });
  },
  priority: 50, // Lower priority for analytics
});
```

## Testing

### Unit Tests

Test event publishing and subscription:

```typescript
const eventBus = new EventBus({ asyncProcessing: false });
const handledEvents: RewardEvent[] = [];

eventBus.subscribe({
  subscriberId: 'test',
  eventTypes: [WalletEventType.ESCROW_HELD],
  handler: async (event) => handledEvents.push(event),
});

await eventBus.publish(event);
expect(handledEvents).toHaveLength(1);
```

### Integration Tests

Test with real wallet operations:

```typescript
// Setup event subscriber
const balances: any[] = [];
eventBus.subscribe({
  subscriberId: 'test-subscriber',
  eventTypes: [WalletEventType.ESCROW_HELD],
  handler: async (event) => balances.push(event),
});

// Perform wallet operation
await walletService.holdInEscrow({
  userId: 'user-123',
  amount: 100,
  // ... other params
});

// Verify event was published
expect(balances).toHaveLength(1);
expect(balances[0].amount).toBe(100);
```

### Concurrency Tests

Test race condition handling:

```typescript
// Execute concurrent operations
const results = await Promise.allSettled([
  walletService.holdInEscrow(request1),
  walletService.holdInEscrow(request2),
  walletService.holdInEscrow(request3),
]);

// Verify all succeeded or failed gracefully
const succeeded = results.filter(r => r.status === 'fulfilled');
expect(succeeded.length).toBeGreaterThan(0);

// Verify balance consistency
const wallet = await WalletModel.findOne({ userId });
expect(wallet.availableBalance + wallet.escrowBalance).toBe(initialBalance);
```

## Configuration

### Event Bus Configuration

```typescript
const eventBus = new EventBus({
  enableDeduplication: true,        // Enable idempotency
  deduplicationTtlMs: 3600000,      // 1 hour TTL
  maxRetryAttempts: 3,              // Retry failed handlers 3 times
  retryDelayMs: 1000,               // 1 second between retries
  asyncProcessing: true,            // Fire and forget
});
```

### Wallet Service Configuration

```typescript
const walletService = new WalletService(ledgerService, {
  maxRetryAttempts: 3,              // Retry on lock conflicts
  retryBackoffMs: 100,              // Exponential backoff base
  defaultCurrency: 'points',        // Default currency
});
```

### Balance Cache Configuration

```typescript
const cache = new BalanceSnapshotCache({
  enabled: true,                    // Enable cache
  maxSize: 10000,                   // Cache up to 10k balances
  ttlMs: 3600000,                   // 1 hour TTL
});
```

## Monitoring and Metrics

All event operations emit metrics for monitoring:

- `EVENT_PUBLISHED`: Event successfully published
- `EVENT_DUPLICATE_DETECTED`: Idempotency key reused
- `EVENT_NO_SUBSCRIBERS`: No handlers registered
- `EVENT_HANDLER_SUCCESS`: Handler processed successfully
- `EVENT_HANDLER_ERROR`: Handler failed
- `WALLET_EVENT_PUBLISHED`: Wallet event emitted
- `WALLET_EVENT_PUBLISH_ERROR`: Failed to publish event

## Best Practices

1. **Always use idempotency keys**: Ensure safe retries
2. **Subscribe early**: Register handlers before operations start
3. **Handle failures gracefully**: Event publishing failures don't fail operations
4. **Use appropriate priorities**: Critical handlers should run first
5. **Monitor event flow**: Track metrics for operational health
6. **Test concurrency**: Validate race condition handling
7. **Document subscribers**: Keep registry of all event consumers
8. **Version events**: Plan for schema evolution

## Migration Guide

To add event publishing to existing operations:

1. Import `WalletEventPublisher`
2. Call appropriate publish method after successful operation
3. Wrap in try-catch to prevent operation failures
4. Log errors but don't throw

Example:

```typescript
// After successful wallet operation
try {
  await WalletEventPublisher.publishEscrowHeld({
    userId,
    escrowId,
    amount,
    // ... other params
  });
} catch (eventError) {
  console.error('Failed to publish event:', eventError);
  // Don't throw - operation already succeeded
}
```

## Future Enhancements

1. **Persistent event store**: For audit and replay
2. **Dead letter queue**: For permanently failed handlers
3. **Event versioning**: Schema evolution support
4. **Multi-tenancy**: Namespace isolation
5. **Rate limiting**: Prevent subscriber overload
6. **Circuit breaker**: Disable failing handlers automatically
7. **Batch publishing**: Optimize high-volume scenarios
8. **External event bus**: RabbitMQ, Kafka integration
