/**
 * Events Controller
 * 
 * REST API controller for event ingestion based on OpenAPI specification.
 * Provides endpoints for external systems to submit events for async processing.
 * 
 * @see /api/openapi.yaml for API contract
 */

import { v4 as uuidv4 } from 'uuid';
import { IngestEventModel, IngestEventStatus, IdempotencyRecordModel } from '../db/models';
import { MetricsLogger, MetricEventType } from '../metrics';
import { logIngestEvent } from '../metrics/ingest-logger';

/**
 * Request interface for POST /events
 */
export interface PostEventRequest {
  eventId?: string;
  eventType: string;
  payload: Record<string, any>;
  idempotencyKey: string;
  requestId?: string;
  replayable?: boolean;
  correlationId?: string;
}

/**
 * Response interface for POST /events
 */
export interface EventResponse {
  eventId: string;
  status: 'queued' | 'duplicate';
  message: string;
  queuePosition?: number;
  requestId?: string;
  correlationId: string;
}

/**
 * Receipt response for support endpoint
 * Only includes approved fields for support operations
 */
export interface EventReceiptResponse {
  correlationId?: string;
  merchantId?: string;
  eventId: string;
  idempotencyKey?: string;
  processedAt?: Date;
  status: string;
  accepted?: boolean;
  replayed?: boolean;
  postedTransactions?: number;
  errorCode?: string;
}

/**
 * Validation error response
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Events Controller Class
 * Handles HTTP requests for event ingestion
 */
export class EventsController {
  /**
   * POST /events
   * Ingest an event for asynchronous processing
   * 
   * Implements idempotency to prevent duplicate event processing.
   * Events are queued for processing by the ingest worker.
   * 
   * @param request - Event data with idempotency key
   * @returns Promise<EventResponse>
   * @throws Error if validation fails
   */
  async postEvent(request: PostEventRequest): Promise<EventResponse> {
    // Generate or accept correlationId from upstream (existing repo convention)
    const correlationId = request.correlationId || request.requestId || this.generateCorrelationId();
    
    // Extract merchantId from payload if present
    const merchantId = request.payload?.merchantId as string | undefined;
    
    // Validate required fields
    this.validateRequest(request);

    // Log ingest received
    MetricsLogger.incrementCounter(MetricEventType.INGEST_RECEIVED, {
      eventType: request.eventType,
    });

    // Generate or use provided event ID
    const eventId = request.eventId || this.generateEventId();
    const requestId = request.requestId || this.generateRequestId();

    // Check idempotency - has this exact request been processed before?
    const isDuplicate = await this.checkIdempotency(request.idempotencyKey);
    
    if (isDuplicate) {
      // Return cached response for duplicate request
      MetricsLogger.incrementCounter(MetricEventType.INGEST_IDEMPOTENCY_HIT, {
        idempotencyKey: request.idempotencyKey,
        eventType: request.eventType,
      });

      // Structured logging with redaction
      logIngestEvent({
        correlationId,
        merchantId,
        eventType: request.eventType,
        eventId,
        idempotencyKey: request.idempotencyKey,
        outcome: 'duplicate',
        httpStatus: 200,
      });

      return {
        eventId,
        status: 'duplicate',
        message: 'Event already processed or queued',
        requestId,
        correlationId,
      };
    }

    try {
      // Store idempotency record
      await this.storeIdempotency(request.idempotencyKey, eventId);

      // Create ingest event record with correlationId and receipt fields
      const ingestEvent = await IngestEventModel.create({
        eventId,
        eventType: request.eventType,
        receivedAt: new Date(),
        status: IngestEventStatus.QUEUED,
        attempts: 0,
        payloadSnapshot: request.payload,
        replayable: request.replayable !== false, // Default to true
        correlationId,
        merchantId,
        idempotencyKey: request.idempotencyKey,
        accepted: undefined, // Will be set after processing
        replayed: false,
        postedTransactions: 0,
      });

      // Get approximate queue position (count of queued events before this one)
      const queuePosition = await IngestEventModel.countDocuments({
        status: IngestEventStatus.QUEUED,
        receivedAt: { $lt: ingestEvent.receivedAt },
      });

      // Log acceptance
      MetricsLogger.incrementCounter(MetricEventType.INGEST_ACCEPTED, {
        eventType: request.eventType,
      });

      // Structured logging with redaction
      logIngestEvent({
        correlationId,
        merchantId,
        eventType: request.eventType,
        eventId,
        idempotencyKey: request.idempotencyKey,
        outcome: 'accepted',
        httpStatus: 201,
      });

      return {
        eventId,
        status: 'queued',
        message: 'Event queued for processing',
        queuePosition: queuePosition + 1,
        requestId,
        correlationId,
      };
    } catch (error) {
      // Log rejection
      const errorCode = error instanceof Error ? error.name : 'UNKNOWN_ERROR';
      
      MetricsLogger.incrementCounter(MetricEventType.INGEST_REJECTED, {
        eventType: request.eventType,
        errorCode,
      });

      // Structured logging with redaction
      logIngestEvent({
        correlationId,
        merchantId,
        eventType: request.eventType,
        eventId,
        idempotencyKey: request.idempotencyKey,
        outcome: 'rejected',
        httpStatus: 500,
        errorCode,
      });

      throw error;
    }
  }

