/**
 * Ingest Worker Implementation
 * 
 * Processes queued events asynchronously with retry logic and DLQ support
 */

import {
  IngestEventModel,
  IngestEventStatus,
  DLQEventModel,
  IdempotencyRecordModel,
} from '../db/models';
import {
  WorkerConfig,
  EventHandler,
  ProcessingResult,
  EventProcessingContext,
} from './types';

export class IngestWorker {
  private isRunning = false;
  private handlers: Map<string, EventHandler> = new Map();
  private config: WorkerConfig;

  constructor(config: Partial<WorkerConfig> = {}) {
    this.config = {
      pollIntervalMs: config.pollIntervalMs || 5000,
      maxConcurrentJobs: config.maxConcurrentJobs || 10,
      maxRetryAttempts: config.maxRetryAttempts || 5,
      initialRetryDelayMs: config.initialRetryDelayMs || 1000,
      maxRetryDelayMs: config.maxRetryDelayMs || 60000,
      retryBackoffMultiplier: config.retryBackoffMultiplier || 2,
    };
  }

  /**
   * Register an event handler for a specific event type/scope
   */
  registerHandler(eventTypeOrScope: string, handler: EventHandler): void {
    this.handlers.set(eventTypeOrScope, handler);
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Worker is already running');
      return;
    }

    this.isRunning = true;
    console.log('Ingest worker started');

