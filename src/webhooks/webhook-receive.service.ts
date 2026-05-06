import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { IdempotencyService } from '../services/idempotency.service';
import { WebhookEmitService } from './webhook-emit.service';
import logger from '../lib/logger';

/** Operation name used for webhook-receive idempotency records. */
const WEBHOOK_RECEIVE_OP = 'webhook_receive';

/** Tenant scope used for system-level webhook idempotency keys. */
const WEBHOOK_TENANT_SCOPE = 'system';

/**
 * WebhookReceiveService (C-007)
 *
 * Handles incoming webhook events from external systems.
 * - Verifies HMAC-SHA256 signature against RRR_WEBHOOK_SECRET.
 * - Deduplicates replays via IdempotencyService.
 * - Logs accepted events; queues are wired in a future payload.
 */
@Injectable()
export class WebhookReceiveService {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly emitService: WebhookEmitService,
  ) {}

  async handleIncoming(
    payload: Record<string, unknown>,
    signature: string,
    timestamp: string,
    _req: unknown,
  ): Promise<{ status: string; eventId: string }> {
    if (!this.verifySignature(payload, signature, timestamp)) {
      throw new Error('Invalid webhook signature');
    }

    const eventId = (payload['eventId'] as string) || (payload['id'] as string);
    if (!eventId) {
      throw new Error('Missing eventId in webhook payload');
    }

    const existing = await this.idempotency.checkKey(
      eventId,
      WEBHOOK_TENANT_SCOPE,
      WEBHOOK_RECEIVE_OP,
    );
    if (existing) {
      return existing as { status: string; eventId: string };
    }

    logger.info({ eventId }, 'Webhook event received');

    const result: { status: string; eventId: string } = { status: 'accepted', eventId };
    await this.idempotency.recordKey(
      eventId,
      WEBHOOK_TENANT_SCOPE,
      WEBHOOK_RECEIVE_OP,
      result as Record<string, unknown>,
    );
    return result;
  }

  /**
   * HMAC-SHA256 signature verification.
   *
   * Compares the `x-webhook-signature` header against
   * HMAC-SHA256(timestamp + '.' + JSON.stringify(payload), RRR_WEBHOOK_SECRET).
   * Uses timing-safe comparison to prevent timing attacks.
   * Returns true when RRR_WEBHOOK_SECRET is not configured (stub mode).
   */
  private verifySignature(
    payload: Record<string, unknown>,
    signature: string,
    timestamp: string,
  ): boolean {
    const secret = process.env['RRR_WEBHOOK_SECRET'];
    if (!secret) {
      return true; // stub mode — secret not configured
    }
    const body = `${timestamp}.${JSON.stringify(payload)}`;
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
