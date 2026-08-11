/**
 * PromotionEngineService specs.
 *
 * Covers the money-moving paths: that a bonus is capped, granted exactly once,
 * written to the ledger under its own reason code, and rolled back cleanly when
 * the ledger refuses.
 */

import { PromotionEngineService } from './promotion-engine.service';
import { PromotionEligibilityService } from './promotion-eligibility.service';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionReason } from '../wallets/types';
import { IMultiplierTerms } from '../db/models/promotion-campaign.model';

const mockCampaignFind = jest.fn();
const mockCampaignFindOne = jest.fn();
const mockCampaignFindOneAndUpdate = jest.fn();

jest.mock('../db/models/promotion-campaign.model', () => {
  const actual = jest.requireActual('../db/models/promotion-campaign.model');
  return {
    ...actual,
    PromotionCampaignModel: {
      find: (...a: unknown[]) => mockCampaignFind(...a),
      findOne: (...a: unknown[]) => mockCampaignFindOne(...a),
      findOneAndUpdate: (...a: unknown[]) => mockCampaignFindOneAndUpdate(...a),
    },
  };
});

const mockGrantFindOne = jest.fn();
const mockGrantCreate = jest.fn();
const mockGrantAggregate = jest.fn();
const mockGrantDeleteOne = jest.fn();
const mockGrantFindOneAndUpdate = jest.fn();

jest.mock('../db/models/promotion-grant.model', () => ({
  PromotionGrantModel: {
    findOne: (...a: unknown[]) => mockGrantFindOne(...a),
    create: (...a: unknown[]) => mockGrantCreate(...a),
    aggregate: (...a: unknown[]) => mockGrantAggregate(...a),
    deleteOne: (...a: unknown[]) => mockGrantDeleteOne(...a),
    findOneAndUpdate: (...a: unknown[]) => mockGrantFindOneAndUpdate(...a),
    countDocuments: jest.fn(),
  },
}));

const mockProgressFindOne = jest.fn();
const mockProgressFindOneAndUpdate = jest.fn();

jest.mock('../db/models/promotion-progress.model', () => ({
  PromotionProgressModel: {
    findOne: (...a: unknown[]) => mockProgressFindOne(...a),
    findOneAndUpdate: (...a: unknown[]) => mockProgressFindOneAndUpdate(...a),
  },
}));

const mockClaimFindOne = jest.fn();
const mockClaimCreate = jest.fn();
const mockClaimCount = jest.fn();
const mockClaimDeleteOne = jest.fn();
const mockClaimFindOneAndUpdate = jest.fn();

jest.mock('../db/models/promotion-offer-claim.model', () => ({
  PromotionOfferClaimModel: {
    findOne: (...a: unknown[]) => mockClaimFindOne(...a),
    create: (...a: unknown[]) => mockClaimCreate(...a),
    countDocuments: (...a: unknown[]) => mockClaimCount(...a),
    deleteOne: (...a: unknown[]) => mockClaimDeleteOne(...a),
    findOneAndUpdate: (...a: unknown[]) => mockClaimFindOneAndUpdate(...a),
  },
}));

const multiplierTerms: IMultiplierTerms = {
  multiplier: 2,
  band_multipliers: { NET_POSITIVE: 2.5, HIGH_MARGIN: 3 },
  merchant_id: null,
  event_class: null,
};

function multiplierCampaign(overrides: Record<string, unknown> = {}) {
  return {
    campaign_id: 'camp-mult',
    tenant_id: 't1',
    campaign_type: 'PURCHASE_MULTIPLIER',
    status: 'ACTIVE',
    name: 'Double Points Weekend',
    description: '2× points',
    starts_at: new Date('2026-08-01T00:00:00Z'),
    ends_at: null,
    multiplier_terms: multiplierTerms,
    progress_terms: null,
    offer_terms: null,
    per_member_points_cap: 1_000,
    campaign_points_budget: 100_000,
    points_granted_to_date: 0,
    points_burned_to_date: 0,
    offer_claims_to_date: 0,
    ...overrides,
  };
}

function offerCampaign(overrides: Record<string, unknown> = {}) {
  return {
    campaign_id: 'camp-offer',
    tenant_id: 't1',
    campaign_type: 'REDEMPTION_OFFER',
    status: 'ACTIVE',
    name: '£10 off for 800 points',
    description: 'Burn 800 points for £10 off',
    starts_at: new Date('2026-08-01T00:00:00Z'),
    ends_at: null,
    multiplier_terms: null,
    progress_terms: null,
    offer_terms: {
      points_price: 800,
      reward_type: 'DISCOUNT_CODE',
      reward_value: { discount_gbp: 10 },
      inventory_count: 100,
      max_per_member: 1,
    },
    per_member_points_cap: null,
    campaign_points_budget: null,
    points_granted_to_date: 0,
    points_burned_to_date: 0,
    offer_claims_to_date: 0,
    ...overrides,
  };
}

