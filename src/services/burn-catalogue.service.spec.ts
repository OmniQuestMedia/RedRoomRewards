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
        service.redeemItem('member-1', 'item-missing', 'redroompleasures'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when inventory is 0', async () => {
      mockFindOne.mockReturnValue({
        exec: () => Promise.resolve({ ...mockItemBase, inventory_count: 0 }),
      });
      // Atomic decrement finds no document matching inventory_count > 0
      mockFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });

      await expect(service.redeemItem('member-1', 'item-001', 'redroompleasures')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('credits ledger deduction and creates redemption record on success', async () => {
      mockFindOne.mockReturnValue({
        exec: () => Promise.resolve({ ...mockItemBase }),
      });
      mockUpdateOne.mockReturnValue({ exec: () => Promise.resolve({}) });
      mockCreate.mockResolvedValue({});

      const result = await service.redeemItem('member-1', 'item-001', 'redroompleasures');

      expect(ledger.deductPoints).toHaveBeenCalledWith(
        'member-1',
        500,
        'CATALOGUE_REDEEM',
        expect.stringContaining('item-001'),
        expect.stringContaining('redeem-'),
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

      await expect(service.redeemItem('member-1', 'item-001', 'redroompleasures')).rejects.toThrow(
        BadRequestException,
      );
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
