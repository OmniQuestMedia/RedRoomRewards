import { Module } from '@nestjs/common';
import { LedgerService } from '../ledger/ledger.service';
import { GateGuardAVService } from '../services/gateguard-av.service';
import { WelfareGuardianScoreService } from '../services/welfare-guardian-score.service';
import { MemberContributionService } from './member-contribution.service';
import { PromotionEligibilityService } from './promotion-eligibility.service';
import { PromotionCampaignService } from './promotion-campaign.service';
import { PromotionEngineService } from './promotion-engine.service';
import { PromotionLiabilityService } from './promotion-liability.service';
import {
  PromotionsController,
  AdminPromotionsController,
} from '../controllers/promotions.controller';

@Module({
  controllers: [PromotionsController, AdminPromotionsController],
  providers: [
    MemberContributionService,
    PromotionEligibilityService,
    PromotionCampaignService,
    PromotionEngineService,
    PromotionLiabilityService,
    GateGuardAVService,
    WelfareGuardianScoreService,
    { provide: LedgerService, useFactory: () => new LedgerService() },
  ],
  exports: [
    PromotionEngineService,
    PromotionCampaignService,
    PromotionLiabilityService,
    MemberContributionService,
  ],
})
export class PromotionsModule {}
