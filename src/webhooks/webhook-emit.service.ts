/**
 * WebhookEmitService (C-005)
 *
 * Outbound webhook emission stub — sends structured event payloads to
 * registered webhook endpoints.  Full implementation (signature, retry,
 * idempotency) is deferred to a future wave.
 *
 * See src/webhooks/README.md for design notes.
 */

import { Injectable } from '@nestjs/common';
import logger from '../lib/logger';

export interface WebhookPayload {
  /** Dot-separated event type (e.g. "fraud.signal", "points.awarded"). */
  event: string;
  /** ISO-8601 timestamp when the event was emitted. */
  emittedAt: string;
  /** Structured event data. */
  data: Record<string, unknown>;
}

@Injectable()
export class WebhookEmitService {
  /**
   * Emit a structured webhook event.
   *
   * @param event - Dot-separated event type (e.g. "fraud.signal").
   * @param data  - Arbitrary key/value payload for the event.
   */
  async emit(event: string, data: Record<string, unknown>): Promise<void> {
    const payload: WebhookPayload = {
      event,
      emittedAt: new Date().toISOString(),
      data,
    };

    // TODO (C-005 / next wave): Fan-out to registered webhook endpoints with HMAC signing,
    // exponential-backoff retry, and idempotency key tracking.
    // For now, log the emission so it is visible in structured logs.
    logger.info({ event: 'WEBHOOK_EMIT', payload }, 'Webhook emit (stub)');
  }
}
