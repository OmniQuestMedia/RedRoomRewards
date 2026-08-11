/**
 * PromotionLiabilityService specs.
 *
 * The report is what tunes the multiplier ladder, so the assertions here are
 * about it being *honest*: burns must show as liability retired, RESERVED
 * grants must not inflate cost, and attributed spend must not be dressed up as
 * proven incremental lift.
 */

import { PromotionLiabilityService } from './promotion-liability.service';

const mockCampaignFind = jest.fn();
const mockCampaignFindOne = jest.fn();

jest.mock('../db/models/promotion-campaign.model', () => {
  const actual = jest.requireActual('../db/models/promotion-campaign.model');
  return {
    ...actual,
    PromotionCampaignModel: {
      find: (...a: unknown[]) => mockCampaignFind(...a),
      findOne: (...a: unknown[]) => mockCampaignFindOne(...a),
    },
  };
});

const mockGrantAggregate = jest.fn();
const mockGrantCount = jest.fn();

jest.mock('../db/models/promotion-grant.model', () => ({
  PromotionGrantModel: {
    aggregate: (...a: unknown[]) => mockGrantAggregate(...a),
    countDocuments: (...a: unknown[]) => mockGrantCount(...a),
  },
}));

const mockValuationFindOne = jest.fn();

jest.mock('../db/models/valuation-config.model', () => ({
  ValuationConfigModel: {
    findOne: (...a: unknown[]) => mockValuationFindOne(...a),
  },
}));

function stubCampaigns(campaigns: unknown[]): void {
  mockCampaignFind.mockReturnValue({
    sort: () => ({ lean: () => ({ exec: () => Promise.resolve(campaigns) }) }),
  });
}

const multiplierCampaign = {
  campaign_id: 'camp-mult',
  name: 'Double Points Weekend',
  campaign_type: 'PURCHASE_MULTIPLIER',
  status: 'ACTIVE',
  starts_at: new Date('2026-08-01T00:00:00Z'),
  ends_at: null,
  multiplier_terms: { multiplier: 2 },
  campaign_points_budget: 100_000,
  points_burned_to_date: 0,
};

const offerCampaign = {
  campaign_id: 'camp-offer',
  name: '£10 off for 800 points',
  campaign_type: 'REDEMPTION_OFFER',
  status: 'ACTIVE',
  starts_at: new Date('2026-08-01T00:00:00Z'),
  ends_at: null,
  multiplier_terms: null,
  campaign_points_budget: null,
  points_burned_to_date: 8_000,
};

