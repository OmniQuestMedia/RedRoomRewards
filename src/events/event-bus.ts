/**
 * Event Bus Implementation
 * 
 * Provides in-memory event publishing and subscription with idempotency guarantees.
 * Events are processed asynchronously with error handling and retry logic.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  BaseRewardEvent,
  RewardEvent,
  WalletEventType,
  EventHandler,
  EventSubscription,
  EventPublishResult,
} from './types';
import { MetricsLogger, MetricEventType } from '../metrics';

/**
 * Event bus configuration
 */
export interface EventBusConfig {
  /** Enable event deduplication */
  enableDeduplication: boolean;
  
  /** TTL for deduplication cache in milliseconds */
  deduplicationTtlMs: number;
  
  /** Maximum retry attempts for failed handlers */
  maxRetryAttempts: number;
  
  /** Retry delay in milliseconds */
  retryDelayMs: number;
  
  /** Enable async event processing */
  asyncProcessing: boolean;
}

const DEFAULT_CONFIG: EventBusConfig = {
  enableDeduplication: true,
  deduplicationTtlMs: 3600000, // 1 hour
  maxRetryAttempts: 3,
  retryDelayMs: 1000,
  asyncProcessing: true,
};

/**
 * Event bus for publishing and subscribing to reward system events
 */
export class EventBus {
  private subscriptions: Map<WalletEventType, EventSubscription[]> = new Map();
  private processedEvents: Map<string, number> = new Map(); // eventId -> timestamp
  private config: EventBusConfig;