    // Start polling loop
    this.pollLoop();
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    console.log('Ingest worker stopped');
  }

  /**
   * Main polling loop
   */
  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.processNextBatch();
      } catch (error) {
        console.error('Error in poll loop:', error);
      }

      // Wait before next poll
      await this.sleep(this.config.pollIntervalMs);
    }
  }

  /**
   * Process the next batch of events
   */
  private async processNextBatch(): Promise<void> {
    const now = new Date();

    // Find events that are QUEUED or ready for retry
    const events = await IngestEventModel.find({
      $or: [
        { status: IngestEventStatus.QUEUED },
        {
          status: IngestEventStatus.PROCESSING,
          nextAttemptAt: { $lte: now },
        },
      ],
    })
      .limit(this.config.maxConcurrentJobs)
      .exec();

    // Process each event
    const promises = events.map((event) => this.processEvent(event._id.toString()));
    await Promise.allSettled(promises);
  }

  /**
   * Process a single event
   */
  private async processEvent(eventMongoId: string): Promise<void> {
    try {
      // Atomically claim the event
      const event = await IngestEventModel.findOneAndUpdate(
        {
          _id: eventMongoId,
          status: { $in: [IngestEventStatus.QUEUED, IngestEventStatus.PROCESSING] },
        },
        {
          $set: { status: IngestEventStatus.PROCESSING },
          $inc: { attempts: 1 },
        },
        { new: true }
      );

      if (!event) {
        // Event was already claimed by another worker
        return;
      }

      // Validate minimal structure
      if (!event.eventId) {
        await this.moveToDLQ(event, 'MISSING_EVENT_ID', 'Event ID is required');
        return;
      }

      // Check idempotency
      const isProcessed = await this.checkIdempotency(event.eventId);
      if (isProcessed) {
        // Already processed, mark as PROCESSED
        await IngestEventModel.updateOne(
          { _id: event._id },
          { $set: { status: IngestEventStatus.PROCESSED } }
        );
        return;
      }

      // Get handler
      const handler = this.getHandler(event.eventType);

      // Build processing context
      const context: EventProcessingContext = {
        eventId: event.eventId,
        eventType: event.eventType,
        payload: event.payloadSnapshot,
        attempts: event.attempts,
      };

      // Process event
      const response = await handler(context);

      // Handle result
      await this.handleProcessingResult(event, response);
    } catch (error) {
      console.error(`Error processing event ${eventMongoId}:`, error);
      
      // Fetch event again to handle error
      const event = await IngestEventModel.findById(eventMongoId);
      if (event) {
        await this.handleProcessingResult(event, {
          result: ProcessingResult.RETRYABLE_FAILURE,
          errorCode: 'PROCESSING_ERROR',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Get handler for event type/scope
   */
  private getHandler(eventType?: string): EventHandler {
    // Try to find specific handler
    if (eventType && this.handlers.has(eventType)) {
      return this.handlers.get(eventType)!;
    }

    // Return default handler
    return this.defaultHandler.bind(this);
  }

  /**
   * Default handler (placeholder)
   */
  private async defaultHandler(
    context: EventProcessingContext
  ): Promise<{ result: ProcessingResult }> {
    console.log(`Processing event ${context.eventId} (default handler)`);
    
    // For now, just mark as success
    // In real implementation, this would validate and route to appropriate logic
    return { result: ProcessingResult.SUCCESS };
  }

  /**
   * Handle processing result
   */
  private async handleProcessingResult(
    event: any,
    response: { result: ProcessingResult; errorCode?: string; errorMessage?: string }
  ): Promise<void> {
    switch (response.result) {
      case ProcessingResult.SUCCESS:
        await IngestEventModel.updateOne(
          { _id: event._id },
          { $set: { status: IngestEventStatus.PROCESSED } }
        );
        
        // Store idempotency record
        await this.storeIdempotency(event.eventId);
        break;

      case ProcessingResult.RETRYABLE_FAILURE:
        if (event.attempts >= this.config.maxRetryAttempts) {
          // Max retries exceeded, move to DLQ
          await this.moveToDLQ(
            event,
            response.errorCode || 'MAX_RETRIES_EXCEEDED',
            response.errorMessage || 'Maximum retry attempts exceeded'
          );
        } else {
          // Schedule retry
          const nextAttemptAt = this.calculateNextAttempt(event.attempts);
          await IngestEventModel.updateOne(
            { _id: event._id },
            {
              $set: {
                status: IngestEventStatus.QUEUED,
                nextAttemptAt,
                lastErrorCode: response.errorCode,
                lastErrorAt: new Date(),
              },
            }
          );
        }
        break;

      case ProcessingResult.NON_RETRYABLE_FAILURE:
        // Move directly to DLQ
        await this.moveToDLQ(
          event,
          response.errorCode || 'NON_RETRYABLE_ERROR',
          response.errorMessage || 'Non-retryable failure'
        );
        break;
    }
  }

  /**
   * Calculate next retry attempt time
   */
  private calculateNextAttempt(attempts: number): Date {
    const delay = Math.min(
      this.config.initialRetryDelayMs * Math.pow(this.config.retryBackoffMultiplier, attempts - 1),
      this.config.maxRetryDelayMs
    );

    return new Date(Date.now() + delay);
  }

  /**
   * Move event to DLQ
   */
  private async moveToDLQ(
    event: any,
    errorCode: string,
    errorMessage: string
  ): Promise<void> {
    // Create DLQ record
    await DLQEventModel.create({
      eventId: event.eventId,
      eventType: event.eventType,
      originalReceivedAt: event.receivedAt,
      movedToDLQAt: new Date(),
      attempts: event.attempts,
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
      lastErrorAt: new Date(),
      payloadSnapshot: event.payloadSnapshot,
      replayable: event.replayable,
    });

    // Update original event
    await IngestEventModel.updateOne(
      { _id: event._id },
      {
        $set: {
          status: IngestEventStatus.DLQ,
          lastErrorCode: errorCode,
          lastErrorAt: new Date(),
        },
      }
    );
  }

  /**
   * Check if event was already processed (idempotency)
   */
  private async checkIdempotency(eventId: string): Promise<boolean> {
    const record = await IdempotencyRecordModel.findOne({
      pointsIdempotencyKey: eventId,
      eventScope: 'ingest_event',
    });

    return record !== null;
  }

  /**
   * Store idempotency record
   */
  private async storeIdempotency(eventId: string): Promise<void> {
    try {
      await IdempotencyRecordModel.create({
        pointsIdempotencyKey: eventId,
        eventScope: 'ingest_event',
        resultHash: 'processed',
        storedResult: { processed: true, timestamp: new Date() },
      });
    } catch (error) {
      // Ignore duplicate key errors (race condition)
      if ((error as any).code !== 11000) {
        throw error;
      }
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get worker status
   */
  getStatus(): { isRunning: boolean; handlerCount: number } {
    return {
      isRunning: this.isRunning,
      handlerCount: this.handlers.size,
    };
  }
}