describe('PromotionLiabilityService', () => {
  let service: PromotionLiabilityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PromotionLiabilityService();

    mockValuationFindOne.mockReturnValue({
      sort: () => ({ exec: () => Promise.resolve({ cents_per_point: 1 }) }),
    });
    mockCampaignFindOne.mockReturnValue({
      select: () => ({
        lean: () => ({ exec: () => Promise.resolve({ multiplier_terms: { multiplier: 2 } }) }),
      }),
    });
    mockGrantCount.mockReturnValue({ exec: () => Promise.resolve(0) });
    mockGrantAggregate.mockResolvedValue([]);
  });

  it('reports a granting campaign as liability added', async () => {
    stubCampaigns([multiplierCampaign]);
    mockGrantAggregate.mockResolvedValue([
      { _id: null, points: 10_000, spendCents: 500_000, members: ['m1', 'm2'] },
    ]);

    const report = await service.getReport('t1');
    const row = report.campaigns[0];

    expect(row.points_granted).toBe(10_000);
    expect(row.liability_added_cents).toBe(10_000);
    expect(row.net_liability_delta_cents).toBe(10_000);
    expect(row.members_granted).toBe(2);
  });

  it('reports a redemption offer as liability retired, not added', async () => {
    stubCampaigns([offerCampaign]);

    const report = await service.getReport('t1');
    const row = report.campaigns[0];

    expect(row.points_burned).toBe(8_000);
    expect(row.liability_burned_cents).toBe(8_000);
    expect(row.net_liability_delta_cents).toBe(-8_000);
    // A pure-burn campaign has no contribution figure to report.
    expect(row.net_contribution_cents).toBeNull();
  });

  it('computes attributed margin against points cost for a granting campaign', async () => {
    stubCampaigns([multiplierCampaign]);
    mockGrantAggregate.mockResolvedValue([
      { _id: null, points: 10_000, spendCents: 500_000, members: ['m1'] },
    ]);

    const report = await service.getReport('t1');
    const row = report.campaigns[0];

    // 500000c spend @ 35% = 175000c margin; 10000 points @1c = 10000c cost.
    expect(row.attributed_margin_cents).toBe(175_000);
    expect(row.net_contribution_cents).toBe(165_000);
  });

  it('nets grants and burns across the whole tenant', async () => {
    stubCampaigns([multiplierCampaign, offerCampaign]);
    mockGrantAggregate.mockImplementation((pipeline: unknown) => {
      const match = (pipeline as Array<{ $match?: { campaign_id?: string } }>)[0]?.$match;
      if (match?.campaign_id === 'camp-mult') {
        return Promise.resolve([
          { _id: null, points: 10_000, spendCents: 500_000, members: ['m1'] },
        ]);
      }
      return Promise.resolve([]);
    });

    const report = await service.getReport('t1');

    expect(report.totals.points_granted).toBe(10_000);
    expect(report.totals.points_burned).toBe(8_000);
    expect(report.totals.net_liability_delta_cents).toBe(2_000);
  });

  it('reports budget utilisation for a capped campaign', async () => {
    stubCampaigns([multiplierCampaign]);
    mockGrantAggregate.mockResolvedValue([
      { _id: null, points: 25_000, spendCents: 0, members: ['m1'] },
    ]);

    const report = await service.getReport('t1');
    expect(report.campaigns[0].budget_utilisation).toBe(0.25);
  });

  it('leaves budget utilisation null for an uncapped campaign', async () => {
    stubCampaigns([offerCampaign]);
    const report = await service.getReport('t1');
    expect(report.campaigns[0].budget_utilisation).toBeNull();
  });

  it('counts only GRANTED rows so incomplete grants do not inflate liability', async () => {
    stubCampaigns([multiplierCampaign]);
    await service.getReport('t1');

    const pipeline = mockGrantAggregate.mock.calls[0][0] as Array<{
      $match?: Record<string, unknown>;
    }>;
    expect(pipeline[0].$match).toMatchObject({ status: 'GRANTED' });
  });

  it('counts how many grants actually paid an uplift', async () => {
    stubCampaigns([multiplierCampaign]);
    mockGrantAggregate.mockResolvedValue([
      { _id: null, points: 500, spendCents: 0, members: ['m1'] },
    ]);
    mockGrantCount.mockReturnValue({ exec: () => Promise.resolve(7) });

    const report = await service.getReport('t1');
    expect(report.campaigns[0].uplifted_grants).toBe(7);
  });

  it('uses the tenant point valuation to cost liability', async () => {
    mockValuationFindOne.mockReturnValue({
      sort: () => ({ exec: () => Promise.resolve({ cents_per_point: 3 }) }),
    });
    stubCampaigns([multiplierCampaign]);
    mockGrantAggregate.mockResolvedValue([
      { _id: null, points: 1_000, spendCents: 0, members: ['m1'] },
    ]);

    const report = await service.getReport('t1');
    expect(report.cents_per_point).toBe(3);
    expect(report.campaigns[0].liability_added_cents).toBe(3_000);
  });

  it('excludes ENDED campaigns only when explicitly asked', async () => {
    stubCampaigns([]);
    await service.getReport('t1', { includeEnded: false });

    expect(mockCampaignFind).toHaveBeenCalledWith(
      expect.objectContaining({ status: { $ne: 'ENDED' } }),
    );
  });

  it('includes ENDED campaigns by default — a finished cost is still a cost', async () => {
    stubCampaigns([]);
    await service.getReport('t1');

    const query = mockCampaignFind.mock.calls[0][0] as Record<string, unknown>;
    expect(query.status).toBeUndefined();
  });

  it('never presents attributed spend as proven incremental lift', async () => {
    stubCampaigns([multiplierCampaign]);
    mockGrantAggregate.mockResolvedValue([
      { _id: null, points: 100, spendCents: 100_000, members: ['m1'] },
    ]);

    const report = await service.getReport('t1');
    expect(report.summary).toMatch(/not proven incremental/);
  });
});
