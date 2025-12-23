import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RRRWebhookController } from './controllers/rrr-webhook.controller';
import { WebhookEventSchema } from './models/webhook-event.model';

/**
 * LoyaltyPoints Module
 * 
 * Handles loyalty points operations including:
 * - Webhook processing from external systems
 * - Point earning and redemption
 * - Transaction recording
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'WebhookEvent', schema: WebhookEventSchema },
    ]),
  ],
  controllers: [RRRWebhookController],
  providers: [],
  exports: [],
})
export class LoyaltyPointsModule {}
