/**
 * Event Bus Tests
 * 
 * Tests for event publishing, subscription, idempotency, and concurrency handling.
 */

import { EventBus, resetEventBus } from '../event-bus';
import {
  WalletEventType,
  EscrowHeldEvent,
  EventHandler,
  BaseRewardEvent,
} from '../types';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    resetEventBus();
    eventBus = new EventBus({
      enableDeduplication: true,
      deduplicationTtlMs: 10000,
      maxRetryAttempts: 3,
      retryDelayMs: 100,
      asyncProcessing: false, // Synchronous for testing
    });
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('Event Publishing and Subscription', () => {
    it('should publish event to subscribers', async () => {
      const handledEvents: BaseRewardEvent[] = [];
      
      const handler: EventHandler = async (event) => {
        handledEvents.push(event);
      };

      eventBus.subscribe({
        subscriberId: 'test-subscriber',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler,
      });

      const event: EscrowHeldEvent = {
        eventId: 'event-1',
        eventType: WalletEventType.ESCROW_HELD,
        idempotencyKey: 'idem-1',
        timestamp: new Date(),
        source: 'test',
        version: '1.0',
        userId: 'user-1',
        escrowId: 'escrow-1',
        amount: 100,
        reason: 'test_hold',
        queueItemId: 'queue-1',
        featureType: 'test',
        transactionId: 'tx-1',
        userAvailableBalance: 900,
        userEscrowBalance: 100,
      };

      const result = await eventBus.publish(event);

      expect(result.success).toBe(true);
      expect(result.handlersNotified).toBe(1);
      expect(handledEvents).toHaveLength(1);
      expect(handledEvents[0].eventId).toBe('event-1');
    });

    it('should handle multiple subscribers', async () => {
      const handledBy1: BaseRewardEvent[] = [];
      const handledBy2: BaseRewardEvent[] = [];

      eventBus.subscribe({
        subscriberId: 'subscriber-1',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: async (event) => handledBy1.push(event),
      });

      eventBus.subscribe({
        subscriberId: 'subscriber-2',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: async (event) => handledBy2.push(event),
      });

      const event: EscrowHeldEvent = {
        eventId: 'event-2',
        eventType: WalletEventType.ESCROW_HELD,
        idempotencyKey: 'idem-2',
        timestamp: new Date(),
        source: 'test',
        version: '1.0',
        userId: 'user-1',
        escrowId: 'escrow-1',
        amount: 100,
        reason: 'test_hold',
        queueItemId: 'queue-1',
        featureType: 'test',
        transactionId: 'tx-1',
        userAvailableBalance: 900,
        userEscrowBalance: 100,
      };

      const result = await eventBus.publish(event);

      expect(result.handlersNotified).toBe(2);
      expect(handledBy1).toHaveLength(1);
      expect(handledBy2).toHaveLength(1);
    });

    it('should respect subscriber priority', async () => {
      const executionOrder: string[] = [];

      eventBus.subscribe({
        subscriberId: 'low-priority',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: async () => executionOrder.push('low'),
        priority: 100,
      });

      eventBus.subscribe({
        subscriberId: 'high-priority',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: async () => executionOrder.push('high'),
        priority: 1,
      });

      const event: EscrowHeldEvent = {
        eventId: 'event-3',
        eventType: WalletEventType.ESCROW_HELD,
        idempotencyKey: 'idem-3',
        timestamp: new Date(),
        source: 'test',
        version: '1.0',
        userId: 'user-1',
        escrowId: 'escrow-1',
        amount: 100,
        reason: 'test_hold',
        queueItemId: 'queue-1',
        featureType: 'test',
        transactionId: 'tx-1',
        userAvailableBalance: 900,
        userEscrowBalance: 100,
      };

      await eventBus.publish(event);

      expect(executionOrder).toEqual(['high', 'low']);
    });

    it('should unsubscribe correctly', async () => {
      const handledEvents: BaseRewardEvent[] = [];

      eventBus.subscribe({
        subscriberId: 'temp-subscriber',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: async (event) => handledEvents.push(event),
      });

      eventBus.unsubscribe('temp-subscriber');

      const event: EscrowHeldEvent = {
        eventId: 'event-4',
        eventType: WalletEventType.ESCROW_HELD,
        idempotencyKey: 'idem-4',
        timestamp: new Date(),
        source: 'test',
        version: '1.0',
        userId: 'user-1',
        escrowId: 'escrow-1',
        amount: 100,
        reason: 'test_hold',
        queueItemId: 'queue-1',
        featureType: 'test',
        transactionId: 'tx-1',
        userAvailableBalance: 900,
        userEscrowBalance: 100,
      };

      const result = await eventBus.publish(event);

      expect(result.handlersNotified).toBe(0);
      expect(handledEvents).toHaveLength(0);
    });
  });

  describe('Idempotency', () => {
    it('should prevent duplicate event processing by eventId', async () => {
      const handledEvents: BaseRewardEvent[] = [];

      eventBus.subscribe({
        subscriberId: 'test-subscriber',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: async (event) => handledEvents.push(event),
      });

      const event: EscrowHeldEvent = {
        eventId: 'event-5',
        eventType: WalletEventType.ESCROW_HELD,
        idempotencyKey: 'idem-5',
        timestamp: new Date(),
        source: 'test',
        version: '1.0',
        userId: 'user-1',
        escrowId: 'escrow-1',
        amount: 100,
        reason: 'test_hold',
        queueItemId: 'queue-1',
        featureType: 'test',
        transactionId: 'tx-1',
        userAvailableBalance: 900,
        userEscrowBalance: 100,
      };

      // Publish twice
      await eventBus.publish(event);
      await eventBus.publish(event);

      // Should only be handled once
      expect(handledEvents).toHaveLength(1);
    });

    it('should prevent duplicate event processing by idempotencyKey', async () => {
      const handledEvents: BaseRewardEvent[] = [];

      eventBus.subscribe({
        subscriberId: 'test-subscriber',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: async (event) => handledEvents.push(event),
      });

      const event1: EscrowHeldEvent = {
        eventId: 'event-6',
        eventType: WalletEventType.ESCROW_HELD,
        idempotencyKey: 'same-idem-key',
        timestamp: new Date(),
        source: 'test',
        version: '1.0',
        userId: 'user-1',
        escrowId: 'escrow-1',
        amount: 100,
        reason: 'test_hold',
        queueItemId: 'queue-1',
        featureType: 'test',
        transactionId: 'tx-1',
        userAvailableBalance: 900,
        userEscrowBalance: 100,
      };

      const event2: EscrowHeldEvent = {
        ...event1,
        eventId: 'event-7', // Different event ID
        // Same idempotencyKey
      };

      await eventBus.publish(event1);
      await eventBus.publish(event2);

      // Should only be handled once due to idempotency key
      expect(handledEvents).toHaveLength(1);
    });
  });

  describe('Error Handling and Retries', () => {
    it('should retry failed handlers', async () => {
      let attempts = 0;

      const failingHandler: EventHandler = async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        // Success on second attempt
      };

      eventBus.subscribe({
        subscriberId: 'failing-subscriber',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: failingHandler,
      });

      const event: EscrowHeldEvent = {
        eventId: 'event-8',
        eventType: WalletEventType.ESCROW_HELD,
        idempotencyKey: 'idem-8',
        timestamp: new Date(),
        source: 'test',
        version: '1.0',
        userId: 'user-1',
        escrowId: 'escrow-1',
        amount: 100,
        reason: 'test_hold',
        queueItemId: 'queue-1',
        featureType: 'test',
        transactionId: 'tx-1',
        userAvailableBalance: 900,
        userEscrowBalance: 100,
      };

      const result = await eventBus.publish(event);

      expect(attempts).toBe(2);
      expect(result.success).toBe(true);
    });

    it('should report errors after max retries', async () => {
      const alwaysFailHandler: EventHandler = async () => {
        throw new Error('Persistent failure');
      };

      eventBus.subscribe({
        subscriberId: 'always-failing',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: alwaysFailHandler,
      });

      const event: EscrowHeldEvent = {
        eventId: 'event-9',
        eventType: WalletEventType.ESCROW_HELD,
        idempotencyKey: 'idem-9',
        timestamp: new Date(),
        source: 'test',
        version: '1.0',
        userId: 'user-1',
        escrowId: 'escrow-1',
        amount: 100,
        reason: 'test_hold',
        queueItemId: 'queue-1',
        featureType: 'test',
        transactionId: 'tx-1',
        userAvailableBalance: 900,
        userEscrowBalance: 100,
      };

      const result = await eventBus.publish(event);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].subscriberId).toBe('always-failing');
    });

    it('should not affect other handlers when one fails', async () => {
      const successfulEvents: BaseRewardEvent[] = [];

      eventBus.subscribe({
        subscriberId: 'failing-handler',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: async () => {
          throw new Error('Handler failure');
        },
      });

      eventBus.subscribe({
        subscriberId: 'working-handler',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: async (event) => successfulEvents.push(event),
      });

      const event: EscrowHeldEvent = {
        eventId: 'event-10',
        eventType: WalletEventType.ESCROW_HELD,
        idempotencyKey: 'idem-10',
        timestamp: new Date(),
        source: 'test',
        version: '1.0',
        userId: 'user-1',
        escrowId: 'escrow-1',
        amount: 100,
        reason: 'test_hold',
        queueItemId: 'queue-1',
        featureType: 'test',
        transactionId: 'tx-1',
        userAvailableBalance: 900,
        userEscrowBalance: 100,
      };

      const result = await eventBus.publish(event);

      expect(result.handlersNotified).toBe(1); // Only working handler succeeded
      expect(successfulEvents).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      eventBus.subscribe({
        subscriberId: 'sub-1',
        eventTypes: [WalletEventType.ESCROW_HELD, WalletEventType.ESCROW_SETTLED],
        handler: async () => {},
      });

      eventBus.subscribe({
        subscriberId: 'sub-2',
        eventTypes: [WalletEventType.ESCROW_HELD],
        handler: async () => {},
      });

      const stats = eventBus.getStats();

      expect(stats.totalSubscribers).toBe(3); // sub-1 counts for 2 event types
      expect(stats.subscriptionsByType[WalletEventType.ESCROW_HELD]).toBe(2);
      expect(stats.subscriptionsByType[WalletEventType.ESCROW_SETTLED]).toBe(1);
    });
  });
});