  constructor(config: Partial<EventBusConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Start cleanup interval for deduplication cache
    if (this.config.enableDeduplication) {
      this.startCleanupInterval();
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(subscription: EventSubscription): void {
    for (const eventType of subscription.eventTypes) {
      if (!this.subscriptions.has(eventType)) {
        this.subscriptions.set(eventType, []);
      }
      
      const subs = this.subscriptions.get(eventType)!;
      subs.push(subscription);
      
      // Sort by priority (lower number = higher priority)
      subs.sort((a, b) => (a.priority || 100) - (b.priority || 100));
    }
    
    MetricsLogger.incrementCounter(MetricEventType.EVENT_SUBSCRIBER_REGISTERED, {
      subscriberId: subscription.subscriberId,
      eventTypes: subscription.eventTypes.join(','),
    });
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriberId: string): void {
    for (const [eventType, subs] of this.subscriptions.entries()) {
      const filtered = subs.filter(s => s.subscriberId !== subscriberId);
      this.subscriptions.set(eventType, filtered);
    }
    
    MetricsLogger.incrementCounter(MetricEventType.EVENT_SUBSCRIBER_UNREGISTERED, {
      subscriberId,
    });
  }

  /**
   * Publish an event to all subscribers
   */
  async publish(event: RewardEvent): Promise<EventPublishResult> {
    const startTime = Date.now();
    
    // Check for duplicate event
    if (this.config.enableDeduplication && this.isDuplicate(event)) {
      MetricsLogger.incrementCounter(MetricEventType.EVENT_DUPLICATE_DETECTED, {
        eventId: event.eventId,
        eventType: event.eventType,
      });
      
      return {
        eventId: event.eventId,
        success: true,
        handlersNotified: 0,
      };
    }
    
    // Mark event as processed
    if (this.config.enableDeduplication) {
      this.markProcessed(event.eventId);
    }
    
    // Get subscribers for this event type
    const subscribers = this.subscriptions.get(event.eventType as WalletEventType) || [];
    
    if (subscribers.length === 0) {
      MetricsLogger.incrementCounter(MetricEventType.EVENT_NO_SUBSCRIBERS, {
        eventType: event.eventType,
      });
    }
    
    // Notify all subscribers
    const errors: Array<{ subscriberId: string; error: string }> = [];
    let notifiedCount = 0;
    
    const notifications = subscribers.map(async (subscription) => {
      try {
        await this.notifySubscriber(subscription, event);
        notifiedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          subscriberId: subscription.subscriberId,
          error: errorMessage,
        });
        
        MetricsLogger.incrementCounter(MetricEventType.EVENT_HANDLER_ERROR, {
          eventId: event.eventId,
          eventType: event.eventType,
          subscriberId: subscription.subscriberId,
          error: errorMessage,
        });
      }
    });
    
    if (this.config.asyncProcessing) {
      // Fire and forget
      Promise.allSettled(notifications);
    } else {
      // Wait for all
      await Promise.allSettled(notifications);
    }
    
    const duration = Date.now() - startTime;
    MetricsLogger.incrementCounter(MetricEventType.EVENT_PUBLISHED, {
      eventId: event.eventId,
      eventType: event.eventType,
      subscriberCount: subscribers.length,
      duration,
    });
    
    return {
      eventId: event.eventId,
      success: errors.length === 0,
      handlersNotified: notifiedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Notify a single subscriber with retry logic
   */
  private async notifySubscriber(
    subscription: EventSubscription,
    event: RewardEvent
  ): Promise<void> {
    let attempts = 0;
    let lastError: Error | undefined;
    
    while (attempts < this.config.maxRetryAttempts) {
      try {
        await subscription.handler(event);
        
        // Success
        MetricsLogger.incrementCounter(MetricEventType.EVENT_HANDLER_SUCCESS, {
          eventId: event.eventId,
          subscriberId: subscription.subscriberId,
          attempts: attempts + 1,
        });
        
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        attempts++;
        
        if (attempts < this.config.maxRetryAttempts) {
          // Wait before retry
          await this.sleep(this.config.retryDelayMs * attempts);
        }
      }
    }
    
    // All retries failed
    throw lastError || new Error('Handler failed after retries');
  }

  /**
   * Check if event was already processed
   */
  private isDuplicate(event: BaseRewardEvent): boolean {
    return this.processedEvents.has(event.eventId) ||
           this.processedEvents.has(event.idempotencyKey);
  }

  /**
   * Mark event as processed
   */
  private markProcessed(eventId: string): void {
    this.processedEvents.set(eventId, Date.now());
  }

  /**
   * Start cleanup interval for deduplication cache
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const ttl = this.config.deduplicationTtlMs;
      
      for (const [eventId, timestamp] of this.processedEvents.entries()) {
        if (now - timestamp > ttl) {
          this.processedEvents.delete(eventId);
        }
      }
    }, 60000); // Cleanup every minute
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get event bus statistics
   */
  getStats(): {
    totalSubscribers: number;
    processedEventsCount: number;
    subscriptionsByType: Record<string, number>;
  } {
    let totalSubscribers = 0;
    const subscriptionsByType: Record<string, number> = {};
    
    for (const [eventType, subs] of this.subscriptions.entries()) {
      subscriptionsByType[eventType] = subs.length;
      totalSubscribers += subs.length;
    }
    
    return {
      totalSubscribers,
      processedEventsCount: this.processedEvents.size,
      subscriptionsByType,
    };
  }

  /**
   * Clear all subscriptions (for testing)
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
    this.processedEvents.clear();
  }
}

/**
 * Singleton event bus instance
 */
let eventBusInstance: EventBus | null = null;

/**
 * Get or create the global event bus instance
 */
export function getEventBus(config?: Partial<EventBusConfig>): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus(config);
  }
  return eventBusInstance;
}

/**
 * Reset the global event bus (for testing)
 */
export function resetEventBus(): void {
  if (eventBusInstance) {
    eventBusInstance.clearSubscriptions();
  }
  eventBusInstance = null;
}

/**
 * Create event builder for consistent event creation
 */
export class EventBuilder {
  /**
   * Create a base event with common fields
   */
  static createBase(
    eventType: WalletEventType,
    idempotencyKey: string,
    source: string = 'reward-service'
  ): Pick<BaseRewardEvent, 'eventId' | 'eventType' | 'idempotencyKey' | 'timestamp' | 'source' | 'version'> {
    return {
      eventId: uuidv4(),
      eventType,
      idempotencyKey,
      timestamp: new Date(),
      source,
      version: '1.0',
    };
  }
}
