/**
 * Metrics and Monitoring Types
 * 
 * Lightweight metrics definitions for M1 production hardening.
 * Provides operational visibility for ingest, DLQ, reservations, and admin operations.
 */

/**
 * Metric event types for operational monitoring
 */
export enum MetricEventType {
  // Ingest worker metrics
  INGEST_EVENT_PROCESSED = 'ingest.event.processed',
  INGEST_EVENT_FAILED = 'ingest.event.failed',
  INGEST_EVENT_DLQ = 'ingest.event.dlq',
  INGEST_IDEMPOTENCY_HIT = 'ingest.idempotency.hit',
  
  // DLQ and replay metrics
  DLQ_EVENT_MOVED = 'dlq.event.moved',
  DLQ_REPLAY_STARTED = 'dlq.replay.started',
  DLQ_REPLAY_SUCCESS = 'dlq.replay.success',
  DLQ_REPLAY_FAILED = 'dlq.replay.failed',
  DLQ_REPLAY_SKIPPED = 'dlq.replay.skipped',
  DLQ_DOUBLE_PROCESS_PREVENTED = 'dlq.double_process.prevented',
  
  // Reservation metrics
  RESERVATION_CREATED = 'reservation.created',
  RESERVATION_COMMITTED = 'reservation.committed',
  RESERVATION_RELEASED = 'reservation.released',
  RESERVATION_EXPIRED = 'reservation.expired',
  
  // Activity feed metrics (placeholder for future)
  ACTIVITY_FEED_EVENT = 'activity.feed.event',
  
  // Partner admin metrics (placeholder for future)
  ADMIN_DISPUTE_OPENED = 'admin.dispute.opened',
  ADMIN_DISPUTE_RESOLVED = 'admin.dispute.resolved',
  ADMIN_FRAUD_FLAGGED = 'admin.fraud.flagged',
  
  // Event bus metrics
  EVENT_PUBLISHED = 'event.published',
  EVENT_DUPLICATE_DETECTED = 'event.duplicate.detected',
  EVENT_NO_SUBSCRIBERS = 'event.no_subscribers',
  EVENT_HANDLER_SUCCESS = 'event.handler.success',
  EVENT_HANDLER_ERROR = 'event.handler.error',
  EVENT_SUBSCRIBER_REGISTERED = 'event.subscriber.registered',
  EVENT_SUBSCRIBER_UNREGISTERED = 'event.subscriber.unregistered',
  
  // Wallet event metrics
  WALLET_EVENT_PUBLISHED = 'wallet.event.published',
  WALLET_EVENT_PUBLISH_ERROR = 'wallet.event.publish.error',
}

/**
 * Metric data payload
 */
export interface MetricData {
  /** Event type */
  type: MetricEventType;
  
  /** Metric value (count, duration, etc.) */
  value?: number;
  
  /** Timestamp of the metric */
  timestamp: Date;
  
  /** Additional context */
  metadata?: Record<string, any>;
}

/**
 * Alerting severity levels
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Alert data for operational incidents
 */
export interface AlertData {
  /** Alert severity */
  severity: AlertSeverity;
  
  /** Alert message */
  message: string;
  
  /** Related metric type */
  metricType?: MetricEventType;
  
  /** Timestamp */
  timestamp: Date;
  
  /** Additional context */
  metadata?: Record<string, any>;
}
