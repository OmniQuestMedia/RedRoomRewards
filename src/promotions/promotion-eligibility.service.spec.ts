/**
 * PromotionEligibilityService specs.
 *
 * The load-bearing assertions here are the *denials*. Anything that fails open
 * in this file is an unverified account being handed adult-programme incentives,
 * or a welfare-flagged member being induced to spend.
 */

import { PromotionEligibilityService } from './promotion-eligibility.service';
import {
  MemberContributionService,
  MemberContributionProfile,
} from './member-contribution.service';
import { GateGuardAVService } from '../services/gateguard-av.service';
import { WelfareGuardianScoreService } from '../services/welfare-guardian-score.service';
import { ContributionBand, IMultiplierTerms } from '../db/models/promotion-campaign.model';
import { WgsAction } from '../interfaces/redroom-rewards';

function profileWithBand(band: ContributionBand): MemberContributionProfile {
  return {
    member_id: 'member-1',
    tenant_id: 'redroompleasures',
    attributed_spend_cents: 50_000,
    attributed_purchase_count: 8,
    unattributed_credit_count: 1,
    bonus_issuance_count: 2,
    attribution_coverage: 0.89,
    points_granted_lifetime: 5_000,
    points_burned_lifetime: 1_000,
    points_outstanding: 4_000,
    cents_per_point: 1,
    contribution_margin_bps: 3_500,
    gross_margin_cents: 17_500,
    points_cost_cents: 5_000,
    net_contribution_cents: 12_500,
    net_contribution_ratio: 2.5,
    band,
    band_reason: `test band ${band}`,
    computed_at: new Date(),
  };
}