describe('PromotionEngineService', () => {
  let engine: PromotionEngineService;
  let ledger: jest.Mocked<LedgerService>;
  let eligibility: jest.Mocked<PromotionEligibilityService>;

  const realResolve = new PromotionEligibilityService({} as never, {} as never, {} as never)
    .resolveMultiplier;

  beforeEach(() => {
    jest.clearAllMocks();

    ledger = {
      creditPoints: jest.fn().mockResolvedValue(true),
      deductPoints: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<LedgerService>;

    eligibility = {
      evaluate: jest.fn().mockResolvedValue({
        allowed: true,
        upliftPermitted: false,
        reasonCode: 'ELIGIBLE',
        explanation: 'ok',
        band: 'UNPROVEN',
        welfareAction: 'PASS',
        profile: null,
      }),
      resolveMultiplier: jest.fn(realResolve),
    } as unknown as jest.Mocked<PromotionEligibilityService>;

    engine = new PromotionEngineService(ledger, eligibility);

    // Defaults: no prior grants, nothing reserved, all writes succeed.
    mockGrantFindOne.mockReturnValue({ exec: () => Promise.resolve(null) });
    mockGrantAggregate.mockResolvedValue([]);
    mockGrantCreate.mockResolvedValue({});
    mockGrantDeleteOne.mockReturnValue({ exec: () => Promise.resolve({}) });
    mockGrantFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve({}) });
    mockCampaignFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve({ ok: true }) });
    mockClaimCount.mockReturnValue({ exec: () => Promise.resolve(0) });
    mockClaimFindOne.mockReturnValue({ exec: () => Promise.resolve(null) });
    mockClaimCreate.mockResolvedValue({});
    mockClaimDeleteOne.mockReturnValue({ exec: () => Promise.resolve({}) });
    mockClaimFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve({}) });
  });

  function stubLiveCampaigns(campaigns: unknown[]): void {
    mockCampaignFind.mockReturnValue({
      sort: () => ({ exec: () => Promise.resolve(campaigns) }),
    });
  }

  const purchaseInput = {
    tenantId: 't1',
    memberId: 'm1',
    basePoints: 100,
    spendCents: 10_000,
    merchantId: 'rrp',
    purchaseReference: 'order-1',
    idempotencyKey: 'idem-1',
  };

  describe('applyPurchaseBonus — multiplier maths', () => {
    it('grants the base bonus for an unproven member', async () => {
      stubLiveCampaigns([multiplierCampaign()]);
      const result = await engine.applyPurchaseBonus(purchaseInput);

      // 2× on 100 base = 100 bonus.
      expect(result.bonusPoints).toBe(100);
      expect(result.totalPoints).toBe(200);
      expect(result.campaigns[0].upliftApplied).toBe(false);
    });

    it('grants the uplifted bonus to a proven high-margin member', async () => {
      eligibility.evaluate.mockResolvedValue({
        allowed: true,
        upliftPermitted: true,
        reasonCode: 'ELIGIBLE',
        explanation: 'proven',
        band: 'HIGH_MARGIN',
        welfareAction: 'PASS',
        profile: null,
      });
      stubLiveCampaigns([multiplierCampaign()]);

      const result = await engine.applyPurchaseBonus(purchaseInput);

      // 3× on 100 base = 200 bonus.
      expect(result.bonusPoints).toBe(200);
      expect(result.campaigns[0].multiplierApplied).toBe(3);
      expect(result.campaigns[0].upliftApplied).toBe(true);
    });

    it('grants nothing and explains why when eligibility denies', async () => {
      eligibility.evaluate.mockResolvedValue({
        allowed: false,
        upliftPermitted: false,
        reasonCode: 'DENIED_WELFARE_SOFT_DECLINE',
        explanation: 'welfare soft decline',
        band: null,
        welfareAction: 'SOFT_DECLINE',
        profile: null,
      });
      stubLiveCampaigns([multiplierCampaign()]);

      const result = await engine.applyPurchaseBonus(purchaseInput);

      expect(result.bonusPoints).toBe(0);
      expect(result.eligibilityReason).toBe('welfare soft decline');
      expect(ledger.creditPoints).not.toHaveBeenCalled();
    });

    it('returns base points untouched when no campaign is live', async () => {
      stubLiveCampaigns([]);
      const result = await engine.applyPurchaseBonus(purchaseInput);

      expect(result.bonusPoints).toBe(0);
      expect(result.totalPoints).toBe(100);
      expect(eligibility.evaluate).not.toHaveBeenCalled();
    });

    it('skips a campaign restricted to a different merchant', async () => {
      stubLiveCampaigns([
        multiplierCampaign({
          multiplier_terms: { ...multiplierTerms, merchant_id: 'someone-else' },
        }),
      ]);
      const result = await engine.applyPurchaseBonus(purchaseInput);
      expect(result.bonusPoints).toBe(0);
    });

    it('scores welfare against the largest bonus any live campaign could pay', async () => {
      stubLiveCampaigns([multiplierCampaign()]);
      await engine.applyPurchaseBonus(purchaseInput);

      // Best rung is 3× → potential bonus of 200, not the base 100.
      expect(eligibility.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({ pointsAtStake: 200, movement: 'GRANT' }),
      );
    });
  });

  describe('caps and budget', () => {
    it('trims the bonus to the per-member cap', async () => {
      stubLiveCampaigns([multiplierCampaign({ per_member_points_cap: 120 })]);
      // Member already holds 60 points from this campaign → 60 headroom.
      mockGrantAggregate.mockResolvedValue([{ total: 60 }]);

      const result = await engine.applyPurchaseBonus(purchaseInput);

      expect(result.bonusPoints).toBe(60);
      expect(result.campaigns[0].capApplied).toBe('PER_MEMBER');
      expect(result.campaigns[0].bonusPointsUncapped).toBe(100);
    });

    it('grants nothing once the per-member cap is exhausted', async () => {
      stubLiveCampaigns([multiplierCampaign({ per_member_points_cap: 100 })]);
      mockGrantAggregate.mockResolvedValue([{ total: 100 }]);

      const result = await engine.applyPurchaseBonus(purchaseInput);

      expect(result.bonusPoints).toBe(0);
      expect(ledger.creditPoints).not.toHaveBeenCalled();
    });

    it('trims the bonus to the remaining campaign budget', async () => {
      stubLiveCampaigns([
        multiplierCampaign({ campaign_points_budget: 1_000, points_granted_to_date: 970 }),
      ]);

      const result = await engine.applyPurchaseBonus(purchaseInput);

      expect(result.bonusPoints).toBe(30);
      expect(result.campaigns[0].capApplied).toBe('CAMPAIGN_BUDGET');
    });

    it('grants nothing when the atomic budget reservation loses the race', async () => {
      stubLiveCampaigns([multiplierCampaign()]);
      // The conditional $inc matches nothing → budget was taken concurrently.
      mockCampaignFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });

      const result = await engine.applyPurchaseBonus(purchaseInput);

      expect(result.bonusPoints).toBe(0);
      expect(ledger.creditPoints).not.toHaveBeenCalled();
      expect(mockGrantDeleteOne).toHaveBeenCalled();
    });
  });

  describe('idempotency and rollback', () => {
    it('does not re-credit a bonus already granted under the same key', async () => {
      stubLiveCampaigns([multiplierCampaign()]);
      mockGrantFindOne.mockReturnValue({
        exec: () => Promise.resolve({ status: 'GRANTED', bonus_points: 100 }),
      });

      const result = await engine.applyPurchaseBonus(purchaseInput);

      expect(result.bonusPoints).toBe(0);
      expect(ledger.creditPoints).not.toHaveBeenCalled();
    });

    it('grants nothing when a concurrent request wins the idempotency key', async () => {
      stubLiveCampaigns([multiplierCampaign()]);
      mockGrantCreate.mockRejectedValue({ code: 11000 });

      const result = await engine.applyPurchaseBonus(purchaseInput);

      expect(result.bonusPoints).toBe(0);
      expect(ledger.creditPoints).not.toHaveBeenCalled();
    });

    it('rolls the grant row and budget back when the ledger credit fails', async () => {
      stubLiveCampaigns([multiplierCampaign()]);
      ledger.creditPoints.mockRejectedValue(new Error('ledger unavailable'));

      await expect(engine.applyPurchaseBonus(purchaseInput)).rejects.toThrow('ledger unavailable');

      expect(mockGrantDeleteOne).toHaveBeenCalled();
      // Budget decremented back by the reserved amount.
      const rollback = mockCampaignFindOneAndUpdate.mock.calls.find(
        ([, update]) =>
          (update as { $inc?: Record<string, number> })?.$inc?.points_granted_to_date === -100,
      );
      expect(rollback).toBeDefined();
    });
  });

  describe('ledger integration — every grant and burn is recorded', () => {
    it('credits a multiplier bonus under its own reason code', async () => {
      stubLiveCampaigns([multiplierCampaign()]);
      await engine.applyPurchaseBonus(purchaseInput);

      expect(ledger.creditPoints).toHaveBeenCalledWith(
        'm1',
        100,
        'PROMO:camp-mult',
        expect.stringContaining('Double Points Weekend'),
        expect.stringContaining('promo-mult-camp-mult'),
        undefined,
        TransactionReason.PROMOTION_MULTIPLIER_BONUS,
      );
    });

    it('persists the attributed spend on the grant row', async () => {
      stubLiveCampaigns([multiplierCampaign()]);
      await engine.applyPurchaseBonus(purchaseInput);

      expect(mockGrantCreate).toHaveBeenCalledWith(
        expect.objectContaining({ attributed_spend_cents: 10_000, base_points: 100 }),
      );
    });
  });

  describe('claimOffer — the burn path', () => {
    beforeEach(() => {
      mockCampaignFindOne.mockReturnValue({ exec: () => Promise.resolve(offerCampaign()) });
    });

    it('burns points under the promotion redemption reason code', async () => {
      const result = await engine.claimOffer('t1', 'm1', 'camp-offer', 'idem-offer');

      expect(result.pointsBurned).toBe(800);
      expect(ledger.deductPoints).toHaveBeenCalledWith(
        'm1',
        800,
        'PROMO_OFFER:camp-offer',
        expect.any(String),
        expect.stringContaining('promo-offer-camp-offer'),
        undefined,
        TransactionReason.PROMOTION_OFFER_REDEMPTION,
      );
    });

    it('evaluates eligibility as a BURN, not a grant', async () => {
      await engine.claimOffer('t1', 'm1', 'camp-offer', 'idem-offer');

      expect(eligibility.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({ movement: 'BURN', pointsAtStake: 800 }),
      );
    });

    it('refuses a claim when eligibility denies', async () => {
      eligibility.evaluate.mockResolvedValue({
        allowed: false,
        upliftPermitted: false,
        reasonCode: 'DENIED_AGE_VERIFICATION',
        explanation: 'not age verified',
        band: null,
        welfareAction: null,
        profile: null,
      });

      await expect(engine.claimOffer('t1', 'm1', 'camp-offer', 'k')).rejects.toThrow(
        'not age verified',
      );
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('enforces the per-member claim limit', async () => {
      mockClaimCount.mockReturnValue({ exec: () => Promise.resolve(1) });

      await expect(engine.claimOffer('t1', 'm1', 'camp-offer', 'k')).rejects.toThrow(
        /already claimed this offer the maximum/,
      );
    });

    it('refuses to claim an offer that is not live', async () => {
      mockCampaignFindOne.mockReturnValue({
        exec: () => Promise.resolve(offerCampaign({ status: 'PAUSED' })),
      });

      await expect(engine.claimOffer('t1', 'm1', 'camp-offer', 'k')).rejects.toThrow(
        /not currently available/,
      );
    });

    it('refuses when inventory is exhausted, before taking any points', async () => {
      mockCampaignFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });

      await expect(engine.claimOffer('t1', 'm1', 'camp-offer', 'k')).rejects.toThrow(
        /fully claimed/,
      );
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('releases the reserved inventory when the debit fails', async () => {
      ledger.deductPoints.mockRejectedValue(new Error('insufficient balance'));

      await expect(engine.claimOffer('t1', 'm1', 'camp-offer', 'k')).rejects.toThrow(
        'insufficient balance',
      );

      expect(mockClaimDeleteOne).toHaveBeenCalled();
      const release = mockCampaignFindOneAndUpdate.mock.calls.find(
        ([, update]) =>
          (update as { $inc?: Record<string, number> })?.$inc?.offer_claims_to_date === -1,
      );
      expect(release).toBeDefined();
    });

    it('returns the original claim on replay instead of burning twice', async () => {
      mockClaimFindOne.mockReturnValue({
        exec: () =>
          Promise.resolve({
            claim_id: 'claim-1',
            claim_code: 'RRR-T1-ABC',
            campaign_id: 'camp-offer',
            campaign_name: 'offer',
            points_burned: 800,
            reward_type: 'DISCOUNT_CODE',
            reward_value: {},
            status: 'CLAIMED',
          }),
      });

      const result = await engine.claimOffer('t1', 'm1', 'camp-offer', 'idem-offer');

      expect(result.claimId).toBe('claim-1');
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('records the burn against the campaign so liability reporting sees it', async () => {
      await engine.claimOffer('t1', 'm1', 'camp-offer', 'idem-offer');

      const burnUpdate = mockCampaignFindOneAndUpdate.mock.calls.find(
        ([, update]) =>
          (update as { $inc?: Record<string, number> })?.$inc?.points_burned_to_date === 800,
      );
      expect(burnUpdate).toBeDefined();
    });
  });

  describe('recordProgress — progress bars', () => {
    const progressCampaign = {
      campaign_id: 'camp-prog',
      tenant_id: 't1',
      campaign_type: 'PROGRESS_BONUS',
      status: 'ACTIVE',
      name: 'Spend £100, get 500 points',
      description: 'Progress bar',
      starts_at: new Date('2026-08-01T00:00:00Z'),
      ends_at: null,
      multiplier_terms: null,
      progress_terms: {
        metric: 'SPEND_UNITS',
        threshold: 100,
        bonus_points: 500,
        repeatable: false,
      },
      offer_terms: null,
      per_member_points_cap: 500,
      campaign_points_budget: 50_000,
      points_granted_to_date: 0,
      points_burned_to_date: 0,
      offer_claims_to_date: 0,
    };

    function stubProgress(units: number, completions: number): void {
      mockProgressFindOneAndUpdate.mockReturnValue({
        exec: () => Promise.resolve({ progress_units: units, completions, version: 1 }),
      });
      mockProgressFindOne.mockReturnValue({
        lean: () => ({
          exec: () =>
            Promise.resolve({
              progress_units: units,
              completions,
              bonus_points_earned: completions * 500,
            }),
        }),
      });
    }

    it('reports a partial bar without granting anything', async () => {
      stubLiveCampaigns([progressCampaign]);
      stubProgress(40, 0);

      const bars = await engine.recordProgress({
        tenantId: 't1',
        memberId: 'm1',
        units: 40,
        sourceReference: 'order-1',
        idempotencyKey: 'k1',
      });

      expect(bars[0].progressRatio).toBeCloseTo(0.4);
      expect(bars[0].unitsRemaining).toBe(60);
      expect(ledger.creditPoints).not.toHaveBeenCalled();
    });

    it('grants the bonus when the bar completes', async () => {
      stubLiveCampaigns([progressCampaign]);
      stubProgress(100, 0);

      await engine.recordProgress({
        tenantId: 't1',
        memberId: 'm1',
        units: 100,
        sourceReference: 'order-1',
        idempotencyKey: 'k1',
      });

      expect(ledger.creditPoints).toHaveBeenCalledWith(
        'm1',
        500,
        'PROMO:camp-prog',
        expect.any(String),
        expect.stringContaining('promo-prog-camp-prog-m1-0'),
        undefined,
        TransactionReason.PROMOTION_PROGRESS_BONUS,
      );
    });

    it('does not re-grant a non-repeatable bar that is already complete', async () => {
      stubLiveCampaigns([progressCampaign]);
      stubProgress(250, 1);

      await engine.recordProgress({
        tenantId: 't1',
        memberId: 'm1',
        units: 150,
        sourceReference: 'order-2',
        idempotencyKey: 'k2',
      });

      expect(ledger.creditPoints).not.toHaveBeenCalled();
    });

    it('keeps a member’s progress even when the bonus is withheld', async () => {
      eligibility.evaluate.mockResolvedValue({
        allowed: false,
        upliftPermitted: false,
        reasonCode: 'DENIED_WELFARE_SOFT_DECLINE',
        explanation: 'welfare',
        band: null,
        welfareAction: 'SOFT_DECLINE',
        profile: null,
      });
      stubLiveCampaigns([progressCampaign]);
      stubProgress(100, 0);

      const bars = await engine.recordProgress({
        tenantId: 't1',
        memberId: 'm1',
        units: 100,
        sourceReference: 'order-1',
        idempotencyKey: 'k1',
      });

      expect(ledger.creditPoints).not.toHaveBeenCalled();
      expect(bars[0].progressUnits).toBe(100);
    });

    it('clamps the rendered ratio to 1 when progress overshoots', async () => {
      stubLiveCampaigns([progressCampaign]);
      stubProgress(180, 1);

      const bars = await engine.getProgressBars('t1', 'm1');
      expect(bars[0].progressRatio).toBe(1);
    });

    it('rejects non-positive progress units', async () => {
      stubLiveCampaigns([progressCampaign]);
      await expect(
        engine.recordProgress({
          tenantId: 't1',
          memberId: 'm1',
          units: 0,
          sourceReference: 'x',
          idempotencyKey: 'k',
        }),
      ).rejects.toThrow(/units must be a positive number/);
    });
  });
});
