import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GateGuardAVService } from './gateguard-av.service';
import { RedRoomLedgerService } from './redroom-ledger.service';
import { TierEngineService } from './tier-engine.service';
import { MemberSignupRequest, MemberProfile } from '../interfaces/redroom-rewards';

/**
 * MemberService — WO-008 final polish.
 *
 * Handles member signup with mandatory GateGuard AV enforcement (brand standard)
 * and issues the 1,000-point welcome bonus via RedRoomLedgerService.
 *
 * Member IDs use UUID v4 for collision safety across distributed instances.
 * The welcome bonus amount (1,000) is spec-locked per docs/ASSUMPTIONS.md F-008.
 */
@Injectable()
export class MemberService {
  private static readonly WELCOME_BONUS_POINTS = 1_000;

  constructor(
    private readonly avService: GateGuardAVService,
    private readonly ledgerService: RedRoomLedgerService,
    private readonly tierService: TierEngineService,
  ) {}

  async signup(request: MemberSignupRequest): Promise<MemberProfile> {
    if (!request.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) {
      throw new Error('Valid email is required for signup');
    }

    // MANDATORY GateGuard AV — brand standard; never bypass
    const avResult = await this.avService.verifyAccount(request.email, request.billingAddress);
    if (!avResult.verified) {
      throw new Error('18+ verification required - account creation blocked');
    }

    const memberId = `rr-${randomUUID()}`;

    // Welcome bonus in the Promotional Bonus bucket (spec F-008)
    await this.ledgerService.awardPointsWithCompliance(
      memberId,
      MemberService.WELCOME_BONUS_POINTS,
      'WELCOME_BONUS',
    );

    const tier = this.tierService.calculateTier(MemberService.WELCOME_BONUS_POINTS);

    return {
      memberId,
      tier: tier.currentTier,
      totalPoints: MemberService.WELCOME_BONUS_POINTS,
      promotionalBalance: MemberService.WELCOME_BONUS_POINTS,
      verifiedAt: avResult.verifiedAt,
    };
  }
}
