import { Module } from '@nestjs/common';
import { WebhookReceiveController } from './webhook-receive.controller';
import { WebhookReceiveService } from './webhook-receive.service';
import { WebhookEmitService } from './webhook-emit.service';
import { IdempotencyService } from '../services/idempotency.service';
import { AffiliateService } from '../services/affiliate.service';

/**
 * WebhookModule (C-007 + C-008)
 *
 * Wires the inbound webhook receive surface (C-007) and the outbound
 * emit stub (C-008). IdempotencyService is provided via factory because
 * it is a plain class without @Injectable(). AffiliateService lets the
 * receiver auto-provision affiliate links from AccountsZone CreatorRegistered
 * events.
 */
@Module({
  controllers: [WebhookReceiveController],
  providers: [
    WebhookReceiveService,
    WebhookEmitService,
    AffiliateService,
    { provide: IdempotencyService, useFactory: () => new IdempotencyService() },
  ],
})
export class WebhookModule {}
