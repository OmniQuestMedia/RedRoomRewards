import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { WooCommerceService, WooCommerceOrderPayload } from './woocommerce.service';

interface WooCommerceWebhookBody {
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
   * Signature: HMAC-SHA256 of the raw request body using WOOCOMMERCE_WEBHOOK_SECRET,
   * delivered in the `x-wc-webhook-signature` header (base64-encoded).
   * Uses req.rawBody (buffered by NestFactory rawBody:true) to match the exact
   * bytes WooCommerce signed — JSON.stringify would differ in whitespace/key order.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Body() body: WooCommerceWebhookBody,
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-wc-webhook-topic') topic: string,
    @Headers('x-wc-webhook-signature') signature: string,
    @Headers('x-wc-webhook-delivery-id') deliveryId: string,
  ): Promise<{ received: boolean }> {
    this.verifySignature(req.rawBody, signature);

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

  private verifySignature(rawBody: Buffer | undefined, signature: string): void {
    const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn('WOOCOMMERCE_WEBHOOK_SECRET not set — skipping signature verification'); // ci-allow: log-secret — logs a config-missing notice, no secret value is present
      return;
    }

    if (!signature) {
      throw new BadRequestException('Missing x-wc-webhook-signature header');
    }

    const payload = rawBody ?? Buffer.alloc(0);
    const expected = createHmac('sha256', secret).update(payload).digest('base64');

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
