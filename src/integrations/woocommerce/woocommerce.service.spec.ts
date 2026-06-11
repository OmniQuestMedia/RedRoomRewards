import { WooCommerceService } from './woocommerce.service';
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

describe('WooCommerceService', () => {
  let service: WooCommerceService;
  let ledger: jest.Mocked<LedgerService>;

  beforeEach(() => {
    ledger = {
      creditPoints: jest.fn().mockResolvedValue(true),
      deductPoints: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<LedgerService>;
    service = new WooCommerceService(ledger);
  });

  describe('calculatePointsForOrder', () => {
    it('returns floor of (total - shipping) * 1', () => {
      expect(service.calculatePointsForOrder(99.99, 9.99)).toBe(90);
    });

    it('returns 0 when shipping >= total', () => {
      expect(service.calculatePointsForOrder(5, 10)).toBe(0);
    });

    it('floors fractional points', () => {
      expect(service.calculatePointsForOrder(10.75, 0)).toBe(10);
    });
  });

  describe('processOrderCompleted', () => {
    it('credits points for a valid order', async () => {
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

    it('skips order with no billing email', async () => {
      await service.processOrderCompleted({
        id: 1002,
        number: '1002',
        status: 'completed',
        total: '100.00',
        shipping_total: '0.00',
        billing: { email: '' },
      });
      expect(ledger.creditPoints).not.toHaveBeenCalled();
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

  describe('processOrderCompleted — edge cases', () => {
    it('skips order with non-finite totals', async () => {
      await service.processOrderCompleted({
        id: 1004,
        number: '1004',
        status: 'completed',
        total: 'NaN',
        shipping_total: '0.00',
        billing: { email: 'test@example.com' },
      });
      expect(ledger.creditPoints).not.toHaveBeenCalled();
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
    it('deducts points for a refunded order', async () => {
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
