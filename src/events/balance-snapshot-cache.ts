/**
 * Balance Snapshot Cache
 * 
 * Maintains real-time cached balance snapshots by subscribing to wallet events.
 * Provides fast balance lookups without querying the database or ledger.
 */

import {
  BalanceUpdatedEvent,
  EscrowHeldEvent,
  EscrowSettledEvent,
  EscrowRefundedEvent,
  EscrowPartialSettledEvent,
  WalletEventType,
  RewardEvent,
} from './types';
import { getEventBus } from './event-bus';
import { MetricsLogger, MetricEventType } from '../metrics';

/**
 * Cached balance snapshot
 */
export interface CachedBalance {
  accountId: string;
  accountType: 'user' | 'model';
  availableBalance: number;
  escrowBalance?: number;
  earnedBalance?: number;
  lastUpdated: Date;
  version: number;
}

/**
 * Balance snapshot cache configuration
 */
export interface BalanceCacheConfig {
  /** Enable cache */
  enabled: boolean;
  
  /** Maximum cache size (LRU eviction) */
  maxSize: number;
  
  /** Cache TTL in milliseconds */
  ttlMs: number;
}

const DEFAULT_CONFIG: BalanceCacheConfig = {
  enabled: true,
  maxSize: 10000,
  ttlMs: 3600000, // 1 hour
};

/**
 * Real-time balance snapshot cache
 */
export class BalanceSnapshotCache {
  private cache: Map<string, CachedBalance> = new Map();
  private config: BalanceCacheConfig;
  private subscribed: boolean = false;

