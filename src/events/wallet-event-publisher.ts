/**
 * Wallet Event Publisher
 * 
 * Publishes events for wallet operations with idempotency guarantees.
 * Integrates with the event bus to enable real-time updates.
 */

import {
  WalletEventType,
  EscrowHeldEvent,
  EscrowSettledEvent,
  EscrowRefundedEvent,
  EscrowPartialSettledEvent,
  BalanceUpdatedEvent,
} from './types';
import { EventBuilder, getEventBus } from './event-bus';
import { MetricsLogger, MetricEventType } from '../metrics';

/**
 * Wallet event publisher
 */
export class WalletEventPublisher {
  /**
   * Publish escrow held event
   */
  static async publishEscrowHeld(params: {
    userId: string;
    escrowId: string;
    amount: number;
    reason: string;
    queueItemId: string;
    featureType: string;
    transactionId: string;
    userAvailableBalance: number;
    userEscrowBalance: number;
    idempotencyKey: string;
    metadata?: Record<string, any>;
    correlationId?: string;
  }): Promise<void> {
    const event: EscrowHeldEvent = {
      ...EventBuilder.createBase(WalletEventType.ESCROW_HELD, params.idempotencyKey),
      userId: params.userId,
      escrowId: params.escrowId,
      amount: params.amount,
      reason: params.reason,
      queueItemId: params.queueItemId,
      featureType: params.featureType,
      transactionId: params.transactionId,
      userAvailableBalance: params.userAvailableBalance,
      userEscrowBalance: params.userEscrowBalance,
      metadata: params.metadata,
      correlationId: params.correlationId,
    };

    try {
      const eventBus = getEventBus();
      await eventBus.publish(event);
      
      MetricsLogger.incrementCounter(MetricEventType.WALLET_EVENT_PUBLISHED, {
        eventType: WalletEventType.ESCROW_HELD,
        userId: params.userId,
        amount: params.amount,
      });
    } catch (error) {
      MetricsLogger.incrementCounter(MetricEventType.WALLET_EVENT_PUBLISH_ERROR, {
        eventType: WalletEventType.ESCROW_HELD,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Publish escrow settled event
   */
  static async publishEscrowSettled(params: {
    userId: string;
    modelId: string;
    escrowId: string;
    amount: number;
    reason: string;
    queueItemId: string;
    transactionId: string;
    modelEarnedBalance: number;
    idempotencyKey: string;
    metadata?: Record<string, any>;
    correlationId?: string;
  }): Promise<void> {
    const event: EscrowSettledEvent = {
      ...EventBuilder.createBase(WalletEventType.ESCROW_SETTLED, params.idempotencyKey),
      userId: params.userId,
      modelId: params.modelId,
      escrowId: params.escrowId,
      amount: params.amount,
      reason: params.reason,
      queueItemId: params.queueItemId,
      transactionId: params.transactionId,
      modelEarnedBalance: params.modelEarnedBalance,
      metadata: params.metadata,
      correlationId: params.correlationId,
    };

    try {
      const eventBus = getEventBus();
      await eventBus.publish(event);
      
      MetricsLogger.incrementCounter(MetricEventType.WALLET_EVENT_PUBLISHED, {
        eventType: WalletEventType.ESCROW_SETTLED,
        userId: params.userId,
        modelId: params.modelId,
        amount: params.amount,
      });
    } catch (error) {
      MetricsLogger.incrementCounter(MetricEventType.WALLET_EVENT_PUBLISH_ERROR, {
        eventType: WalletEventType.ESCROW_SETTLED,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Publish escrow refunded event
   */
  static async publishEscrowRefunded(params: {
    userId: string;
    escrowId: string;
    amount: number;
    reason: string;
    queueItemId: string;
    transactionId: string;
    userAvailableBalance: number;
    userEscrowBalance: number;
    idempotencyKey: string;
    metadata?: Record<string, any>;
    correlationId?: string;
  }): Promise<void> {
    const event: EscrowRefundedEvent = {
      ...EventBuilder.createBase(WalletEventType.ESCROW_REFUNDED, params.idempotencyKey),
      userId: params.userId,
      escrowId: params.escrowId,
      amount: params.amount,
      reason: params.reason,
      queueItemId: params.queueItemId,
      transactionId: params.transactionId,
      userAvailableBalance: params.userAvailableBalance,
      userEscrowBalance: params.userEscrowBalance,
      metadata: params.metadata,
      correlationId: params.correlationId,
    };

    try {
      const eventBus = getEventBus();
      await eventBus.publish(event);
      
      MetricsLogger.incrementCounter(MetricEventType.WALLET_EVENT_PUBLISHED, {
        eventType: WalletEventType.ESCROW_REFUNDED,
        userId: params.userId,
        amount: params.amount,
      });
    } catch (error) {
      MetricsLogger.incrementCounter(MetricEventType.WALLET_EVENT_PUBLISH_ERROR, {
        eventType: WalletEventType.ESCROW_REFUNDED,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Publish partial escrow settlement event
   */
  static async publishEscrowPartialSettled(params: {
    userId: string;
    modelId: string;
    escrowId: string;
    refundAmount: number;
    settleAmount: number;
    reason: string;
    queueItemId: string;
    transactionId: string;
    userAvailableBalance: number;
    modelEarnedBalance: number;
    idempotencyKey: string;
    metadata?: Record<string, any>;
    correlationId?: string;
  }): Promise<void> {
    const event: EscrowPartialSettledEvent = {
      ...EventBuilder.createBase(WalletEventType.ESCROW_PARTIAL_SETTLED, params.idempotencyKey),
      userId: params.userId,
      modelId: params.modelId,
      escrowId: params.escrowId,
      refundAmount: params.refundAmount,
      settleAmount: params.settleAmount,
      reason: params.reason,
      queueItemId: params.queueItemId,
      transactionId: params.transactionId,
      userAvailableBalance: params.userAvailableBalance,
      modelEarnedBalance: params.modelEarnedBalance,
      metadata: params.metadata,
      correlationId: params.correlationId,
    };

    try {
      const eventBus = getEventBus();
      await eventBus.publish(event);
      
      MetricsLogger.incrementCounter(MetricEventType.WALLET_EVENT_PUBLISHED, {
        eventType: WalletEventType.ESCROW_PARTIAL_SETTLED,
        userId: params.userId,
        modelId: params.modelId,
        refundAmount: params.refundAmount,
        settleAmount: params.settleAmount,
      });
    } catch (error) {
      MetricsLogger.incrementCounter(MetricEventType.WALLET_EVENT_PUBLISH_ERROR, {
        eventType: WalletEventType.ESCROW_PARTIAL_SETTLED,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Publish balance updated event
   */
  static async publishBalanceUpdated(params: {
    accountId: string;
    accountType: 'user' | 'model';
    balanceState: 'available' | 'escrow' | 'earned';
    balanceBefore: number;
    balanceAfter: number;
    reason: string;
    transactionId: string;
    ledgerEntryId: string;
    idempotencyKey: string;
    metadata?: Record<string, any>;
    correlationId?: string;
  }): Promise<void> {
    const event: BalanceUpdatedEvent = {
      ...EventBuilder.createBase(WalletEventType.BALANCE_UPDATED, params.idempotencyKey),
      accountId: params.accountId,
      accountType: params.accountType,
      balanceState: params.balanceState,
      balanceBefore: params.balanceBefore,
      balanceAfter: params.balanceAfter,
      changeAmount: params.balanceAfter - params.balanceBefore,
      reason: params.reason,
      transactionId: params.transactionId,
      ledgerEntryId: params.ledgerEntryId,
      metadata: params.metadata,
      correlationId: params.correlationId,
    };

    try {
      const eventBus = getEventBus();
      await eventBus.publish(event);
      
      MetricsLogger.incrementCounter(MetricEventType.WALLET_EVENT_PUBLISHED, {
        eventType: WalletEventType.BALANCE_UPDATED,
        accountId: params.accountId,
        accountType: params.accountType,
        balanceState: params.balanceState,
      });
    } catch (error) {
      MetricsLogger.incrementCounter(MetricEventType.WALLET_EVENT_PUBLISH_ERROR, {
        eventType: WalletEventType.BALANCE_UPDATED,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
