import { Injectable } from '@nestjs/common';
import { RedRoomLedgerService } from './redroom-ledger.service';
import { BurnRedemption, GiftRedemptionRequest } from '../interfaces/redroom-rewards';

/**
 * BurnCatalogService — WO-012 final polish.
 *
 * Processes point redemptions (burns) against the RedRoomPleasures catalog.
 * All burns route through RedRoomLedgerService for compliance (spec §5).
 *
 * Guards:
 * - pointsSpent must be a positive integer.
 * - reason_code format: BURN_<itemId>_<reason> (spec requirement).
 */
@Injectable()
export class BurnCatalogService {
  constructor(private readonly ledger: RedRoomLedgerService) {}

  async redeemPoints(redemption: BurnRedemption): Promise<boolean> {
    if (!redemption.memberId) {
      throw new Error('memberId is required for redemption');
    }
    if (!Number.isInteger(redemption.pointsSpent) || redemption.pointsSpent <= 0) {
      throw new Error('pointsSpent must be a positive integer');
    }
    if (!redemption.itemId) {
      throw new Error('itemId is required for redemption');
    }

    // Burn from Promotional Bonus bucket via ledger (negative delta = burn)
    return this.ledger.awardPointsWithCompliance(
      redemption.memberId,
      -redemption.pointsSpent,
      `BURN_${redemption.itemId}_${redemption.reason}`,
    );
  }

  async redeemGift(request: GiftRedemptionRequest): Promise<boolean> {
    const platformCommission = Math.round(request.tokenValue * 0.25);
    const pointsToBurn = request.tokenValue + platformCommission; // creator gets full token value

    return this.ledger.awardPointsWithCompliance(
      request.memberId,
      -pointsToBurn,
      `GIFT_${request.giftId}${request.anonymous ? '_ANON' : ''}`,
    );
  }
}
