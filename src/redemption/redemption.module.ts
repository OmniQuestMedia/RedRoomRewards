import { Module } from '@nestjs/common';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';
import { LedgerService } from '../ledger/ledger.service';

@Module({
  controllers: [RedemptionController],
  providers: [RedemptionService, { provide: LedgerService, useFactory: () => new LedgerService() }],
})
export class RedemptionModule {}
