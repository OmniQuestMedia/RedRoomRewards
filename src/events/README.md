# Events Module

The Events module provides a robust event-driven architecture for real-time wallet and ledger updates in the RedRoomRewards platform.

## Quick Start

### Publishing Events

Events are automatically published by the wallet service when operations complete. No manual intervention is required for standard wallet operations.

```typescript
import { WalletService } from '../wallets/wallet.service';
import { LedgerService } from '../ledger/ledger.service';

const ledgerService = new LedgerService();
const walletService = new WalletService(ledgerService);

// This automatically publishes an ESCROW_HELD event
await walletService.holdInEscrow({
  userId: 'user-123',
  amount: 100,
  reason: TransactionReason.PERFORMANCE_REQUEST,
  queueItemId: 'queue-456',
  featureType: 'performance',
  idempotencyKey: 'hold-abc',
  requestId: 'req-xyz',
});
```

### Subscribing to Events

Subscribe to wallet events to receive real-time notifications:

```typescript
import { getEventBus, WalletEventType } from '../events';

const eventBus = getEventBus();

eventBus.subscribe({
  subscriberId: 'my-service',
  eventTypes: [WalletEventType.ESCROW_HELD],
  handler: async (event) => {
    console.log('Escrow held:', event.amount, 'for user:', event.userId);
    // Your business logic here
  },
});
```

### Using the Balance Cache

The balance cache provides fast balance lookups without database queries:

```typescript
import { getBalanceCache } from '../events';

const cache = getBalanceCache();

// Get cached balance (returns null if not cached)
const balance = cache.getBalance('user-123', 'user');

if (balance) {
  console.log('Available:', balance.availableBalance);
  console.log('Escrow:', balance.escrowBalance);
  console.log('Last updated:', balance.lastUpdated);
} else {
  // Fall back to database query
  const wallet = await WalletModel.findOne({ userId: 'user-123' });
}
```

## Event Types

### WalletEventType.ESCROW_HELD

Emitted when funds are moved from available balance to escrow.

```typescript
{
  eventId: string;
  eventType: 'wallet.escrow_held';
  userId: string;
  escrowId: string;
  amount: number;
  reason: string;
  transactionId: string;
  userAvailableBalance: number;
  userEscrowBalance: number;
  timestamp: Date;
}
```

### WalletEventType.ESCROW_SETTLED

Emitted when escrow is settled to model earnings.

```typescript
{
  eventId: string;
  eventType: 'wallet.escrow_settled';
  userId: string;
  modelId: string;
  escrowId: string;
  amount: number;
  transactionId: string;
  modelEarnedBalance: number;
  timestamp: Date;
}
```

### WalletEventType.ESCROW_REFUNDED

Emitted when escrow is refunded to user.

```typescript
{
  eventId: string;
  eventType: 'wallet.escrow_refunded';
  userId: string;
  escrowId: string;
  amount: number;
  transactionId: string;
  userAvailableBalance: number;
  userEscrowBalance: number;
  timestamp: Date;
}
```

### WalletEventType.ESCROW_PARTIAL_SETTLED

Emitted when escrow is partially refunded and settled.

```typescript
{
  eventId: string;
  eventType: 'wallet.escrow_partial_settled';
  userId: string;
  modelId: string;
  escrowId: string;
  refundAmount: number;
  settleAmount: number;
  transactionId: string;
  userAvailableBalance: number;
  modelEarnedBalance: number;
  timestamp: Date;
}
```

### WalletEventType.BALANCE_UPDATED

Generic balance update event.

```typescript
{
  eventId: string;
  eventType: 'wallet.balance_updated';
  accountId: string;
  accountType: 'user' | 'model';
  balanceState: 'available' | 'escrow' | 'earned';
  balanceBefore: number;
  balanceAfter: number;
  changeAmount: number;
  reason: string;
  transactionId: string;
  ledgerEntryId: string;
  timestamp: Date;
}
```

## Features

### Idempotency

All events are deduplicated by both event ID and idempotency key:

```typescript
// These won't trigger duplicate processing
await eventBus.publish(event); // First time
await eventBus.publish(event); // Deduplicated by event ID

const event2 = { ...event, eventId: 'new-id' }; // Different event ID
await eventBus.publish(event2); // Deduplicated by idempotency key
```

### Priority-Based Processing

Subscribers can specify priority (lower number = higher priority):

```typescript
eventBus.subscribe({
  subscriberId: 'critical-handler',
  eventTypes: [WalletEventType.ESCROW_HELD],
  handler: criticalHandler,
  priority: 1, // Runs first
});

eventBus.subscribe({
  subscriberId: 'analytics-handler',
  eventTypes: [WalletEventType.ESCROW_HELD],
  handler: analyticsHandler,
  priority: 100, // Runs last
});
```

### Automatic Retry

Failed handlers are automatically retried with exponential backoff:

```typescript
// Handler will be retried up to 3 times
eventBus.subscribe({
  subscriberId: 'unreliable-handler',
  eventTypes: [WalletEventType.ESCROW_HELD],
  handler: async (event) => {
    // May throw temporarily
    await externalService.call();
  },
});
```

### Error Isolation

One failing handler doesn't affect others:

```typescript
// These handlers run independently
eventBus.subscribe({
  subscriberId: 'failing-handler',
  eventTypes: [WalletEventType.ESCROW_HELD],
  handler: async () => { throw new Error('Failed'); },
});

eventBus.subscribe({
  subscriberId: 'working-handler',
  eventTypes: [WalletEventType.ESCROW_HELD],
  handler: async (event) => {
    // This still executes even if failing-handler throws
    console.log('Event processed:', event.eventId);
  },
});
```

