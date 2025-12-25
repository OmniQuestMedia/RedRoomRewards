/**
 * Ingest Module Types
 * 
 * Defines types for async event ingestion and DLQ (Dead Letter Queue)
 */

/**
 * Event processing status
 */
export enum EventStatus {
  /** Event queued for processing */
  QUEUED = 'queued',
  
  /** Event is being processed */
  PROCESSING = 'processing',
  
  /** Event processed successfully */
  PROCESSED = 'processed',
  
  /** Event failed validation */
  REJECTED = 'rejected',
  
  /** Event failed processing */
  FAILED = 'failed',
  
  /** Event moved to DLQ */
  DLQ = 'dlq',
}

/**
 * Ingest event envelope
 */
export interface IngestEvent {
  /** Event ID */
  eventId: string;
  
  /** Event type */
  eventType: string;
  
  /** Event payload */
  payload: any;
  
  /** Event status */
  status: EventStatus;
  
  /** Ingested at */
  ingestedAt: Date;
  
  /** Processed at */
  processedAt?: Date;
  
  /** Retry count */
  retryCount: number;
  
  /** Max retries allowed */
  maxRetries: number;
  
  /** Error message if failed */
  errorMessage?: string;
  
  /** Validation errors if rejected */
  validationErrors?: string[];
  
  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * DLQ entry for failed events
 */
export interface DLQEntry {
  /** DLQ entry ID */
  dlqId: string;
  
  /** Original event */
  event: IngestEvent;
  
  /** Reason for DLQ */
  reason: string;
  
  /** Failed at */
  failedAt: Date;
  
  /** Can be replayed */
  replayable: boolean;
  
  /** Replayed at (if replayed) */
  replayedAt?: Date;
  
  /** Replay result */
  replayResult?: 'success' | 'failed';
  
  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Event processing result
 */
export interface ProcessingResult {
  /** Event ID */
  eventId: string;
  
  /** Processing status */
  status: EventStatus;
  
  /** Result data if successful */
  result?: any;
  
  /** Error if failed */
  error?: string;
  
  /** Validation errors if rejected */
  validationErrors?: string[];
  
  /** Processing timestamp */
  timestamp: Date;
}

/**
 * Ingest statistics
 */
export interface IngestStatistics {
  /** Total events ingested */
  totalIngested: number;
  
  /** Events processed successfully */
  totalProcessed: number;
  
  /** Events rejected */
  totalRejected: number;
  
  /** Events failed */
  totalFailed: number;
  
  /** Events in DLQ */
  totalDLQ: number;
  
  /** Events currently queued */
  currentlyQueued: number;
  
  /** Events currently processing */
  currentlyProcessing: number;
  
  /** Statistics generated at */
  generatedAt: Date;
}

/**
 * Replay options for DLQ
 */
export interface ReplayOptions {
  /** Filter by event type */
  eventType?: string;
  
  /** Filter by reason */
  reason?: string;
  
  /** Max events to replay */
  maxEvents?: number;
  
  /** Force replay even if not replayable */
  force?: boolean;
}

/**
 * Replay result
 */
export interface ReplayResult {
  /** Number of events replayed */
  replayed: number;
  
  /** Number of successes */
  successes: number;
  
  /** Number of failures */
  failures: number;
  
  /** Event IDs that succeeded */
  successIds: string[];
  
  /** Event IDs that failed */
  failureIds: string[];
  
  /** Replay timestamp */
  timestamp: Date;
}
