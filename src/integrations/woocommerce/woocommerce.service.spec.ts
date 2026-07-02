import { WooCommerceService, loadWooCommerceConfig } from './woocommerce.service';
import { LedgerService } from '../../ledger/ledger.service';

jest.mock('../../db/models/loyalty-account.model', () => ({
  LoyaltyAccountModel: {
    findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(null) }) }),
    findOneAndUpdate: jest
      .fn()
      .mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(null) }) }),
    create: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../db/models/earn-rate-config.model', () => ({
  EarnRateConfigModel: {
    findOne: jest.fn(),
  },
}));

const { EarnRateConfigModel } = jest.requireMock('../../db/models/earn-rate-config.model') as {
  EarnRateConfigModel: { findOne: jest.Mock };
};

/**
 * Wire EarnRateConfigModel.findOne(...).sort(...).lean().exec() to resolve the
 * given active config row (or null for "no active config").
 */
function mockActiveEarnRate(
  row: { base_points_per_unit: number; inferno_multiplier: number } | null,
) {
  EarnRateConfigModel.findOne.mockReturnValue({
    sort: () => ({ lean: () => ({ exec: () => Promise.resolve(row) }) }),
  });
}

const TEST_CONFIG = { tenantId: 'redroompleasures', merchantId: 'redroompleasures' };

