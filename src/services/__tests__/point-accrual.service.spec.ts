/**
 * PointAccrualService — calculateEarnRate Tests (C-001)
 *
 * Verifies EarnRateConfig wiring: active config lookup, base earn math, the
 * per-Standing-tier `rrr_multiplier` bonus (Canon Amendment 2026-08), Diamond
 * Concierge zero-earn enforcement (CEO Decision D3), and error handling for
 * missing config rows.
 */

import { PointAccrualService } from '../point-accrual.service';
import { LedgerService } from '../../ledger/ledger.service';
import { EarnRateConfigModel } from '../../db/models/earn-rate-config.model';
import { TierBenefitConfigModel } from '../../db/models/tier-benefit-config.model';
import { RedRoomTier } from '../../interfaces/redroom-rewards';

jest.mock('../../ledger/ledger.service');
jest.mock('../../db/models/earn-rate-config.model');
jest.mock('../../db/models/tier-benefit-config.model');

const mockSort = jest.fn();
const mockFindOne = jest.fn(() => ({ sort: mockSort }));
(EarnRateConfigModel.findOne as jest.Mock) = mockFindOne;

// Tier benefits card lookup — defaults to "no active card" (bonus 0) unless a
// test overrides it.
const mockTierSort = jest.fn();
const mockTierFindOne = jest.fn(() => ({ sort: mockTierSort }));
(TierBenefitConfigModel.findOne as jest.Mock) = mockTierFindOne;

describe('PointAccrualService — calculateEarnRate (C-001)', () => {
  let service: PointAccrualService;
  let ledgerService: LedgerService;

  const params = {
    tenantId: 'tenant-abc',
    merchantId: 'merchant-xyz',
    merchantTier: 'GOLD',
    eventClass: 'PURCHASE',
    amount: 100,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ledgerService = new LedgerService();
    service = new PointAccrualService(ledgerService);
    mockFindOne.mockReturnValue({ sort: mockSort });
    mockTierFindOne.mockReturnValue({ sort: mockTierSort });
    // Default: no active tier card ⇒ 0 % bonus.
    mockTierSort.mockResolvedValue(null);
  });

  it('returns base_points_per_unit * amount when config is found and no memberTier', async () => {
    mockSort.mockResolvedValue({
      base_points_per_unit: 2,
      diamond_concierge_zero_earn: true,
    });

    const points = await service.calculateEarnRate(
      params.tenantId,
      params.merchantId,
      params.merchantTier,
      params.eventClass,
      params.amount,
    );

    // 2 * 100 = 200 (no tier bonus)
    expect(points).toBe(200);
    // No memberTier ⇒ tier card is never queried.
    expect(TierBenefitConfigModel.findOne).not.toHaveBeenCalled();
  });

  it('queries with correct tenant, merchant, tier, event filters and superseded_at: null', async () => {
    mockSort.mockResolvedValue({
      base_points_per_unit: 1,
      diamond_concierge_zero_earn: false,
    });

    await service.calculateEarnRate(
      params.tenantId,
      params.merchantId,
      params.merchantTier,
      params.eventClass,
      10,
    );

    expect(EarnRateConfigModel.findOne).toHaveBeenCalledWith({
      tenant_id: { $eq: params.tenantId },
      merchant_id: { $eq: params.merchantId },
      merchant_tier: { $eq: params.merchantTier },
      event_class: { $eq: params.eventClass },
      superseded_at: null,
    });
    expect(mockSort).toHaveBeenCalledWith({ effective_at: -1 });
  });

  it('throws when no active earn-rate config exists', async () => {
    mockSort.mockResolvedValue(null);

    await expect(
      service.calculateEarnRate(
        params.tenantId,
        params.merchantId,
        'UNKNOWN_TIER',
        params.eventClass,
        100,
      ),
    ).rejects.toThrow(/No active earn-rate config/);
  });

  it('returns 0 for Diamond Concierge purchase when diamond_concierge_zero_earn is true (CEO D3)', async () => {
    mockSort.mockResolvedValue({
      base_points_per_unit: 5,
      diamond_concierge_zero_earn: true,
    });

    const points = await service.calculateEarnRate(
      params.tenantId,
      params.merchantId,
      params.merchantTier,
      params.eventClass,
      100,
      true, // isDiamondConcierge
    );

    expect(points).toBe(0);
  });

  it('awards base points for Diamond Concierge purchase when diamond_concierge_zero_earn is false', async () => {
    mockSort.mockResolvedValue({
      base_points_per_unit: 3,
      diamond_concierge_zero_earn: false,
    });

    const points = await service.calculateEarnRate(
      params.tenantId,
      params.merchantId,
      params.merchantTier,
      params.eventClass,
      50,
      true, // isDiamondConcierge — override active, so points should still be awarded
    );

    // 3 * 50 = 150 (no tier bonus)
    expect(points).toBe(150);
  });

  it('defaults isDiamondConcierge to false', async () => {
    mockSort.mockResolvedValue({
      base_points_per_unit: 4,
      diamond_concierge_zero_earn: true,
    });

    // No isDiamondConcierge arg — should NOT return 0
    const points = await service.calculateEarnRate(
      params.tenantId,
      params.merchantId,
      params.merchantTier,
      params.eventClass,
      80,
    );

    // 4 * 80 = 320 (no tier bonus)
    expect(points).toBe(320);
  });

  it('applies the per-tier rrr_multiplier bonus as base * (1 + bonus) when memberTier is supplied', async () => {
    mockSort.mockResolvedValue({
      base_points_per_unit: 2,
      diamond_concierge_zero_earn: false,
    });
    // Active REIGN card grants a 50 % bonus.
    mockTierSort.mockResolvedValue({ rrr_multiplier: 0.5 });

    const points = await service.calculateEarnRate(
      params.tenantId,
      params.merchantId,
      params.merchantTier,
      params.eventClass,
      100,
      false,
      RedRoomTier.REIGN,
    );

    // base 2*100=200; bonus 0.5 ⇒ 200 * 1.5 = 300
    expect(points).toBe(300);
    expect(TierBenefitConfigModel.findOne).toHaveBeenCalledWith({
      tenant_id: { $eq: params.tenantId },
      tier: { $eq: RedRoomTier.REIGN },
      superseded_at: null,
    });
  });

  it('applies 0 % bonus (base only) when memberTier is supplied but no active card exists', async () => {
    mockSort.mockResolvedValue({
      base_points_per_unit: 3,
      diamond_concierge_zero_earn: false,
    });
    mockTierSort.mockResolvedValue(null); // no active card

    const points = await service.calculateEarnRate(
      params.tenantId,
      params.merchantId,
      params.merchantTier,
      params.eventClass,
      100,
      false,
      RedRoomTier.DESIRE,
    );

    // base 3*100=300; bonus 0 ⇒ 300
    expect(points).toBe(300);
  });

  it('defaults to 0 % bonus when the active card has rrr_multiplier 0 (CEO default)', async () => {
    mockSort.mockResolvedValue({
      base_points_per_unit: 1,
      diamond_concierge_zero_earn: false,
    });
    mockTierSort.mockResolvedValue({ rrr_multiplier: 0 });

    const points = await service.calculateEarnRate(
      params.tenantId,
      params.merchantId,
      params.merchantTier,
      params.eventClass,
      100,
      false,
      RedRoomTier.PASSION,
    );

    // base 1*100=100; bonus 0 ⇒ 100
    expect(points).toBe(100);
  });
});