  /**
   * GET /v1/events/receipt
   * Lookup event receipt by merchantId and idempotencyKey (support endpoint)
   * 
   * Returns only approved fields for support operations.
   * Must be protected by admin/support auth guard.
   * 
   * @param merchantId - Merchant identifier
   * @param idempotencyKey - Idempotency key
   * @returns Promise<EventReceiptResponse | null>
   */
  async getEventReceipt(
    merchantId: string,
    idempotencyKey: string
  ): Promise<EventReceiptResponse | null> {
    // Query for the event by merchantId and idempotencyKey
    const event = await IngestEventModel.findOne({
      merchantId,
      idempotencyKey,
    });

    if (!event) {
      return null;
    }

    // Return only approved fields (no sensitive data, no PII, no payloads)
    return {
      correlationId: event.correlationId,
      merchantId: event.merchantId,
      eventId: event.eventId,
      idempotencyKey: event.idempotencyKey,
      processedAt: event.processedAt,
      status: event.status,
      accepted: event.accepted,
      replayed: event.replayed,
      postedTransactions: event.postedTransactions,
      errorCode: event.lastErrorCode,
    };
  }

  /**
   * Validate incoming event request
   * @private
   */
  private validateRequest(request: PostEventRequest): void {
    const errors: ValidationError[] = [];

    // Validate idempotency key
    if (!request.idempotencyKey) {
      errors.push({
        field: 'idempotencyKey',
        message: 'Idempotency key is required',
        code: 'REQUIRED_FIELD_MISSING',
      });
    } else if (typeof request.idempotencyKey !== 'string') {
      errors.push({
        field: 'idempotencyKey',
        message: 'Idempotency key must be a string',
        code: 'INVALID_TYPE',
      });
    } else if (request.idempotencyKey.length < 1 || request.idempotencyKey.length > 256) {
      errors.push({
        field: 'idempotencyKey',
        message: 'Idempotency key must be between 1 and 256 characters',
        code: 'INVALID_LENGTH',
      });
    }

    // Validate event type
    if (!request.eventType) {
      errors.push({
        field: 'eventType',
        message: 'Event type is required',
        code: 'REQUIRED_FIELD_MISSING',
      });
    } else if (typeof request.eventType !== 'string') {
      errors.push({
        field: 'eventType',
        message: 'Event type must be a string',
        code: 'INVALID_TYPE',
      });
    } else if (request.eventType.length > 128) {
      errors.push({
        field: 'eventType',
        message: 'Event type must be 128 characters or less',
        code: 'INVALID_LENGTH',
      });
    }

    // Validate payload
    if (!request.payload) {
      errors.push({
        field: 'payload',
        message: 'Payload is required',
        code: 'REQUIRED_FIELD_MISSING',
      });
    } else if (typeof request.payload !== 'object' || Array.isArray(request.payload)) {
      errors.push({
        field: 'payload',
        message: 'Payload must be an object',
        code: 'INVALID_TYPE',
      });
    }

    // Validate event ID if provided
    if (request.eventId !== undefined) {
      if (typeof request.eventId !== 'string') {
        errors.push({
          field: 'eventId',
          message: 'Event ID must be a string',
          code: 'INVALID_TYPE',
        });
      } else if (request.eventId.length > 256) {
        errors.push({
          field: 'eventId',
          message: 'Event ID must be 256 characters or less',
          code: 'INVALID_LENGTH',
        });
      }
    }

    // Validate replayable if provided
    if (request.replayable !== undefined && typeof request.replayable !== 'boolean') {
      errors.push({
        field: 'replayable',
        message: 'Replayable must be a boolean',
        code: 'INVALID_TYPE',
      });
    }

    if (errors.length > 0) {
      const error = new Error('Validation failed');
      (error as any).validationErrors = errors;
      throw error;
    }
  }

  /**
   * Check if idempotency key has been used before
   * @private
   */
  private async checkIdempotency(idempotencyKey: string): Promise<boolean> {
    const record = await IdempotencyRecordModel.findOne({
      pointsIdempotencyKey: idempotencyKey,
      eventScope: 'event_ingestion',
    });

    return record !== null;
  }

  /**
   * Store idempotency record
   * @private
   */
  private async storeIdempotency(idempotencyKey: string, eventId: string): Promise<void> {
    try {
      await IdempotencyRecordModel.create({
        pointsIdempotencyKey: idempotencyKey,
        eventScope: 'event_ingestion',
        resultHash: eventId,
        storedResult: { 
          eventId,
          queued: true,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      // Ignore duplicate key errors (race condition)
      if ((error as any).code !== 11000) {
        throw error;
      }
    }
  }

  /**
   * Generate event ID
   * @private
   */
  private generateEventId(): string {
    return `evt_${uuidv4()}`;
  }

  /**
   * Generate request ID
   * @private
   */
  private generateRequestId(): string {
    return `req_${uuidv4()}`;
  }

  /**
   * Generate correlation ID (follows X-Request-ID convention)
   * @private
   */
  private generateCorrelationId(): string {
    return uuidv4();
  }
}

/**
 * Factory function to create controller instance
 */
export function createEventsController(): EventsController {
  return new EventsController();
}
