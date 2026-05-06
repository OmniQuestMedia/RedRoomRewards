/**
 * Ingest Event Structured Logger
 *
 * Production-safe logging for /v1/events/ingest endpoint with automatic redaction.
 * Logs only approved fields, omitting secrets, PII, and raw payloads.
 *
 * Emits structured JSON to stdout via console.log so external collection
 * (CloudWatch, Datadog, Better Stack) can parse on its own — this is
 * intentional and predates the pino migration in D-001. Migration is
 * tracked alongside src/metrics/logger.ts in CLEANUP.md.
 */

/**
 * Structured log entry for ingest events
 * Only includes fields approved for production logging
 */
export interface IngestLogEntry {
  correlationId: string;
  merchantId?: string;
  eventType?: string;
  eventId: string;
  idempotencyKey: string;
  outcome: 'accepted' | 'rejected' | 'duplicate';
  httpStatus: number;
  errorCode?: string;
}

/**
 * Log structured ingest event with automatic redaction.
 * Suppressed in NODE_ENV=test and when DISABLE_METRICS_LOGS=1.
 */
export function logIngestEvent(entry: IngestLogEntry): void {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_METRICS_LOGS === '1') return;

  const logEntry = {
    level: 'INFO',
    category: 'ingest',
    correlationId: entry.correlationId,
    merchantId: entry.merchantId,
    eventType: entry.eventType,
    eventId: entry.eventId,
    idempotencyKey: entry.idempotencyKey,
    outcome: entry.outcome,
    httpStatus: entry.httpStatus,
    errorCode: entry.errorCode,
    timestamp: new Date().toISOString(),
  };

  console.log(JSON.stringify(logEntry));
}
