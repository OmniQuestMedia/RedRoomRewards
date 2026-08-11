/**
 * MemberContributionService specs.
 *
 * The banding rules decide who gets a higher multiplier, so the tests that
 * matter most are the ones proving a member is NOT promoted on thin evidence.
 */

import { MemberContributionService, readSpendCents } from './member-contribution.service';
import { TransactionType, TransactionReason } from '../wallets/types';

const mockLedgerFind = jest.fn();
const mockValuationFindOne = jest.fn();

jest.mock('../db/models/ledger-entry.model', () => ({
  LedgerEntryModel: {
    find: (...args: unknown[]) => mockLedgerFind(...args),
  },
}));

jest.mock('../db/models/valuation-config.model', () => ({
  ValuationConfigModel: {
    findOne: (...args: unknown[]) => mockValuationFindOne(...args),
  },
}));

interface StubEntry {
  type: TransactionType;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

function stubLedger(entries: StubEntry[]): void {
  mockLedgerFind.mockReturnValue({
    select: () => ({
      lean: () => ({ exec: () => Promise.resolve(entries) }),
    }),
  });
}

function stubValuation(centsPerPoint: number | null): void {
  mockValuationFindOne.mockReturnValue({
    sort: () => ({
      exec: () =>
        Promise.resolve(centsPerPoint === null ? null : { cents_per_point: centsPerPoint }),
    }),
  });
}

/**
 * A purchase credit carrying attributable spend. Uses the generic
 * PROMOTIONAL_AWARD reason on purpose — that is the `creditPoints` default the
 * real earn paths write, and spend evidence must win over the reason code.
 */
function purchase(points: number, spendCents: number): StubEntry {
  return {
    type: TransactionType.CREDIT,
    amount: points,
    reason: TransactionReason.PROMOTIONAL_AWARD,
    metadata: { spend_cents: spendCents },
  };
}

describe('MemberContributionService', () => {
  let service: MemberContributionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MemberContributionService();
    stubValuation(1);
  });

  describe('evidence thresholds — unknown is never promoted', () => {
    it('bands a member with no history at all as UNPROVEN', async () => {
      stubLedger([]);
      const profile = await service.getProfile('t1', 'm1');

      expect(profile.band).toBe('UNPROVEN');
      expect(profile.points_granted_lifetime).toBe(0);
    });

    it('bands a member with too few attributable purchases as UNPROVEN', async () => {
      stubLedger([purchase(100, 20_000), purchase(100, 20_000)]);
      const profile = await service.getProfile('t1', 'm1');

      expect(profile.band).toBe('UNPROVEN');
      expect(profile.band_reason).toMatch(/attributable purchase/);
    });

    it('bands a member as UNPROVEN when a big spender is a single purchase', async () => {
      stubLedger([purchase(100, 1_000_000)]);
      const profile = await service.getProfile('t1', 'm1');
      expect(profile.band).toBe('UNPROVEN');
    });

    it('bands a member as UNPROVEN when most purchase credits lack spend data', async () => {
      stubLedger([
        purchase(100, 30_000),
        purchase(100, 30_000),
        purchase(100, 30_000),
        { type: TransactionType.CREDIT, amount: 100, reason: 'purchase_earn' },
        { type: TransactionType.CREDIT, amount: 100, reason: 'purchase_earn' },
        { type: TransactionType.CREDIT, amount: 100, reason: 'purchase_earn' },
        { type: TransactionType.CREDIT, amount: 100, reason: 'purchase_earn' },
      ]);
      const profile = await service.getProfile('t1', 'm1');

      expect(profile.band).toBe('UNPROVEN');
      expect(profile.band_reason).toMatch(/attributable spend.*Margin cannot be shown/s);
    });

    it('treats a generic PROMOTIONAL_AWARD with no spend as an evidence gap, not a free bonus', async () => {
      // PROMOTIONAL_AWARD is the creditPoints default, so it can be a real
      // purchase earn. Without spend metadata it must lower coverage rather
      // than be waved through as a known zero-spend bonus.
      stubLedger([
        purchase(100, 30_000),
        { type: TransactionType.CREDIT, amount: 100, reason: TransactionReason.PROMOTIONAL_AWARD },
        { type: TransactionType.CREDIT, amount: 100, reason: TransactionReason.PROMOTIONAL_AWARD },
        { type: TransactionType.CREDIT, amount: 100, reason: TransactionReason.PROMOTIONAL_AWARD },
      ]);
      const profile = await service.getProfile('t1', 'm1');

      expect(profile.unattributed_credit_count).toBe(3);
      expect(profile.bonus_issuance_count).toBe(0);
      expect(profile.band).toBe('UNPROVEN');
    });

    it('attributes spend even when the credit carries a generic reason code', async () => {
      stubLedger([purchase(100, 30_000), purchase(100, 30_000), purchase(100, 30_000)]);
      const profile = await service.getProfile('t1', 'm1');

      expect(profile.attributed_purchase_count).toBe(3);
      expect(profile.attributed_spend_cents).toBe(90_000);
      expect(profile.attribution_coverage).toBe(1);
    });
  });

