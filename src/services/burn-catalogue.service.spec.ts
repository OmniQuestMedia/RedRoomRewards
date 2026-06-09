import { BurnCatalogueService } from './burn-catalogue.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const mockItemBase = {
  item_id: 'item-001',
  tenant_id: 'redroompleasures',
  title: '10% Off Coupon',
  description: 'Get 10% off your next order',
  points_cost: 500,
  inventory_count: null,
  is_active: true,
  valid_from: null,
  valid_until: null,
  redemption_type: 'DISCOUNT_CODE' as const,
  redemption_value: { discount_pct: 10 },
  correlation_id: 'corr-001',
};

const mockFindOne = jest.fn();
const mockFind = jest.fn();
const mockCountDocuments = jest.fn();
const mockCreate = jest.fn();
const mockUpdateOne = jest.fn();
const mockFindOneAndUpdate = jest.fn();
jest.mock('../db/models/burn-catalogue-item.model', () => ({
  BurnCatalogueItemModel: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    find: (...args: unknown[]) => mockFind(...args),
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));

jest.mock('../db/models/burn-redemption.model', () => ({
  BurnRedemptionModel: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    find: (...args: unknown[]) => mockFind(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

describe('BurnCatalogueService', () => {
  let service: BurnCatalogueService;
  let ledger: jest.Mocked<LedgerService>;

  beforeEach(() => {
    jest.clearAllMocks();
    ledger = {
      deductPoints: jest.fn().mockResolvedValue(true),
      creditPoints: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<LedgerService>;
    service = new BurnCatalogueService(ledger);
  });

  describe('listCatalogueItems (smoke)', () => {
    it('exists as a service instance', () => {
      expect(service).toBeDefined();
    });
  });

  describe('redeemItem', () => {
    it('throws NotFoundException when item not found', async () => {
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(null) });

      await expect(
        service.redeemItem('member-1', 'item-missing', 'redroompleasures', 'idem-key-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when inventory is 0', async () => {
      mockFindOne.mockReturnValue({
        exec: () => Promise.resolve({ ...mockItemBase, inventory_count: 0 }),
      });
      // Atomic decrement finds no document matching inventory_count > 0
      mockFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });

      await expect(
        service.redeemItem('member-1', 'item-001', 'redroompleasures', 'idem-key-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('credits ledger deduction and creates redemption record on success', async () => {
      // First call: item lookup; second call: idempotency check (no existing record)
      mockFindOne
        .mockReturnValueOnce({ exec: () => Promise.resolve({ ...mockItemBase }) })
        .mockReturnValueOnce({ exec: () => Promise.resolve(null) });
      mockUpdateOne.mockReturnValue({ exec: () => Promise.resolve({}) });
      mockCreate.mockResolvedValue({});

      const result = await service.redeemItem(
        'member-1',
        'item-001',
        'redroompleasures',
        'idem-key-1',
      );

      expect(ledger.deductPoints).toHaveBeenCalledWith(
        'member-1',
        500,
        'CATALOGUE_REDEEM',
        expect.stringContaining('item-001'),
        'idem-key-1',
      );
      expect(result.pointsSpent).toBe(500);
      expect(result.redemptionCode).toMatch(/^RRR-/);
      expect(result.redemptionId).toBeDefined();
    });

    it('throws BadRequestException when item has expired', async () => {
      const expired = new Date(Date.now() - 1000);
      mockFindOne.mockReturnValue({
        exec: () => Promise.resolve({ ...mockItemBase, valid_until: expired }),
      });

      await expect(
        service.redeemItem('member-1', 'item-001', 'redroompleasures', 'idem-key-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('compensates points and throws when inventory atomic decrement loses a race', async () => {
      mockFindOne.mockReturnValue({
        exec: () => Promise.resolve({ ...mockItemBase, inventory_count: 1 }),
      });
      // Atomic decrement finds no document (race — another request won)
      mockFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });

      await expect(
        service.redeemItem('member-1', 'item-001', 'redroompleasures', 'idem-key-race'),
      ).rejects.toThrow(BadRequestException);

      expect(ledger.creditPoints).toHaveBeenCalledWith(
        'member-1',
        500,
        'CATALOGUE_REDEEM_REVERSAL',
        expect.stringContaining('item-001'),
        'idem-key-race-reversal',
      );
    });

    it('returns existing redemption record on idempotent retry', async () => {
      const existingRedemption = {
        redemption_id: 'existing-id',
        redemption_code: 'RRR-REDR-EXISTING',
        points_spent: 500,
      };
      // First findOne returns the item, second returns the existing redemption
      mockFindOne
        .mockReturnValueOnce({ exec: () => Promise.resolve({ ...mockItemBase }) })
        .mockReturnValueOnce({ exec: () => Promise.resolve(existingRedemption) });
      mockFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve({ inventory_count: 1 }) });

      const result = await service.redeemItem(
        'member-1',
        'item-001',
        'redroompleasures',
        'idem-key-duplicate',
      );

      expect(result.redemptionId).toBe('existing-id');
      expect(result.redemptionCode).toBe('RRR-REDR-EXISTING');
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('createCatalogueItem', () => {
    it('throws BadRequestException for non-integer points_cost', async () => {
      await expect(
        service.createCatalogueItem({
          tenant_id: 'redroompleasures',
          title: 'Test',
          description: 'Test item',
          points_cost: 1.5,
          redemption_type: 'DISCOUNT_CODE',
          redemption_value: {},
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates item with valid input', async () => {
      const created = { ...mockItemBase };
      mockCreate.mockResolvedValue(created);

      const result = await service.createCatalogueItem({
        tenant_id: 'redroompleasures',
        title: '10% Off Coupon',
        description: 'Discount',
        points_cost: 500,
        redemption_type: 'DISCOUNT_CODE',
        redemption_value: { discount_pct: 10 },
      });

      expect(mockCreate).toHaveBeenCalled();
      expect(result.title).toBe('10% Off Coupon');
    });
  });
});
