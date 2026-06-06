import { WooCommerceService } from './woocommerce.service';
import { LedgerService } from '../../ledger/ledger.service';

jest.mock('../../db/models/loyalty-account.model', () => ({
  LoyaltyAccountModel: {
    findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(null) }) }),
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
