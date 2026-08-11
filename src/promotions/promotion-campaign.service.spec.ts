/**
 * PromotionCampaignService specs.
 *
 * These assert the two rules that make a promotion "soft": the mechanic is
 * deterministic and capped, and its economics cannot be rewritten after members
 * have acted on them.
 */

import { BadRequestException } from '@nestjs/common';
import { PromotionCampaignService } from './promotion-campaign.service';
import { PromotionCampaignType, IMultiplierTerms } from '../db/models/promotion-campaign.model';

const mockFindOne = jest.fn();
const mockFind = jest.fn();
const mockCreate = jest.fn();
const mockFindOneAndUpdate = jest.fn();

jest.mock('../db/models/promotion-campaign.model', () => {
  const actual = jest.requireActual('../db/models/promotion-campaign.model');
  return {
    ...actual,
    PromotionCampaignModel: {
      findOne: (...args: unknown[]) => mockFindOne(...args),
      find: (...args: unknown[]) => mockFind(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
    },
  };
});

const baseMultiplierTerms: IMultiplierTerms = {
  multiplier: 2,
  band_multipliers: null,
  merchant_id: null,
  event_class: null,
};

function validCampaign(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: 'redroompleasures',
    campaign_type: 'PURCHASE_MULTIPLIER' as PromotionCampaignType,
    name: 'Double Points Weekend',
    description: 'Earn 2× points on every purchase this weekend.',
    starts_at: new Date('2026-08-15T00:00:00Z'),
    ends_at: new Date('2026-08-18T00:00:00Z'),
    multiplier_terms: baseMultiplierTerms,
    per_member_points_cap: 5_000,
    campaign_points_budget: 500_000,
    reason_code: 'PROMO_LAUNCH',
    created_by: 'ops-admin',
    ...overrides,
  };
}

