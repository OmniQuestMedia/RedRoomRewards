import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { IdempotencyService } from '../services/idempotency.service';
import { WebhookEmitService } from './webhook-emit.service';
import { AffiliateService } from '../services/affiliate.service';
import { AffiliateSpiffService } from '../services/affiliate-spiff.service';
import { IAffiliateLink } from '../db/models/affiliate-link.model';
import logger from '../lib/logger';

/** Operation name used for webhook-receive idempotency records. */
const WEBHOOK_RECEIVE_OP = 'webhook_receive';

/** Tenant scope used for system-level webhook idempotency keys. */
const WEBHOOK_TENANT_SCOPE = 'system';

/** Map an AccountsZone origin-platform label onto the RRR affiliate enum. */
function toAffiliatePlatform(origin: unknown): IAffiliateLink['platform'] {
  const s = typeof origin === 'string' ? origin.toLowerCase() : '';
  if (s.includes('synthi')) return 'synthimate';
  if (s.includes('redroompleasures')) return 'redroompleasures';
  return 'chatnow';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

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
    private readonly affiliate: AffiliateService,
    private readonly spiff: AffiliateSpiffService,
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

    // Route by type. A provisioning failure here throws before the idempotency
    // key is recorded, so an at-least-once redelivery safely retries (the
    // provisioning itself is idempotent).
    await this.routeEvent(payload);

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
   * Dispatch an accepted webhook event to its handler. Handles:
   *   AccountsZone `CreatorRegistered`          → auto-provision an ON affiliate link.
   *   RedRoomPleasures `affiliate.award.attributed` → award the creator's first-purchase
   *                                               RRR points spiff (RRR owns points).
   * Unknown types are a no-op (logged), preserving the prior accept-and-log behaviour.
   */
  private async routeEvent(payload: Record<string, unknown>): Promise<void> {
    // Tolerate both the raw event and the AccountsZone v1.1 envelope
    // ({ event: { type, tenant_id, correlation_id, payload } }).
    const envelope = asRecord(payload['event']);
    const eventType =
      (envelope?.['type'] as string) ??
      (payload['type'] as string) ??
      (payload['eventType'] as string);

    switch (eventType) {
      case 'CreatorRegistered':
        return this.handleCreatorRegistered(payload, envelope, eventType);
      case 'affiliate.award.attributed':
        return this.handleAffiliateAwardAttributed(payload, envelope, eventType);
      default:
        return;
    }
  }

  /** Auto-provision an ON RedRoomRewards affiliate link for a new creator. */
  private async handleCreatorRegistered(
    payload: Record<string, unknown>,
    envelope: Record<string, unknown> | null,
    eventType: string,
  ): Promise<void> {
    const source = envelope ?? payload;
    const data = asRecord(source['payload']) ?? asRecord(payload['data']) ?? {};
    const tenantId = (source['tenant_id'] as string) ?? (data['tenant_id'] as string);
    const accountId = data['account_id'] as string;
    const correlationId =
      (source['correlation_id'] as string) ?? (data['correlation_id'] as string);

    if (!tenantId || !accountId) {
      logger.warn(
        { eventType, hasTenant: Boolean(tenantId), hasAccount: Boolean(accountId) },
        'CreatorRegistered missing tenant_id/account_id; skipping affiliate provisioning',
      );
      return;
    }

    const link = await this.affiliate.ensureLinkForCreator({
      tenant_id: tenantId,
      creator_id: accountId,
      external_creator_ref: accountId,
      platform: toAffiliatePlatform(data['origin_platform']),
      correlation_id: correlationId,
    });

    logger.info(
      { affiliateId: link.affiliate_id, creatorId: accountId, tenantId },
      'Auto-provisioned RedRoomRewards affiliate link from CreatorRegistered',
    );
  }

  /**
   * Award the referring creator's account-spiff points on an attributed
   * affiliate award. Gated on `isFirstPurchase` (the spiff fires once, on the
   * referred guest's first RedRoomPleasures purchase). RRR is the points
   * authority; AccountFinanceZone only reflects the resulting balance.
   */
  private async handleAffiliateAwardAttributed(
    payload: Record<string, unknown>,
    envelope: Record<string, unknown> | null,
    eventType: string,
  ): Promise<void> {
    const source = envelope ?? payload;
    const data = asRecord(source['payload']) ?? asRecord(payload['data']) ?? {};
    const tenantId = (source['tenant_id'] as string) ?? (data['tenant_id'] as string);
    const creatorId = data['creatorId'] as string;
    const referredUserId = data['referredUserId'] as string;
    const isFirstPurchase = data['isFirstPurchase'] === true;
    const eventId =
      (source['correlation_id'] as string) ??
      (payload['eventId'] as string) ??
      (payload['id'] as string);

    if (!isFirstPurchase) {
      logger.info(
        { eventType, creatorId },
        'affiliate.award.attributed is not a first purchase; no account spiff',
      );
      return;
    }

    if (!tenantId || !creatorId || !referredUserId) {
      logger.warn(
        {
          eventType,
          hasTenant: Boolean(tenantId),
          hasCreator: Boolean(creatorId),
          hasReferred: Boolean(referredUserId),
        },
        'affiliate.award.attributed missing tenant_id/creatorId/referredUserId; skipping spiff',
      );
      return;
    }

    const result = await this.spiff.awardNewAccountSpiff({
      creatorId,
      referredUserId,
      requestId: eventId,
      tenantId,
    });

    logger.info(
      {
        creatorId,
        referredUserId,
        tenantId,
        awarded: result.awarded,
        points: result.points,
        reason: result.reason,
      },
      'Processed affiliate.award.attributed account spiff',
    );
  }

  /**
   * HMAC-SHA256 signature verification.
   *
   * Compares the `x-webhook-signature` header against
   * HMAC-SHA256(timestamp + '.' + JSON.stringify(payload), RRR_WEBHOOK_SECRET).
   * Uses timing-safe comparison to prevent timing attacks.
   *
   * Fail-closed: when RRR_WEBHOOK_SECRET is not configured this rejects the
   * webhook (returns false) in production, so a missing-secret misconfiguration
   * can never let unsigned events award points on this financial ingest path.
   * The unsigned "stub mode" allowance survives only outside production
   * (NODE_ENV !== 'production') for local dev/CI, and logs a loud warning.
   */
  private verifySignature(
    payload: Record<string, unknown>,
    signature: string,
    timestamp: string,
  ): boolean {
    const secret = process.env['RRR_WEBHOOK_SECRET'];
    if (!secret) {
      if (process.env['NODE_ENV'] === 'production') {
        logger.error(
          'RRR_WEBHOOK_SECRET is not configured in production; rejecting webhook (fail-closed)',
        );
        return false;
      }
      logger.warn(
        'RRR_WEBHOOK_SECRET not configured — accepting unsigned webhook in non-production stub mode only',
      );
      return true; // stub mode — non-production only
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
