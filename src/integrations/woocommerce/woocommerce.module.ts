import { Module } from '@nestjs/common';
import { LedgerService } from '../../ledger/ledger.service';
import { WooCommerceService } from './woocommerce.service';
import { WooCommerceWebhookController } from './woocommerce-webhook.controller';

@Module({
  controllers: [WooCommerceWebhookController],
  providers: [
    WooCommerceService,
    { provide: LedgerService, useFactory: () => new LedgerService() },
  ],
  exports: [WooCommerceService],
})
export class WooCommerceModule {}