describe('PromotionCampaignService', () => {
  let service: PromotionCampaignService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PromotionCampaignService();
    mockCreate.mockImplementation((doc: Record<string, unknown>) => Promise.resolve(doc));
  });

  describe('assertSoftPromotionShape — no aggressive mechanics', () => {
    it('rejects a campaign carrying a spin-wheel mechanic', () => {
      expect(() =>
        service.assertSoftPromotionShape(
          validCampaign({
            multiplier_terms: { ...baseMultiplierTerms, spin_wheel: { segments: 8 } },
          }),
        ),
      ).toThrow(/chance-based or pressure mechanic/);
    });

    it.each([
      ['randomized outcomes', { random: true }],
      ['a jackpot pool', { jackpot_points: 10_000 }],
      ['weighted odds', { odds: [0.1, 0.9] }],
      ['a mystery box', { mystery: 'box' }],
      ['artificial urgency', { countdown_pressure: 300 }],
    ])('rejects %s', (_label, extra) => {
      expect(() =>
        service.assertSoftPromotionShape(
          validCampaign({ multiplier_terms: { ...baseMultiplierTerms, ...extra } }),
        ),
      ).toThrow(BadRequestException);
    });

    it('finds a prohibited mechanic nested inside a reward payload', () => {
      expect(() =>
        service.assertSoftPromotionShape({
          campaign_type: 'REDEMPTION_OFFER',
          offer_terms: {
            points_price: 500,
            reward_type: 'FREE_PRODUCT',
            reward_value: { fulfilment: { selection: { randomize: true } } },
            inventory_count: 100,
            max_per_member: 1,
          },
        }),
      ).toThrow(/chance-based or pressure mechanic/);
    });

    it('does not false-positive on legitimate field names', () => {
      expect(() =>
        service.assertSoftPromotionShape(
          validCampaign({
            multiplier_terms: { ...baseMultiplierTerms, brand_name: 'RedRoom', merchant_id: 'rrp' },
          }),
        ),
      ).not.toThrow();
    });

    it('rejects an unsupported campaign type outright', () => {
      expect(() =>
        service.assertSoftPromotionShape(
          validCampaign({ campaign_type: 'SPIN_WHEEL' as PromotionCampaignType }),
        ),
      ).toThrow(/Soft promotions are limited to/);
    });
  });

  describe('assertSoftPromotionShape — liability guardrails', () => {
    it('refuses a granting campaign with no per-member cap', () => {
      expect(() =>
        service.assertSoftPromotionShape(validCampaign({ per_member_points_cap: null })),
      ).toThrow(/uncapped grants are unbounded liability/);
    });

    it('refuses a granting campaign with no budget', () => {
      expect(() =>
        service.assertSoftPromotionShape(validCampaign({ campaign_points_budget: null })),
      ).toThrow(/uncapped grants are unbounded liability/);
    });

    it('refuses a per-member cap that exceeds the whole campaign budget', () => {
      expect(() =>
        service.assertSoftPromotionShape(
          validCampaign({ per_member_points_cap: 10_000, campaign_points_budget: 5_000 }),
        ),
      ).toThrow(/cannot exceed campaign_points_budget/);
    });

    it('does not require granting caps on a pure-burn redemption offer', () => {
      expect(() =>
        service.assertSoftPromotionShape({
          campaign_type: 'REDEMPTION_OFFER',
          offer_terms: {
            points_price: 750,
            reward_type: 'DISCOUNT_CODE',
            reward_value: { discount_pct: 15 },
            inventory_count: null,
            max_per_member: 2,
          },
          per_member_points_cap: null,
          campaign_points_budget: null,
        }),
      ).not.toThrow();
    });

    it('rejects a multiplier of 1 or less as granting nothing', () => {
      expect(() =>
        service.assertSoftPromotionShape(
          validCampaign({ multiplier_terms: { ...baseMultiplierTerms, multiplier: 1 } }),
        ),
      ).toThrow(/must be greater than 1/);
    });
  });

  describe('assertSoftPromotionShape — margin-gated uplift ladder', () => {
    it('accepts a ladder that steps upward', () => {
      expect(() =>
        service.assertSoftPromotionShape(
          validCampaign({
            multiplier_terms: {
              ...baseMultiplierTerms,
              band_multipliers: { NET_POSITIVE: 2.5, HIGH_MARGIN: 3 },
            },
          }),
        ),
      ).not.toThrow();
    });

    it('rejects a band multiplier below the advertised base', () => {
      expect(() =>
        service.assertSoftPromotionShape(
          validCampaign({
            multiplier_terms: {
              ...baseMultiplierTerms,
              band_multipliers: { NET_POSITIVE: 1.5 },
            },
          }),
        ),
      ).toThrow(/greater than or equal to the base multiplier/);
    });

    it('rejects a ladder that decreases as proven contribution improves', () => {
      expect(() =>
        service.assertSoftPromotionShape(
          validCampaign({
            multiplier_terms: {
              ...baseMultiplierTerms,
              band_multipliers: { NET_POSITIVE: 3, HIGH_MARGIN: 2.5 },
            },
          }),
        ),
      ).toThrow(/must not decrease as proven contribution improves/);
    });
  });

  describe('terms/type agreement', () => {
    it('rejects a PROGRESS_BONUS carrying multiplier terms', () => {
      expect(() =>
        service.assertSoftPromotionShape(
          validCampaign({ campaign_type: 'PROGRESS_BONUS' as PromotionCampaignType }),
        ),
      ).toThrow(/requires exactly progress_terms/);
    });

    it('rejects a campaign carrying two terms blocks', () => {
      expect(() =>
        service.assertSoftPromotionShape(
          validCampaign({
            progress_terms: {
              metric: 'SPEND_UNITS',
              threshold: 100,
              bonus_points: 500,
              repeatable: false,
            },
          }),
        ),
      ).toThrow(/requires exactly multiplier_terms/);
    });
  });

  describe('createCampaign', () => {
    it('always opens a campaign as DRAFT, never live on creation', async () => {
      const created = await service.createCampaign(validCampaign());
      expect(created.status).toBe('DRAFT');
      expect(created.activated_at).toBeNull();
    });

    it('starts every counter at zero', async () => {
      const created = await service.createCampaign(validCampaign());
      expect(created.points_granted_to_date).toBe(0);
      expect(created.points_burned_to_date).toBe(0);
      expect(created.offer_claims_to_date).toBe(0);
    });

    it('rejects a window that ends before it starts', async () => {
      await expect(
        service.createCampaign(validCampaign({ ends_at: new Date('2026-08-14T00:00:00Z') })),
      ).rejects.toThrow(/ends_at must be after starts_at/);
    });
  });

  describe('setStatus — lifecycle', () => {
    function stubCampaign(overrides: Record<string, unknown> = {}) {
      const doc = {
        ...validCampaign(),
        campaign_id: 'camp-1',
        status: 'DRAFT',
        activated_at: null,
        ...overrides,
      };
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(doc) });
      mockFindOneAndUpdate.mockReturnValue({
        exec: () => Promise.resolve({ ...doc, status: 'ACTIVE' }),
      });
      return doc;
    }

    it('re-validates the shape on activation', async () => {
      stubCampaign({ per_member_points_cap: null });
      await expect(service.setStatus('camp-1', 'redroompleasures', 'ACTIVE')).rejects.toThrow(
        /unbounded liability/,
      );
    });

    it('treats ENDED as terminal', async () => {
      stubCampaign({ status: 'ENDED' });
      await expect(service.setStatus('camp-1', 'redroompleasures', 'ACTIVE')).rejects.toThrow(
        /Illegal status transition ENDED → ACTIVE/,
      );
    });

    it('refuses to jump DRAFT straight to PAUSED', async () => {
      stubCampaign({ status: 'DRAFT' });
      await expect(service.setStatus('camp-1', 'redroompleasures', 'PAUSED')).rejects.toThrow(
        /Illegal status transition/,
      );
    });

    it('stamps activated_at the first time a campaign goes live', async () => {
      stubCampaign({ status: 'DRAFT' });
      await service.setStatus('camp-1', 'redroompleasures', 'ACTIVE');
      const [, update] = mockFindOneAndUpdate.mock.calls[0];
      expect((update as { $set: Record<string, unknown> }).$set.activated_at).toBeInstanceOf(Date);
    });
  });

  describe('updateCampaign — frozen economics', () => {
    it('refuses to extend a live campaign', async () => {
      mockFindOne.mockReturnValue({
        exec: () =>
          Promise.resolve({
            ...validCampaign(),
            campaign_id: 'camp-1',
            status: 'ACTIVE',
          }),
      });

      await expect(
        service.updateCampaign('camp-1', 'redroompleasures', {
          ends_at: new Date('2026-09-30T00:00:00Z'),
        }),
      ).rejects.toThrow(/cannot be extended/);
    });

    it('allows shortening a live campaign, which only reduces exposure', async () => {
      mockFindOne.mockReturnValue({
        exec: () =>
          Promise.resolve({ ...validCampaign(), campaign_id: 'camp-1', status: 'ACTIVE' }),
      });
      mockFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve({ ok: true }) });

      await expect(
        service.updateCampaign('camp-1', 'redroompleasures', {
          ends_at: new Date('2026-08-16T00:00:00Z'),
        }),
      ).resolves.toBeDefined();
    });

    it('refuses any modification to an ENDED campaign', async () => {
      mockFindOne.mockReturnValue({
        exec: () => Promise.resolve({ ...validCampaign(), campaign_id: 'c', status: 'ENDED' }),
      });

      await expect(
        service.updateCampaign('c', 'redroompleasures', { name: 'Renamed' }),
      ).rejects.toThrow(/ENDED campaign cannot be modified/);
    });
  });
});
