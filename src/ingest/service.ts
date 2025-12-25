/**
 * Ingest Service
 * 
 * Async event ingestion with DLQ (Dead Letter Queue) for failed events.
 * Supports validation, retry logic, and replay capability.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  IngestEvent,
  EventStatus,
  DLQEntry,
  ProcessingResult,
  IngestStatistics,
  ReplayOptions,
  ReplayResult,
} from './types';
import { ContractValidator } from '../contracts/points/validator';

/**
 * Event handler function type
 */
export type EventHandler = (event: IngestEvent) => Promise<any>;

/**
 * In-memory storage for events and DLQ
 * In production, this would be a database + message queue
 */
class IngestStore {
  private events = new Map<string, IngestEvent>();
  private dlq = new Map<string, DLQEntry>();
  
  saveEvent(event: IngestEvent): void {
    this.events.set(event.eventId, event);
  }
  
  getEvent(eventId: string): IngestEvent | null {
    return this.events.get(eventId) || null;
  }
  
  getQueuedEvents(): IngestEvent[] {
    return Array.from(this.events.values()).filter(
      (e) => e.status === EventStatus.QUEUED
    );
  }
  
  updateEventStatus(
    eventId: string,
    status: EventStatus,
    errorMessage?: string,
    validationErrors?: string[]
  ): void {
    const event = this.events.get(eventId);
    if (event) {
      event.status = status;
      event.processedAt = new Date();
      if (errorMessage) event.errorMessage = errorMessage;
      if (validationErrors) event.validationErrors = validationErrors;
      this.events.set(eventId, event);
    }
  }
  
  incrementRetry(eventId: string): void {
    const event = this.events.get(eventId);
    if (event) {
      event.retryCount++;
      this.events.set(eventId, event);
    }
  }
  
  saveDLQ(entry: DLQEntry): void {
    this.dlq.set(entry.dlqId, entry);
  }
  
  getDLQ(dlqId: string): DLQEntry | null {
    return this.dlq.get(dlqId) || null;
  }
  
  getAllDLQ(): DLQEntry[] {
    return Array.from(this.dlq.values());
  }
  
  getReplayableDLQ(): DLQEntry[] {
    return Array.from(this.dlq.values()).filter((e) => e.replayable && !e.replayedAt);
  }
  
  markReplayed(dlqId: string, result: 'success' | 'failed'): void {
    const entry = this.dlq.get(dlqId);
    if (entry) {
      entry.replayedAt = new Date();
      entry.replayResult = result;
      this.dlq.set(dlqId, entry);
    }
  }
  
  getStatistics(): IngestStatistics {
    const events = Array.from(this.events.values());
    return {
      totalIngested: events.length,
      totalProcessed: events.filter((e) => e.status === EventStatus.PROCESSED).length,
      totalRejected: events.filter((e) => e.status === EventStatus.REJECTED).length,
      totalFailed: events.filter((e) => e.status === EventStatus.FAILED).length,
      totalDLQ: this.dlq.size,
      currentlyQueued: events.filter((e) => e.status === EventStatus.QUEUED).length,
      currentlyProcessing: events.filter((e) => e.status === EventStatus.PROCESSING).length,
      generatedAt: new Date(),
    };
  }
}

/**
 * Ingest Service Implementation
 */
export class IngestService {
  private store = new IngestStore();
  private handlers = new Map<string, EventHandler>();
  private readonly DEFAULT_MAX_RETRIES = 3;
  private processingInterval: NodeJS.Timeout | null = null;
  
  /**
   * Register event handler for a specific event type
   */
  registerHandler(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
  }
  
  /**
   * Ingest an event (add to queue)
   */
  async ingest(
    eventType: string,
    payload: any,
    metadata?: Record<string, any>
  ): Promise<IngestEvent> {
    const eventId = uuidv4();
    const event: IngestEvent = {
      eventId,
      eventType,
      payload,
      status: EventStatus.QUEUED,
      ingestedAt: new Date(),
      retryCount: 0,
      maxRetries: this.DEFAULT_MAX_RETRIES,
      metadata,
    };
    
    this.store.saveEvent(event);
    
    // Trigger async processing (in production, this would be a message queue)
    setImmediate(() => this.processEvent(eventId));
    
    return event;
  }
  