describe('PromotionEligibilityService', () => {
  let service: PromotionEligibilityService;
  let gateGuard: jest.Mocked<GateGuardAVService>;
  let welfare: jest.Mocked<WelfareGuardianScoreService>;
  let contribution: jest.Mocked<MemberContributionService>;

  function setup(opts: {
    verified?: boolean;
    gateGuardThrows?: boolean;
    welfareAction?: WgsAction;
    welfareThrows?: boolean;
    band?: ContributionBand;
  }) {
    gateGuard = {
      verifyAccount: opts.gateGuardThrows
        ? jest.fn().mockRejectedValue(new Error('gateguard unreachable'))
        : jest.fn().mockResolvedValue({
            verified: opts.verified ?? true,
            verifiedAt: new Date(),
            method: 'GATEGUARD',
            confidenceScore: 98,
          }),
    } as unknown as jest.Mocked<GateGuardAVService>;

    welfare = {
      scoreTransaction: opts.welfareThrows
        ? jest.fn().mockRejectedValue(new Error('wgs unreachable'))
        : jest.fn().mockResolvedValue({
            fraudRisk: 5,
            welfareRisk: 10,
            welfareTier: 'LOW',
            action: opts.welfareAction ?? 'PASS',
          }),
    } as unknown as jest.Mocked<WelfareGuardianScoreService>;

    contribution = {
      getProfile: jest.fn().mockResolvedValue(profileWithBand(opts.band ?? 'NET_POSITIVE')),
    } as unknown as jest.Mocked<MemberContributionService>;

    service = new PromotionEligibilityService(gateGuard, welfare, contribution);
  }

  const grantInput = {
    tenantId: 'redroompleasures',
    memberId: 'member-1',
    movement: 'GRANT' as const,
    pointsAtStake: 500,
    transactionRef: 'purchase-1',
  };

  const burnInput = { ...grantInput, movement: 'BURN' as const };

  describe('GateGuard age verification — fail closed', () => {
    it('denies a grant when the account is not age-verified', async () => {
      setup({ verified: false });
      const decision = await service.evaluate(grantInput);

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe('DENIED_AGE_VERIFICATION');
    });

    it('denies a burn when the account is not age-verified', async () => {
      setup({ verified: false });
      const decision = await service.evaluate(burnInput);
      expect(decision.allowed).toBe(false);
    });

    it('denies — never allows — when GateGuard itself is unreachable', async () => {
      setup({ gateGuardThrows: true });
      const decision = await service.evaluate(grantInput);

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe('DENIED_AGE_VERIFICATION_UNAVAILABLE');
    });

    it('never consults welfare or contribution once age verification fails', async () => {
      setup({ verified: false });
      await service.evaluate(grantInput);

      expect(welfare.scoreTransaction).not.toHaveBeenCalled();
      expect(contribution.getProfile).not.toHaveBeenCalled();
    });
  });

  describe('Welfare Guardian Score — grants and burns diverge', () => {
    it('suppresses a grant on SOFT_DECLINE', async () => {
      setup({ welfareAction: 'SOFT_DECLINE' });
      const decision = await service.evaluate(grantInput);

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe('DENIED_WELFARE_SOFT_DECLINE');
    });

    it('still permits a burn on SOFT_DECLINE — redeeming is the healthier action', async () => {
      setup({ welfareAction: 'SOFT_DECLINE' });
      const decision = await service.evaluate(burnInput);

      expect(decision.allowed).toBe(true);
      expect(decision.upliftPermitted).toBe(false);
    });

    it('blocks both grant and burn on HARD_DECLINE', async () => {
      setup({ welfareAction: 'HARD_DECLINE' });

      await expect(service.evaluate(grantInput)).resolves.toMatchObject({ allowed: false });
      await expect(service.evaluate(burnInput)).resolves.toMatchObject({
        allowed: false,
        reasonCode: 'DENIED_WELFARE_HARD_DECLINE',
      });
    });

    it('allows the base offer but withholds uplift on REVIEW, even with proven margin', async () => {
      setup({ welfareAction: 'REVIEW', band: 'HIGH_MARGIN' });
      const decision = await service.evaluate(grantInput);

      expect(decision.allowed).toBe(true);
      expect(decision.upliftPermitted).toBe(false);
      expect(decision.reasonCode).toBe('ELIGIBLE_BASE_ONLY_WELFARE_REVIEW');
    });

    it('denies when the welfare service is unreachable', async () => {
      setup({ welfareThrows: true });
      const decision = await service.evaluate(grantInput);

      expect(decision.allowed).toBe(false);
      expect(decision.reasonCode).toBe('DENIED_WELFARE_UNAVAILABLE');
    });

    it('scores the welfare check against the points actually at stake', async () => {
      setup({});
      await service.evaluate({ ...grantInput, pointsAtStake: 12_345 });

      expect(welfare.scoreTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ amountCzt: 12_345, guestId: 'member-1' }),
      );
    });
  });

  describe('contribution band — uplift must be earned', () => {
    it.each<[ContributionBand, boolean]>([
      ['UNPROVEN', false],
      ['NET_NEGATIVE', false],
      ['NET_POSITIVE', true],
      ['HIGH_MARGIN', true],
    ])('band %s → upliftPermitted %s', async (band, expected) => {
      setup({ band });
      const decision = await service.evaluate(grantInput);

      expect(decision.allowed).toBe(true);
      expect(decision.upliftPermitted).toBe(expected);
    });

    it('still allows the advertised base offer to an unproven member', async () => {
      setup({ band: 'UNPROVEN' });
      const decision = await service.evaluate(grantInput);

      expect(decision.allowed).toBe(true);
      expect(decision.reasonCode).toBe('ELIGIBLE_BASE_ONLY_UNPROVEN_MARGIN');
    });

    it('does not compute a contribution profile for a burn', async () => {
      setup({});
      await service.evaluate(burnInput);
      expect(contribution.getProfile).not.toHaveBeenCalled();
    });
  });

  describe('resolveMultiplier', () => {
    const terms: IMultiplierTerms = {
      multiplier: 2,
      band_multipliers: { NET_POSITIVE: 2.5, HIGH_MARGIN: 3 },
      merchant_id: null,
      event_class: null,
    };

    beforeEach(() => setup({}));

    it('applies the HIGH_MARGIN rung to a high-margin member', () => {
      expect(service.resolveMultiplier(terms, 'HIGH_MARGIN', true)).toEqual({
        multiplier: 3,
        upliftApplied: true,
      });
    });

    it('applies the NET_POSITIVE rung to a net-positive member', () => {
      expect(service.resolveMultiplier(terms, 'NET_POSITIVE', true)).toEqual({
        multiplier: 2.5,
        upliftApplied: true,
      });
    });

    it('falls back to NET_POSITIVE when no HIGH_MARGIN rung is configured', () => {
      const partial: IMultiplierTerms = {
        ...terms,
        band_multipliers: { NET_POSITIVE: 2.5 },
      };
      expect(service.resolveMultiplier(partial, 'HIGH_MARGIN', true)).toEqual({
        multiplier: 2.5,
        upliftApplied: true,
      });
    });

    it('gives an unproven member the base multiplier, never less', () => {
      expect(service.resolveMultiplier(terms, 'UNPROVEN', false)).toEqual({
        multiplier: 2,
        upliftApplied: false,
      });
    });

    it('gives a net-negative member the base multiplier, never a penalty rate', () => {
      expect(service.resolveMultiplier(terms, 'NET_NEGATIVE', false).multiplier).toBe(2);
    });

    it('ignores the ladder entirely when uplift is not permitted', () => {
      expect(service.resolveMultiplier(terms, 'HIGH_MARGIN', false)).toEqual({
        multiplier: 2,
        upliftApplied: false,
      });
    });

    it('ignores a rung that is not actually an uplift', () => {
      const flat: IMultiplierTerms = { ...terms, band_multipliers: { NET_POSITIVE: 2 } };
      expect(service.resolveMultiplier(flat, 'NET_POSITIVE', true)).toEqual({
        multiplier: 2,
        upliftApplied: false,
      });
    });

    it('returns base when the campaign has no ladder at all', () => {
      const plain: IMultiplierTerms = { ...terms, band_multipliers: null };
      expect(service.resolveMultiplier(plain, 'HIGH_MARGIN', true)).toEqual({
        multiplier: 2,
        upliftApplied: false,
      });
    });
  });
});
