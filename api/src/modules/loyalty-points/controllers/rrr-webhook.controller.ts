import { BadRequestException, Body, Controller, Headers, Logger, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';

/**
 * RRR Webhook Controller
 * 
 * Handles incoming webhooks from RedRoomRewards external systems.
 * 
 * Security measures:
 * - Input validation with primitive type enforcement (prevents operator injection)
 * - Signature verification for webhook authenticity
 * - Idempotency protection using event_id
 * - CodeQL-compliant: event_id validated as primitive string BEFORE database queries
 * - MongoDB queries use $eq operator to prevent NoSQL injection
 */
@Controller('webhooks/rrr')
export class RRRWebhookController {
  private readonly logger = new Logger(RRRWebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    @InjectModel('WebhookEvent') private readonly webhookEventModel: Model<any>,
  ) {
    // In production, load from environment variable
    this.webhookSecret = process.env.RRR_WEBHOOK_SECRET || 'changeme';
  }

  /**
   * Validates and extracts event_id from untrusted payload
   * 
   * Security: Enforces primitive string type, prevents operator injection
   * CodeQL: Breaks data flow by validating input before DB query
   * 
   * @param event_id - Untrusted input from webhook payload
   * @returns Validated string event_id
   * @throws BadRequestException if validation fails
   */
  private getValidatedEventId(event_id: unknown): string {
    // Type guard: must be primitive string
    if (typeof event_id !== 'string') {
      throw new BadRequestException('Invalid webhook payload: event_id must be a string');
    }

    // Sanitize: trim whitespace
    const trimmed = event_id.trim();

    // Validate: non-empty
    if (!trimmed) {
      throw new BadRequestException('Invalid webhook payload: event_id is required');
    }

    // Validate: reasonable length (conservative limit)
    if (trimmed.length > 128) {
      throw new BadRequestException('Invalid webhook payload: event_id too long');
    }

    // Harden: reject MongoDB operator characters
    // This prevents patterns like {"$ne": null} from passing through
    if (trimmed.includes('$') || trimmed.includes('.')) {
      throw new BadRequestException('Invalid webhook payload: event_id contains illegal characters');
    }

    return trimmed;
  }

  /**
   * Verifies webhook signature using HMAC-SHA256
   * 
   * @param signature - Signature from X-RRR-Signature header
   * @param body - Raw webhook body
   * @returns true if signature is valid
   */
  private verifySignature(signature: string, body: string): boolean {
    if (!signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');

    // Use timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * Checks if event has already been processed (idempotency)
   * 
   * Security: Uses $eq operator to prevent NoSQL operator injection
   * CodeQL: eventId is validated primitive string (safe)
   * 
   * @param eventId - Validated event ID (primitive string)
   * @returns true if event already processed
   */
  private async isEventProcessed(eventId: string): Promise<boolean> {
    // Use $eq operator explicitly to prevent operator injection
    const existing = await this.webhookEventModel
      .findOne({ event_id: { $eq: eventId } }, { _id: 1 })
      .lean()
      .exec();

    return !!existing;
  }

  /**
   * Marks event as processed (idempotency record)
   * 
   * Security: Uses $eq operator and $setOnInsert to prevent injection
   * CodeQL: All parameters are validated primitives (safe)
   * 
   * @param eventId - Validated event ID (primitive string)
   * @param eventType - Event type (primitive string)
   * @param data - Event data (stored as-is for audit)
   */
  private async markEventProcessed(
    eventId: string,
    eventType: string,
    data: unknown,
  ): Promise<void> {
    // Use updateOne with upsert for atomic idempotency
    // $eq operator prevents injection, $setOnInsert ensures no overwrite
    await this.webhookEventModel
      .updateOne(
        { event_id: { $eq: eventId } },
        {
          $setOnInsert: {
            event_id: eventId,
            event_type: eventType,
            data,
            processed_at: new Date(),
          },
        },
        { upsert: true },
      )
      .exec();
  }

  /**
   * Handles incoming RRR webhook
   * 
   * Security design:
   * 1. Signature verification prevents unauthorized webhooks
   * 2. Input validation prevents injection attacks
   * 3. Idempotency prevents replay attacks
   * 4. All DB queries use $eq operator for safety
   * 
   * @param signature - HMAC signature from header
   * @param payload - Webhook payload (untrusted)
   * @returns Acknowledgment response
   */
  @Post()
  async handleWebhook(
    @Headers('x-rrr-signature') signature: string,
    @Body() payload: unknown,
  ): Promise<{ received: boolean }> {
    // Step 1: Verify webhook signature
    const bodyString = JSON.stringify(payload);
    const isValid = this.verifySignature(signature, bodyString);

    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    // Step 2: Safely extract fields from unknown payload
    // Type assertion here is safe because we only read properties
    const p = payload as Record<string, unknown>;
    const event_type = p['event_type'];
    const event_id = p['event_id'];
    const data = p['data'];

    // Step 3: Validate event_id (CRITICAL for CodeQL compliance)
    // This breaks the data flow: event_id becomes validated primitive string
    const safeEventId = this.getValidatedEventId(event_id);

    // Step 4: Log webhook receipt (no PII)
    this.logger.log(`Received RRR webhook: ${String(event_type)} (${safeEventId})`);

    // Step 5: Idempotency check
    // safeEventId is now a validated primitive string, safe for DB query
    if (await this.isEventProcessed(safeEventId)) {
      this.logger.log(`Event ${safeEventId} already processed, skipping`);
      return { received: true };
    }

    // Step 6: Mark as processed (idempotency record)
    await this.markEventProcessed(safeEventId, String(event_type), data);

    // Step 7: Process webhook event (business logic would go here)
    // For now, just acknowledge receipt
    this.logger.log(`Successfully processed webhook event ${safeEventId}`);

    return { received: true };
  }
}