  describe('margin arithmetic', () => {
    it('bands a member whose margin comfortably exceeds points cost as HIGH_MARGIN', async () => {
      // 4 purchases × £100 = 40000c spend → 14000c margin @35%.
      // 400 points issued @1c = 400c cost. Ratio ≈ 34×.
      stubLedger([
        purchase(100, 10_000),
        purchase(100, 10_000),
        purchase(100, 10_000),
        purchase(100, 10_000),
      ]);
      const profile = await service.getProfile('t1', 'm1');

      expect(profile.band).toBe('HIGH_MARGIN');
      expect(profile.gross_margin_cents).toBe(14_000);
      expect(profile.points_cost_cents).toBe(400);
      expect(profile.net_contribution_cents).toBe(13_600);
    });

    it('bands a member as NET_NEGATIVE when points cost outruns margin', async () => {
      // 3 × £30 = 9000c spend → 3150c margin. 5000 points @1c = 5000c cost.
      stubLedger([
        purchase(1_000, 3_000),
        purchase(1_000, 3_000),
        purchase(1_000, 3_000),
        {
          type: TransactionType.CREDIT,
          amount: 2_000,
          reason: TransactionReason.PROMOTION_MULTIPLIER_BONUS,
        },
      ]);
      const profile = await service.getProfile('t1', 'm1');

      expect(profile.band).toBe('NET_NEGATIVE');
      expect(profile.net_contribution_cents).toBeLessThan(0);
    });

    it('charges bonus points to the member as cost with no offsetting spend', async () => {
      stubLedger([
        purchase(100, 10_000),
        purchase(100, 10_000),
        purchase(100, 10_000),
        {
          type: TransactionType.CREDIT,
          amount: 900,
          reason: TransactionReason.PROMOTION_MULTIPLIER_BONUS,
        },
      ]);
      const profile = await service.getProfile('t1', 'm1');

      // 300 base + 900 bonus = 1200 points of cost.
      expect(profile.points_granted_lifetime).toBe(1_200);
      expect(profile.points_cost_cents).toBe(1_200);
      // Bonus issuances do not count as an attribution gap.
      expect(profile.bonus_issuance_count).toBe(1);
      expect(profile.attribution_coverage).toBe(1);
    });

    it('does not count a refund of the member’s own points as new issuance', async () => {
      stubLedger([
        purchase(100, 10_000),
        purchase(100, 10_000),
        purchase(100, 10_000),
        {
          type: TransactionType.CREDIT,
          amount: 500,
          reason: TransactionReason.PROMOTION_OFFER_REVERSAL,
        },
      ]);
      const profile = await service.getProfile('t1', 'm1');

      expect(profile.points_granted_lifetime).toBe(300);
    });

    it('counts debits as burned points and reports outstanding liability', async () => {
      stubLedger([
        purchase(1_000, 10_000),
        purchase(1_000, 10_000),
        purchase(1_000, 10_000),
        {
          type: TransactionType.DEBIT,
          amount: -800,
          reason: TransactionReason.PROMOTION_OFFER_REDEMPTION,
        },
      ]);
      const profile = await service.getProfile('t1', 'm1');

      expect(profile.points_burned_lifetime).toBe(800);
      expect(profile.points_outstanding).toBe(2_200);
    });

    it('uses the tenant valuation config to cost points', async () => {
      stubValuation(5);
      stubLedger([purchase(100, 10_000), purchase(100, 10_000), purchase(100, 10_000)]);
      const profile = await service.getProfile('t1', 'm1');

      expect(profile.cents_per_point).toBe(5);
      expect(profile.points_cost_cents).toBe(1_500);
    });

    it('bands as UNPROVEN when spend exists but no points were ever issued', async () => {
      stubLedger([
        {
          type: TransactionType.CREDIT,
          amount: 0,
          reason: 'purchase_earn',
          metadata: { spend_cents: 20_000 },
        },
        {
          type: TransactionType.CREDIT,
          amount: 0,
          reason: 'purchase_earn',
          metadata: { spend_cents: 20_000 },
        },
        {
          type: TransactionType.CREDIT,
          amount: 0,
          reason: 'purchase_earn',
          metadata: { spend_cents: 20_000 },
        },
      ]);
      const profile = await service.getProfile('t1', 'm1');

      expect(profile.band).toBe('UNPROVEN');
      expect(profile.band_reason).toMatch(/No points issued/);
    });
  });

  describe('tenant scoping', () => {
    it('scopes the ledger read to the tenant and member', async () => {
      stubLedger([]);
      await service.getProfile('tenant-abc', 'member-xyz');

      expect(mockLedgerFind).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: { $eq: 'tenant-abc' },
          accountId: { $eq: 'member-xyz' },
        }),
      );
    });
  });
});

describe('readSpendCents', () => {
  it('reads the canonical spend_cents field', () => {
    expect(readSpendCents({ spend_cents: 1_234 })).toBe(1_234);
  });

  it('reads the camelCase variant emitted by existing earn paths', () => {
    expect(readSpendCents({ spendCents: 900 })).toBe(900);
  });

  it('converts major-unit spend amounts to cents', () => {
    expect(readSpendCents({ spend_amount: 12.5 })).toBe(1_250);
  });

  it('treats a missing value as absent evidence, not zero spend', () => {
    expect(readSpendCents({})).toBeNull();
    expect(readSpendCents(null)).toBeNull();
    expect(readSpendCents(undefined)).toBeNull();
  });

  it('treats a malformed value as absent rather than coercing it', () => {
    expect(readSpendCents({ spend_cents: 'lots' })).toBeNull();
    expect(readSpendCents({ spend_cents: Number.NaN })).toBeNull();
    expect(readSpendCents({ spend_cents: -50 })).toBeNull();
  });
});
