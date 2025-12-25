/**
 * Acknowledgment Service
 * 
 * Manages delivery acknowledgments with retry logic and state tracking.
 * Ensures reliable delivery of notifications and confirmations.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Acknowledgment,
  DeliveryState,
  DeliveryResult,
  AckStatistics,
} from './types';

/**
 * Delivery function type
 */
export type DeliveryFunction = (target: string, payload: any) => Promise<any>;

/**
 * In-memory storage for acknowledgments
 * In production, this would be a database + queue
 */
class AckStore {
  private acks = new Map<string, Acknowledgment>();
  
  save(ack: Acknowledgment): void {
    this.acks.set(ack.ackId, ack);
  }
  
  get(ackId: string): Acknowledgment | null {
    return this.acks.get(ackId) || null;
  }
  
  getPending(): Acknowledgment[] {
    return Array.from(this.acks.values()).filter(
      (a) => a.state === DeliveryState.PENDING
    );
  }
  
  getDueForRetry(): Acknowledgment[] {
    const now = new Date();
    return Array.from(this.acks.values()).filter(
      (a) =>
        a.state === DeliveryState.FAILED &&
        a.nextRetryAt &&
        a.nextRetryAt <= now
    );
  }
  
  updateState(
    ackId: string,
    state: DeliveryState,
    errorMessage?: string
  ): void {
    const ack = this.acks.get(ackId);
    if (ack) {
      ack.state = state;
      ack.lastAttemptAt = new Date();
      if (errorMessage) {
        ack.errorMessage = errorMessage;
      }
      if (state === DeliveryState.DELIVERED) {
        ack.deliveredAt = new Date();
      }
      this.acks.set(ackId, ack);
    }
  }
  
  incrementRetry(ackId: string): void {
    const ack = this.acks.get(ackId);
    if (ack) {
      ack.retryCount++;
      this.acks.set(ackId, ack);
    }
  }
  
  setNextRetry(ackId: string, nextRetryAt: Date): void {
    const ack = this.acks.get(ackId);
    if (ack) {
      ack.nextRetryAt = nextRetryAt;
      this.acks.set(ackId, ack);
    }
  }
  
  getStatistics(): AckStatistics {
    const acks = Array.from(this.acks.values());
    const delivered = acks.filter((a) => a.state === DeliveryState.DELIVERED);
    const avgRetryCount =
      delivered.length > 0
        ? delivered.reduce((sum, a) => sum + a.retryCount, 0) / delivered.length
        : 0;
    
    return {
      totalCreated: acks.length,
      totalDelivered: delivered.length,
      totalPending: acks.filter((a) => a.state === DeliveryState.PENDING).length,
      totalDelivering: acks.filter((a) => a.state === DeliveryState.DELIVERING).length,
      totalFailed: acks.filter((a) => a.state === DeliveryState.FAILED).length,
      totalFailedPermanent: acks.filter((a) => a.state === DeliveryState.FAILED_PERMANENT).length,
      avgRetryCount,
      generatedAt: new Date(),
    };
  }
}

/**
 * Acknowledgment Service Implementation
 */
export class AckService {
  private store = new AckStore();
  private deliveryFn: DeliveryFunction;
  private readonly DEFAULT_MAX_RETRIES = 5;
  private readonly BASE_RETRY_DELAY_MS = 1000; // 1 second
  private retryInterval: NodeJS.Timeout | null = null;
  
  constructor(deliveryFn: DeliveryFunction) {
    this.deliveryFn = deliveryFn;
  }
  
  /**
   * Create an acknowledgment (queues for delivery)
   */
  async createAck(
    target: string,
    eventId: string,
    payload: any,
    metadata?: Record<string, any>
  ): Promise<Acknowledgment> {
    const ackId = uuidv4();
    const ack: Acknowledgment = {
      ackId,
      target,
      eventId,
      payload,
      state: DeliveryState.PENDING,
      retryCount: 0,
      maxRetries: this.DEFAULT_MAX_RETRIES,
      createdAt: new Date(),
      metadata,
    };
    
    this.store.save(ack);
    
    // Trigger async delivery
    setImmediate(() => this.deliver(ackId));
    
    return ack;
  }
  
  /**
   * Attempt delivery of an acknowledgment
   */
  private async deliver(ackId: string): Promise<void> {
    const ack = this.store.get(ackId);
    if (!ack || ack.state === DeliveryState.DELIVERED) {
      return;
    }
    
    // Mark as delivering
    this.store.updateState(ackId, DeliveryState.DELIVERING);
    
    try {
      // Attempt delivery
      const response = await this.deliveryFn(ack.target, ack.payload);
      
      // Success
      this.store.updateState(ackId, DeliveryState.DELIVERED);
    } catch (error) {
      // Failure
      await this.handleDeliveryFailure(ack, error as Error);
    }
  }
  
  /**
   * Handle delivery failure
   */
  private async handleDeliveryFailure(
    ack: Acknowledgment,
    error: Error
  ): Promise<void> {
    const shouldRetry = ack.retryCount < ack.maxRetries;
    
    if (shouldRetry) {
      // Schedule retry with exponential backoff
      this.store.incrementRetry(ack.ackId);
      this.store.updateState(ack.ackId, DeliveryState.FAILED, error.message);
      
      // Calculate next retry time with exponential backoff
      const backoffMs = this.BASE_RETRY_DELAY_MS * Math.pow(2, ack.retryCount);
      const nextRetryAt = new Date(Date.now() + backoffMs);
      this.store.setNextRetry(ack.ackId, nextRetryAt);
      
      // Schedule retry
      setTimeout(() => this.deliver(ack.ackId), backoffMs);
    } else {
      // Permanent failure
      this.store.updateState(
        ack.ackId,
        DeliveryState.FAILED_PERMANENT,
        error.message
      );
    }
  }
  
  /**
   * Retry a specific acknowledgment manually
   */
  async retryAck(ackId: string): Promise<DeliveryResult> {
    const ack = this.store.get(ackId);
    if (!ack) {
      return {
        ackId,
        success: false,
        error: 'Acknowledgment not found',
        timestamp: new Date(),
      };
    }
    
    if (ack.state === DeliveryState.DELIVERED) {
      return {
        ackId,
        success: true,
        response: 'Already delivered',
        timestamp: new Date(),
      };
    }
    
    // Reset for retry
    this.store.updateState(ackId, DeliveryState.PENDING);
    await this.deliver(ackId);
    
    // Get updated state
    const updated = this.store.get(ackId);
    return {
      ackId,
      success: updated?.state === DeliveryState.DELIVERED,
      error: updated?.errorMessage,
      timestamp: new Date(),
    };
  }
  
  /**
   * Get acknowledgment by ID
   */
  async getAck(ackId: string): Promise<Acknowledgment | null> {
    return this.store.get(ackId);
  }
  
  /**
   * Get all pending acknowledgments
   */
  async getPendingAcks(): Promise<Acknowledgment[]> {
    return this.store.getPending();
  }
  
  /**
   * Get statistics
   */
  async getStatistics(): Promise<AckStatistics> {
    return this.store.getStatistics();
  }
  
  /**
   * Start background retry processing
   */
  startRetryProcessing(intervalMs: number = 5000): void {
    if (this.retryInterval) {
      return;
    }
    
    this.retryInterval = setInterval(() => {
      const dueForRetry = this.store.getDueForRetry();
      for (const ack of dueForRetry) {
        this.deliver(ack.ackId);
      }
    }, intervalMs);
  }
  
  /**
   * Stop background retry processing
   */
  stopRetryProcessing(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
  }
}
