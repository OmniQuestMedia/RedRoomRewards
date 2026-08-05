import { Module } from '@nestjs/common';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';
import { LedgerService } from '../ledger/ledger.service';
import { TierEngineService } from '../services/tier-engine.service';

@Module({
  controllers: [RedemptionController],
  providers: [
    RedemptionService,
    TierEngineService,
    { provide: LedgerService, useFactory: () => new LedgerService() },
  ],
})
export class RedemptionModule {}