  /**
   * Process a single event
   */
  private async processEvent(eventId: string): Promise<void> {
    const event = this.store.getEvent(eventId);
    if (!event || event.status !== EventStatus.QUEUED) {
      return;
    }
    
    // Mark as processing
    this.store.updateEventStatus(eventId, EventStatus.PROCESSING);
    
    try {
      // Validate event payload
      const validationResult = this.validateEvent(event);
      if (!validationResult.valid) {
        // Reject invalid events (don't retry)
        this.store.updateEventStatus(
          eventId,
          EventStatus.REJECTED,
          'Validation failed',
          validationResult.errors
        );
        return;
      }
      
      // Get handler
      const handler = this.handlers.get(event.eventType);
      if (!handler) {
        throw new Error(`No handler registered for event type: ${event.eventType}`);
      }
      
      // Process event
      await handler(event);
      
      // Mark as processed
      this.store.updateEventStatus(eventId, EventStatus.PROCESSED);
    } catch (error) {
      // Handle failure
      await this.handleFailure(event, error as Error);
    }
  }
  
  /**
   * Validate event payload
   */
  private validateEvent(event: IngestEvent): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Basic validation
    if (!event.eventType) {
      errors.push('Missing eventType');
    }
    if (!event.payload || typeof event.payload !== 'object') {
      errors.push('Invalid payload: must be an object');
    }
    
    // Type-specific validation (extensible)
    if (event.eventType.startsWith('points.')) {
      // Validate points events have required fields
      if (!event.payload.userId) {
        errors.push('Missing userId in payload');
      }
      if (typeof event.payload.amount !== 'number') {
        errors.push('Missing or invalid amount in payload');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Handle event processing failure
   */
  private async handleFailure(event: IngestEvent, error: Error): Promise<void> {
    const shouldRetry = event.retryCount < event.maxRetries;
    
    if (shouldRetry) {
      // Retry
      this.store.incrementRetry(event.eventId);
      this.store.updateEventStatus(
        event.eventId,
        EventStatus.QUEUED,
        error.message
      );
      
      // Schedule retry with exponential backoff
      const backoffMs = Math.pow(2, event.retryCount) * 1000;
      setTimeout(() => this.processEvent(event.eventId), backoffMs);
    } else {
      // Move to DLQ
      this.store.updateEventStatus(event.eventId, EventStatus.DLQ, error.message);
      
      const dlqEntry: DLQEntry = {
        dlqId: uuidv4(),
        event,
        reason: error.message,
        failedAt: new Date(),
        replayable: true, // Most errors are transient and can be replayed
      };
      
      this.store.saveDLQ(dlqEntry);
    }
  }
  
  /**
   * Get event by ID
   */
  async getEvent(eventId: string): Promise<IngestEvent | null> {
    return this.store.getEvent(eventId);
  }
  
  /**
   * Get all DLQ entries
   */
  async getDLQ(): Promise<DLQEntry[]> {
    return this.store.getAllDLQ();
  }
  
  /**
   * Replay events from DLQ
   */
  async replayDLQ(options?: ReplayOptions): Promise<ReplayResult> {
    let entries = options?.force
      ? this.store.getAllDLQ()
      : this.store.getReplayableDLQ();
    
    // Apply filters
    if (options?.eventType) {
      entries = entries.filter((e) => e.event.eventType === options.eventType);
    }
    if (options?.reason) {
      entries = entries.filter((e) => e.reason.includes(options.reason!));
    }
    if (options?.maxEvents) {
      entries = entries.slice(0, options.maxEvents);
    }
    
    const result: ReplayResult = {
      replayed: entries.length,
      successes: 0,
      failures: 0,
      successIds: [],
      failureIds: [],
      timestamp: new Date(),
    };
    
    // Replay each entry
    for (const entry of entries) {
      try {
        // Reset event for replay
        entry.event.status = EventStatus.QUEUED;
        entry.event.retryCount = 0;
        entry.event.errorMessage = undefined;
        entry.event.validationErrors = undefined;
        
        // Re-ingest
        this.store.saveEvent(entry.event);
        await this.processEvent(entry.event.eventId);
        
        // Check result
        const replayedEvent = this.store.getEvent(entry.event.eventId);
        if (replayedEvent?.status === EventStatus.PROCESSED) {
          result.successes++;
          result.successIds.push(entry.event.eventId);
          this.store.markReplayed(entry.dlqId, 'success');
        } else {
          result.failures++;
          result.failureIds.push(entry.event.eventId);
          this.store.markReplayed(entry.dlqId, 'failed');
        }
      } catch (error) {
        result.failures++;
        result.failureIds.push(entry.event.eventId);
        this.store.markReplayed(entry.dlqId, 'failed');
      }
    }
    
    return result;
  }
  
  /**
   * Get ingestion statistics
   */
  async getStatistics(): Promise<IngestStatistics> {
    return this.store.getStatistics();
  }
  
  /**
   * Start background processing (for production)
   */
  startProcessing(intervalMs: number = 1000): void {
    if (this.processingInterval) {
      return;
    }
    
    this.processingInterval = setInterval(() => {
      const queued = this.store.getQueuedEvents();
      for (const event of queued) {
        this.processEvent(event.eventId);
      }
    }, intervalMs);
  }
  
  /**
   * Stop background processing
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
}