  constructor(config: Partial<BalanceCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.enabled) {
      this.subscribeToEvents();
    }
  }

  /**
   * Subscribe to wallet events for cache updates
   */
  private subscribeToEvents(): void {
    if (this.subscribed) {
      return;
    }

    const eventBus = getEventBus();

    eventBus.subscribe({
      subscriberId: 'balance-snapshot-cache',
      eventTypes: [
        WalletEventType.BALANCE_UPDATED,
        WalletEventType.ESCROW_HELD,
        WalletEventType.ESCROW_SETTLED,
        WalletEventType.ESCROW_REFUNDED,
        WalletEventType.ESCROW_PARTIAL_SETTLED,
      ],
      handler: async (event) => {
        await this.handleEvent(event);
      },
      priority: 10, // High priority for cache updates
    });

    this.subscribed = true;
    
    MetricsLogger.incrementCounter(MetricEventType.EVENT_SUBSCRIBER_REGISTERED, {
      subscriberId: 'balance-snapshot-cache',
    });
  }

  /**
   * Handle wallet events and update cache
   */
  private async handleEvent(
    event: RewardEvent
  ): Promise<void> {
    // Only process wallet balance events, not ledger entry events
    if (event.eventType === WalletEventType.LEDGER_ENTRY_CREATED) {
      return;
    }

    try {
      switch (event.eventType) {
        case WalletEventType.BALANCE_UPDATED:
          this.handleBalanceUpdated(event as BalanceUpdatedEvent);
          break;
        case WalletEventType.ESCROW_HELD:
          this.handleEscrowHeld(event as EscrowHeldEvent);
          break;
        case WalletEventType.ESCROW_SETTLED:
          this.handleEscrowSettled(event as EscrowSettledEvent);
          break;
        case WalletEventType.ESCROW_REFUNDED:
          this.handleEscrowRefunded(event as EscrowRefundedEvent);
          break;
        case WalletEventType.ESCROW_PARTIAL_SETTLED:
          this.handleEscrowPartialSettled(event as EscrowPartialSettledEvent);
          break;
      }
    } catch (error) {
      MetricsLogger.incrementCounter(MetricEventType.EVENT_HANDLER_ERROR, {
        subscriberId: 'balance-snapshot-cache',
        eventId: event.eventId,
        eventType: event.eventType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Handle balance updated event
   */
  private handleBalanceUpdated(event: BalanceUpdatedEvent): void {
    const key = this.getCacheKey(event.accountId, event.accountType);
    const cached = this.cache.get(key);

    if (!cached) {
      // Initialize cache entry
      const newEntry: CachedBalance = {
        accountId: event.accountId,
        accountType: event.accountType,
        availableBalance: event.accountType === 'user' && event.balanceState === 'available' ? event.balanceAfter : 0,
        escrowBalance: event.accountType === 'user' && event.balanceState === 'escrow' ? event.balanceAfter : 0,
        earnedBalance: event.accountType === 'model' && event.balanceState === 'earned' ? event.balanceAfter : 0,
        lastUpdated: event.timestamp,
        version: 1,
      };
      this.cache.set(key, newEntry);
    } else {
      // Update existing entry
      if (event.balanceState === 'available') {
        cached.availableBalance = event.balanceAfter;
      } else if (event.balanceState === 'escrow') {
        cached.escrowBalance = event.balanceAfter;
      } else if (event.balanceState === 'earned') {
        cached.earnedBalance = event.balanceAfter;
      }
      cached.lastUpdated = event.timestamp;
      cached.version++;
    }

    this.evictIfNeeded();
  }

  /**
   * Handle escrow held event
   */
  private handleEscrowHeld(event: EscrowHeldEvent): void {
    const key = this.getCacheKey(event.userId, 'user');
    const cached = this.cache.get(key);

    if (!cached) {
      const newEntry: CachedBalance = {
        accountId: event.userId,
        accountType: 'user',
        availableBalance: event.userAvailableBalance,
        escrowBalance: event.userEscrowBalance,
        lastUpdated: event.timestamp,
        version: 1,
      };
      this.cache.set(key, newEntry);
    } else {
      cached.availableBalance = event.userAvailableBalance;
      cached.escrowBalance = event.userEscrowBalance;
      cached.lastUpdated = event.timestamp;
      cached.version++;
    }

    this.evictIfNeeded();
  }

  /**
   * Handle escrow settled event
   */
  private handleEscrowSettled(event: EscrowSettledEvent): void {
    // Update model wallet
    const modelKey = this.getCacheKey(event.modelId, 'model');
    const modelCached = this.cache.get(modelKey);

    if (!modelCached) {
      const newEntry: CachedBalance = {
        accountId: event.modelId,
        accountType: 'model',
        availableBalance: 0,
        earnedBalance: event.modelEarnedBalance,
        lastUpdated: event.timestamp,
        version: 1,
      };
      this.cache.set(modelKey, newEntry);
    } else {
      modelCached.earnedBalance = event.modelEarnedBalance;
      modelCached.lastUpdated = event.timestamp;
      modelCached.version++;
    }

    this.evictIfNeeded();
  }

  /**
   * Handle escrow refunded event
   */
  private handleEscrowRefunded(event: EscrowRefundedEvent): void {
    const key = this.getCacheKey(event.userId, 'user');
    const cached = this.cache.get(key);

    if (!cached) {
      const newEntry: CachedBalance = {
        accountId: event.userId,
        accountType: 'user',
        availableBalance: event.userAvailableBalance,
        escrowBalance: event.userEscrowBalance,
        lastUpdated: event.timestamp,
        version: 1,
      };
      this.cache.set(key, newEntry);
    } else {
      cached.availableBalance = event.userAvailableBalance;
      cached.escrowBalance = event.userEscrowBalance;
      cached.lastUpdated = event.timestamp;
      cached.version++;
    }

    this.evictIfNeeded();
  }

  /**
   * Handle partial escrow settlement event
   */
  private handleEscrowPartialSettled(event: EscrowPartialSettledEvent): void {
    // Update user wallet
    const userKey = this.getCacheKey(event.userId, 'user');
    const userCached = this.cache.get(userKey);

    if (!userCached) {
      const newEntry: CachedBalance = {
        accountId: event.userId,
        accountType: 'user',
        availableBalance: event.userAvailableBalance,
        escrowBalance: event.userEscrowBalance,
        lastUpdated: event.timestamp,
        version: 1,
      };
      this.cache.set(userKey, newEntry);
    } else {
      userCached.availableBalance = event.userAvailableBalance;
      userCached.escrowBalance = event.userEscrowBalance;
      userCached.lastUpdated = event.timestamp;
      userCached.version++;
    }

    // Update model wallet
    const modelKey = this.getCacheKey(event.modelId, 'model');
    const modelCached = this.cache.get(modelKey);

    if (!modelCached) {
      const newEntry: CachedBalance = {
        accountId: event.modelId,
        accountType: 'model',
        availableBalance: 0,
        earnedBalance: event.modelEarnedBalance,
        lastUpdated: event.timestamp,
        version: 1,
      };
      this.cache.set(modelKey, newEntry);
    } else {
      modelCached.earnedBalance = event.modelEarnedBalance;
      modelCached.lastUpdated = event.timestamp;
      modelCached.version++;
    }

    this.evictIfNeeded();
  }

  /**
   * Get cached balance
   */
  getBalance(accountId: string, accountType: 'user' | 'model'): CachedBalance | null {
    const key = this.getCacheKey(accountId, accountType);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Check TTL
    const age = Date.now() - cached.lastUpdated.getTime();
    if (age > this.config.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Invalidate cache entry
   */
  invalidate(accountId: string, accountType: 'user' | 'model'): void {
    const key = this.getCacheKey(accountId, accountType);
    this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache key
   */
  private getCacheKey(accountId: string, accountType: 'user' | 'model'): string {
    return `${accountType}:${accountId}`;
  }

  /**
   * Evict oldest entries if cache size exceeds limit
   */
  private evictIfNeeded(): void {
    if (this.cache.size <= this.config.maxSize) {
      return;
    }

    // Simple LRU: remove oldest entries
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].lastUpdated.getTime() - b[1].lastUpdated.getTime());

    const toRemove = entries.slice(0, entries.length - this.config.maxSize);
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
    };
  }
}

/**
 * Singleton cache instance
 */
let cacheInstance: BalanceSnapshotCache | null = null;

/**
 * Get or create the global cache instance
 */
export function getBalanceCache(config?: Partial<BalanceCacheConfig>): BalanceSnapshotCache {
  if (!cacheInstance) {
    cacheInstance = new BalanceSnapshotCache(config);
  }
  return cacheInstance;
}

/**
 * Reset the cache (for testing)
 */
export function resetBalanceCache(): void {
  if (cacheInstance) {
    cacheInstance.clear();
  }
  cacheInstance = null;
}