describe('WooCommerceService', () => {
  let service: WooCommerceService;
  let ledger: jest.Mocked<LedgerService>;

  beforeEach(() => {
    // Clear call history between tests (keeps factory mock implementations).
    jest.clearAllMocks();
    ledger = {
      creditPoints: jest.fn().mockResolvedValue(true),
      deductPoints: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<LedgerService>;
    service = new WooCommerceService(ledger, TEST_CONFIG);
    // Default: active config at the canonical rate 1 (base 1 × inferno 1).
    mockActiveEarnRate({ base_points_per_unit: 1, inferno_multiplier: 1 });
  });

  describe('loadWooCommerceConfig', () => {
    it('reads tenant/merchant from the environment', () => {
      const cfg = loadWooCommerceConfig({
        WOOCOMMERCE_TENANT_ID: 'redroompleasures',
        WOOCOMMERCE_MERCHANT_ID: 'store-1',
      } as NodeJS.ProcessEnv);
      expect(cfg).toEqual({ tenantId: 'redroompleasures', merchantId: 'store-1' });
    });

    it('defaults merchantId to tenantId when unset', () => {
      const cfg = loadWooCommerceConfig({
        WOOCOMMERCE_TENANT_ID: 'redroompleasures',
      } as NodeJS.ProcessEnv);
      expect(cfg).toEqual({ tenantId: 'redroompleasures', merchantId: 'redroompleasures' });
    });

    it('yields empty strings when nothing is configured', () => {
      const cfg = loadWooCommerceConfig({} as NodeJS.ProcessEnv);
      expect(cfg).toEqual({ tenantId: '', merchantId: '' });
    });
  });

  describe('calculatePointsForOrder', () => {
    it('returns floor of (total - shipping) * rate', () => {
      expect(service.calculatePointsForOrder(99.99, 9.99, 1)).toBe(90);
    });

    it('applies a non-unit rate', () => {
      expect(service.calculatePointsForOrder(100, 0, 2)).toBe(200);
      expect(service.calculatePointsForOrder(100, 0, 0.5)).toBe(50);
    });

    it('returns 0 when shipping >= total', () => {
      expect(service.calculatePointsForOrder(5, 10, 1)).toBe(0);
    });

    it('returns 0 at a zero rate', () => {
      expect(service.calculatePointsForOrder(100, 0, 0)).toBe(0);
    });

    it('floors fractional points', () => {
      expect(service.calculatePointsForOrder(10.75, 0, 1)).toBe(10);
    });
  });

  describe('SAFE-SWAP — config-driven rate preserves legacy behaviour', () => {
    // Pre-refactor the rate was a hard-coded POINTS_PER_DOLLAR = 1. A
    // redroompleasures config seeded at base 1 × inferno 1 must yield the
    // IDENTICAL result, so no tenant's effective rate changes.
    it('credits 90 pts for the canonical 99.99/9.99 order at rate 1', async () => {
      mockActiveEarnRate({ base_points_per_unit: 1, inferno_multiplier: 1 });
      await service.processOrderCompleted({
        id: 7001,
        number: '7001',
        status: 'completed',
        total: '99.99',
        shipping_total: '9.99',
        billing: { email: 'safe-swap@example.com' },
      });
      expect(ledger.creditPoints).toHaveBeenCalledWith(
        expect.any(String),
        90,
        'WOOCOMMERCE_ORDER',
        expect.stringContaining('7001'),
        'wc-order-7001',
      );
    });

    it('scopes the earn-rate lookup to the configured tenant/merchant', async () => {
      await service.processOrderCompleted({
        id: 7002,
        number: '7002',
        status: 'completed',
        total: '100.00',
        shipping_total: '0.00',
        billing: { email: 'scope@example.com' },
      });
      expect(EarnRateConfigModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: { $eq: 'redroompleasures' },
          merchant_id: { $eq: 'redroompleasures' },
          event_class: { $eq: 'PURCHASE' },
          superseded_at: null,
        }),
      );
    });
  });

  describe('processOrderCompleted', () => {
    it('credits points for a valid order using the resolved rate', async () => {
      await service.processOrderCompleted({
        id: 1001,
        number: '1001',
        status: 'completed',
        total: '100.00',
        shipping_total: '10.00',
        billing: { email: 'test@example.com' },
      });
      expect(ledger.creditPoints).toHaveBeenCalledWith(
        expect.any(String),
        90,
        'WOOCOMMERCE_ORDER',
        expect.stringContaining('1001'),
        'wc-order-1001',
      );
    });

    it('applies a non-unit earn rate from config (base 2 × inferno 1)', async () => {
      mockActiveEarnRate({ base_points_per_unit: 2, inferno_multiplier: 1 });
      await service.processOrderCompleted({
        id: 1006,
        number: '1006',
        status: 'completed',
        total: '50.00',
        shipping_total: '0.00',
        billing: { email: 'rate2@example.com' },
      });
      expect(ledger.creditPoints).toHaveBeenCalledWith(
        expect.any(String),
        100,
        'WOOCOMMERCE_ORDER',
        expect.any(String),
        'wc-order-1006',
      );
    });

    it('applies the inferno multiplier (base 1 × inferno 1.5)', async () => {
      mockActiveEarnRate({ base_points_per_unit: 1, inferno_multiplier: 1.5 });
      await service.processOrderCompleted({
        id: 1007,
        number: '1007',
        status: 'completed',
        total: '100.00',
        shipping_total: '0.00',
        billing: { email: 'inferno@example.com' },
      });
      expect(ledger.creditPoints).toHaveBeenCalledWith(
        expect.any(String),
        150,
        'WOOCOMMERCE_ORDER',
        expect.any(String),
        'wc-order-1007',
      );
    });

    it('skips order with no billing email (no rate lookup)', async () => {
      await service.processOrderCompleted({
        id: 1002,
        number: '1002',
        status: 'completed',
        total: '100.00',
        shipping_total: '0.00',
        billing: { email: '' },
      });
      expect(ledger.creditPoints).not.toHaveBeenCalled();
      expect(EarnRateConfigModel.findOne).not.toHaveBeenCalled();
    });

    it('skips order with zero calculated points', async () => {
      await service.processOrderCompleted({
        id: 1003,
        number: '1003',
        status: 'completed',
        total: '5.00',
        shipping_total: '10.00',
        billing: { email: 'test@example.com' },
      });
      expect(ledger.creditPoints).not.toHaveBeenCalled();
    });
  });

  describe('fail-closed — no active config / unconfigured', () => {
    it('throws and does not credit when no active earn-rate config exists', async () => {
      mockActiveEarnRate(null);
      await expect(
        service.processOrderCompleted({
          id: 1100,
          number: '1100',
          status: 'completed',
          total: '100.00',
          shipping_total: '0.00',
          billing: { email: 'noconfig@example.com' },
        }),
      ).rejects.toThrow(/No active earn-rate config/);
      expect(ledger.creditPoints).not.toHaveBeenCalled();
    });

    it('throws when the integration has no tenant configured', async () => {
      const unconfigured = new WooCommerceService(ledger, { tenantId: '', merchantId: '' });
      await expect(
        unconfigured.processOrderCompleted({
          id: 1101,
          number: '1101',
          status: 'completed',
          total: '100.00',
          shipping_total: '0.00',
          billing: { email: 'unconfigured@example.com' },
        }),
      ).rejects.toThrow(/WOOCOMMERCE_TENANT_ID/);
      expect(ledger.creditPoints).not.toHaveBeenCalled();
    });
  });

  describe('processOrderCompleted — edge cases', () => {
    it('skips order with non-finite totals (no rate lookup)', async () => {
      await service.processOrderCompleted({
        id: 1004,
        number: '1004',
        status: 'completed',
        total: 'NaN',
        shipping_total: '0.00',
        billing: { email: 'test@example.com' },
      });
      expect(ledger.creditPoints).not.toHaveBeenCalled();
      expect(EarnRateConfigModel.findOne).not.toHaveBeenCalled();
    });

    it('treats undefined total as 0 (null-coalescing branch)', async () => {
      await service.processOrderCompleted({
        id: 1005,
        number: '1005',
        status: 'completed',
        total: undefined as unknown as string,
        shipping_total: undefined as unknown as string,
        billing: { email: 'test@example.com' },
      });
      expect(ledger.creditPoints).not.toHaveBeenCalled();
    });
  });

  describe('processOrderRefunded — edge cases', () => {
    it('skips refund with no billing email', async () => {
      await service.processOrderRefunded({
        id: 2002,
        number: '2002',
        status: 'refunded',
        total: '50.00',
        shipping_total: '0.00',
        billing: { email: '' },
      });
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('skips refund with non-finite totals', async () => {
      await service.processOrderRefunded({
        id: 2003,
        number: '2003',
        status: 'refunded',
        total: 'Infinity',
        shipping_total: '0.00',
        billing: { email: 'test@example.com' },
      });
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('skips refund with zero calculated points', async () => {
      await service.processOrderRefunded({
        id: 2004,
        number: '2004',
        status: 'refunded',
        total: '5.00',
        shipping_total: '10.00',
        billing: { email: 'test@example.com' },
      });
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('treats undefined total as 0 (null-coalescing branch)', async () => {
      await service.processOrderRefunded({
        id: 2005,
        number: '2005',
        status: 'refunded',
        total: undefined as unknown as string,
        shipping_total: undefined as unknown as string,
        billing: { email: 'test@example.com' },
      });
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });
  });

  describe('findOrCreateMember — existing member', () => {
    it('returns existing account_id when member already exists', async () => {
      const { LoyaltyAccountModel } = jest.requireMock('../../db/models/loyalty-account.model') as {
        LoyaltyAccountModel: { findOneAndUpdate: jest.Mock };
      };
      LoyaltyAccountModel.findOneAndUpdate.mockReturnValueOnce({
        lean: () => ({ exec: () => Promise.resolve({ account_id: 'existing-acct-id' }) }),
      });

      await service.processOrderCompleted({
        id: 9001,
        number: '9001',
        status: 'completed',
        total: '100.00',
        shipping_total: '0.00',
        billing: { email: 'existing@example.com' },
      });

      expect(ledger.creditPoints).toHaveBeenCalledWith(
        'existing-acct-id',
        expect.any(Number),
        'WOOCOMMERCE_ORDER',
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('processOrderRefunded', () => {
    it('deducts points for a refunded order using the resolved rate', async () => {
      await service.processOrderRefunded({
        id: 2001,
        number: '2001',
        status: 'refunded',
        total: '50.00',
        shipping_total: '0.00',
        billing: { email: 'test@example.com' },
      });
      expect(ledger.deductPoints).toHaveBeenCalledWith(
        expect.any(String),
        50,
        'WOOCOMMERCE_REFUND',
        expect.stringContaining('2001'),
        'wc-refund-2001',
      );
    });
  });
});