## Configuration

### Event Bus

```typescript
import { EventBus } from '../events';

const eventBus = new EventBus({
  enableDeduplication: true,        // Enable idempotency (default: true)
  deduplicationTtlMs: 3600000,      // 1 hour (default)
  maxRetryAttempts: 3,              // Retry count (default: 3)
  retryDelayMs: 1000,               // Retry delay (default: 1000ms)
  asyncProcessing: true,            // Fire and forget (default: true)
});
```

### Balance Cache

```typescript
import { BalanceSnapshotCache } from '../events';

const cache = new BalanceSnapshotCache({
  enabled: true,                    // Enable cache (default: true)
  maxSize: 10000,                   // Max entries (default: 10000)
  ttlMs: 3600000,                   // 1 hour (default)
});
```

## Common Patterns

### Activity Feed Integration

```typescript
eventBus.subscribe({
  subscriberId: 'activity-feed',
  eventTypes: [
    WalletEventType.ESCROW_HELD,
    WalletEventType.ESCROW_SETTLED,
    WalletEventType.ESCROW_REFUNDED,
  ],
  handler: async (event) => {
    await activityFeedService.createEntry({
      userId: event.userId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      metadata: { amount: event.amount },
    });
  },
});
```

### Real-Time Notifications

```typescript
eventBus.subscribe({
  subscriberId: 'notification-service',
  eventTypes: [WalletEventType.ESCROW_SETTLED],
  handler: async (event) => {
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

### Analytics Tracking

```typescript
eventBus.subscribe({
  subscriberId: 'analytics',
  eventTypes: [
    WalletEventType.ESCROW_HELD,
    WalletEventType.ESCROW_SETTLED,
  ],
  handler: async (event) => {
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

### Audit Logging

```typescript
eventBus.subscribe({
  subscriberId: 'audit-logger',
  eventTypes: [
    WalletEventType.ESCROW_HELD,
    WalletEventType.ESCROW_SETTLED,
    WalletEventType.ESCROW_REFUNDED,
    WalletEventType.ESCROW_PARTIAL_SETTLED,
  ],
  handler: async (event) => {
    await auditLog.record({
      eventId: event.eventId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      metadata: event,
    });
  },
  priority: 1, // High priority for audit logs
});
```

## Testing

### Unit Testing Event Handlers

```typescript
import { EventBus, WalletEventType } from '../events';

describe('MyEventHandler', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus({ asyncProcessing: false });
  });

  it('should process escrow held event', async () => {
    const handledEvents = [];
    
    eventBus.subscribe({
      subscriberId: 'test',
      eventTypes: [WalletEventType.ESCROW_HELD],
      handler: async (event) => handledEvents.push(event),
    });

    await eventBus.publish(mockEscrowHeldEvent);
    
    expect(handledEvents).toHaveLength(1);
    expect(handledEvents[0].amount).toBe(100);
  });
});
```

### Integration Testing with Wallet Service

```typescript
describe('Wallet Event Integration', () => {
  it('should emit events for wallet operations', async () => {
    const events = [];
    
    getEventBus().subscribe({
      subscriberId: 'test',
      eventTypes: [WalletEventType.ESCROW_HELD],
      handler: async (event) => events.push(event),
    });

    await walletService.holdInEscrow({
      userId: 'user-123',
      amount: 100,
      // ... other params
    });

    expect(events).toHaveLength(1);
    expect(events[0].userId).toBe('user-123');
  });
});
```

## Monitoring

The event system emits metrics for operational visibility:

- `EVENT_PUBLISHED`: Event successfully published
- `EVENT_DUPLICATE_DETECTED`: Duplicate event prevented
- `EVENT_NO_SUBSCRIBERS`: No handlers registered
- `EVENT_HANDLER_SUCCESS`: Handler executed successfully
- `EVENT_HANDLER_ERROR`: Handler failed
- `WALLET_EVENT_PUBLISHED`: Wallet event emitted
- `WALLET_EVENT_PUBLISH_ERROR`: Failed to publish event

Monitor these metrics to ensure healthy event flow.

## Best Practices

1. **Use unique subscriber IDs**: Avoid conflicts with other services
2. **Handle errors gracefully**: Don't throw from event handlers unless necessary
3. **Keep handlers fast**: Avoid long-running operations in handlers
4. **Use appropriate priorities**: Critical operations first, analytics last
5. **Log important events**: Track processing for debugging
6. **Test idempotency**: Verify handlers can process events multiple times safely
7. **Monitor metrics**: Watch for handler failures and bottlenecks
8. **Clean up subscriptions**: Unsubscribe when services shut down

## Troubleshooting

### Events Not Being Received

1. Check if subscriber is registered before events are published
2. Verify event types match what's being published
3. Check if handler is throwing errors (view metrics)
4. Ensure event bus is properly initialized

### Duplicate Event Processing

1. Verify idempotency keys are unique per operation
2. Check TTL configuration is appropriate
3. Look for race conditions in handler logic

### Performance Issues

1. Reduce number of subscribers
2. Optimize slow event handlers
3. Use priority to defer non-critical processing
4. Consider async processing for high-volume scenarios

## Further Reading

- [Complete Event Architecture Documentation](../../docs/EVENT_ARCHITECTURE.md)
- [Wallet Service Documentation](../wallets/README.md)
- [Ledger Service Documentation](../ledger/README.md)
