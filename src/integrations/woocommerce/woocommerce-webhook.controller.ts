import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { WooCommerceService, WooCommerceOrderPayload } from './woocommerce.service';

interface WooCommerceWebhookBody {
  /** WooCommerce sends the topic in the body as meta, but we also accept it here */
  topic?: string;
  [key: string]: unknown;
}

@Controller('integrations/woocommerce')
export class WooCommerceWebhookController {
  private readonly logger = new Logger(WooCommerceWebhookController.name);

  constructor(private readonly wooService: WooCommerceService) {}

  /**
   * POST /api/v1/integrations/woocommerce/webhook
   *
   * Receives WooCommerce order webhooks. Responds 200 immediately and
   * processes the order asynchronously to avoid WooCommerce retry storms.
   *
   * Signature: HMAC-SHA256 of raw body using WOOCOMMERCE_WEBHOOK_SECRET,
   * delivered in the `x-wc-webhook-signature` header (base64-encoded).
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Body() body: WooCommerceWebhookBody,
    @Headers('x-wc-webhook-topic') topic: string,
    @Headers('x-wc-webhook-signature') signature: string,
    @Headers('x-wc-webhook-delivery-id') deliveryId: string,
  ): Promise<{ received: boolean }> {
    this.verifySignature(body, signature);

    const eventTopic = topic ?? body.topic ?? '';
    this.logger.log({ topic: eventTopic, deliveryId }, 'WooCommerce webhook received');

    // Fire-and-forget — respond 200 before processing
    void this.dispatch(eventTopic, body as unknown as WooCommerceOrderPayload).catch((err) => {
      this.logger.error(
        { topic: eventTopic, deliveryId, err: String(err) },
        'WooCommerce webhook processing error',
      );
    });

    return { received: true };
  }

  private verifySignature(body: unknown, signature: string): void {
    const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn('WOOCOMMERCE_WEBHOOK_SECRET not set — skipping signature verification'); // ci-allow: log-secret — logs a config-missing notice, no secret value is present
      return;
    }

    if (!signature) {
      throw new BadRequestException('Missing x-wc-webhook-signature header');
    }

    const payload = JSON.stringify(body);
    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('base64');

    let sigBuf: Buffer;
    let expectedBuf: Buffer;
    try {
      sigBuf = Buffer.from(signature, 'base64');
      expectedBuf = Buffer.from(expected, 'base64');
    } catch {
      throw new BadRequestException('Invalid signature encoding');
    }

    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  private async dispatch(topic: string, order: WooCommerceOrderPayload): Promise<void> {
    switch (topic) {
      case 'order.completed':
        await this.wooService.processOrderCompleted(order);
        break;
      case 'order.refunded':
        await this.wooService.processOrderRefunded(order);
        break;
      default:
        this.logger.log({ topic }, 'WooCommerce webhook topic not handled — ignored');
    }
  }
}
