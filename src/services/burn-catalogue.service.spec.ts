import { BurnCatalogueService } from './burn-catalogue.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

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

const mockDeleteOne = jest.fn();
const mockBurnRedemptionFindOneAndUpdate = jest.fn();
jest.mock('../db/models/burn-redemption.model', () => ({
  BurnRedemptionModel: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    find: (...args: unknown[]) => mockFind(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    deleteOne: (...args: unknown[]) => mockDeleteOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockBurnRedemptionFindOneAndUpdate(...args),
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
    // Default: RESERVED→PENDING promotion succeeds
    mockBurnRedemptionFindOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve({}) });
    // Default: deleteOne rollback succeeds
    mockDeleteOne.mockReturnValue({ exec: () => Promise.resolve({}) });
  });

  describe('listCatalogueItems (smoke)', () => {
    it('exists as a service instance', () => {
      expect(service).toBeDefined();
    });
  });

  describe('redeemItem', () => {
    it('throws NotFoundException when item not found', async () => {
      // findOne: idempotency (null); findOne: item lookup (null = not found)
      mockFindOne
        .mockReturnValueOnce({ exec: () => Promise.resolve(null) })
        .mockReturnValueOnce({ exec: () => Promise.resolve(null) });

      await expect(
        service.redeemItem('member-1', 'item-missing', 'redroompleasures', 'idem-key-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when inventory is 0', async () => {
      // findOne: idempotency (null); findOne: item (inventory_count: 0)
      mockFindOne.mockReturnValueOnce({ exec: () => Promise.resolve(null) }).mockReturnValueOnce({
        exec: () => Promise.resolve({ ...mockItemBase, inventory_count: 0 }),
      });

      await expect(
        service.redeemItem('member-1', 'item-001', 'redroompleasures', 'idem-key-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('promotes RESERVED to PENDING after successful deduct (two-phase commit)', async () => {
      mockFindOne
        .mockReturnValueOnce({ exec: () => Promise.resolve(null) })
        .mockReturnValueOnce({ exec: () => Promise.resolve({ ...mockItemBase }) });
      mockCreate.mockResolvedValue({});

      await service.redeemItem('member-1', 'item-001', 'redroompleasures', 'idem-key-promote');

      expect(mockBurnRedemptionFindOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ redemption_id: expect.anything() }),
        { $set: { status: 'PENDING' } },
      );
    });

    it('creates record first then deducts points on success (create-first atomic gate)', async () => {
      // findOne: idempotency guard (null); findOne: item lookup
      mockFindOne
        .mockReturnValueOnce({ exec: () => Promise.resolve(null) })
        .mockReturnValueOnce({ exec: () => Promise.resolve({ ...mockItemBase }) });
      mockCreate.mockResolvedValue({});

      const result = await service.redeemItem(
        'member-1',
        'item-001',
        'redroompleasures',
        'idem-key-1',
      );

      // create is called before deductPoints
      expect(mockCreate).toHaveBeenCalled();
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
      mockFindOne.mockReturnValueOnce({ exec: () => Promise.resolve(null) }).mockReturnValueOnce({
        exec: () => Promise.resolve({ ...mockItemBase, valid_until: expired }),
      });

      await expect(
        service.redeemItem('member-1', 'item-001', 'redroompleasures', 'idem-key-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('compensates points and throws when inventory atomic decrement loses a race', async () => {
      // findOne: idempotency guard (null); findOne: item with inventory
      mockFindOne.mockReturnValueOnce({ exec: () => Promise.resolve(null) }).mockReturnValueOnce({
        exec: () => Promise.resolve({ ...mockItemBase, inventory_count: 1 }),
      });
      mockCreate.mockResolvedValue({});
      mockDeleteOne.mockReturnValue({ exec: () => Promise.resolve({}) });
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
      // Pending record deleted on rollback
      expect(mockDeleteOne).toHaveBeenCalled();
    });

    it('returns winner record when concurrent create hits duplicate-key error', async () => {
      // findOne: idempotency guard (null); findOne: item lookup; findOne: winner lookup
      const winnerRecord = {
        redemption_id: 'winner-id',
        redemption_code: 'RRR-REDR-WINNER',
        points_spent: 500,
        item_title: '10% Off Coupon',
        catalogue_item_id: 'item-001',
      };
      mockFindOne
        .mockReturnValueOnce({ exec: () => Promise.resolve(null) })
        .mockReturnValueOnce({ exec: () => Promise.resolve({ ...mockItemBase }) })
        .mockReturnValueOnce({ exec: () => Promise.resolve(winnerRecord) });
      const dupErr = Object.assign(new Error('E11000'), { code: 11000 });
      mockCreate.mockRejectedValue(dupErr);

      const result = await service.redeemItem(
        'member-1',
        'item-001',
        'redroompleasures',
        'idem-key-concurrent',
      );

      expect(result.redemptionId).toBe('winner-id');
      expect(result.itemTitle).toBe('10% Off Coupon');
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('throws ConflictException when E11000 winner slot is still RESERVED (concurrent in-progress)', async () => {
      const reservedWinner = {
        redemption_id: 'winner-reserved-id',
        redemption_code: 'RRR-REDR-WINNER',
        points_spent: 500,
        item_title: '10% Off Coupon',
        catalogue_item_id: 'item-001',
        status: 'RESERVED',
      };
      mockFindOne
        .mockReturnValueOnce({ exec: () => Promise.resolve(null) })
        .mockReturnValueOnce({ exec: () => Promise.resolve({ ...mockItemBase }) })
        .mockReturnValueOnce({ exec: () => Promise.resolve(reservedWinner) });
      const dupErr = Object.assign(new Error('E11000'), { code: 11000 });
      mockCreate.mockRejectedValue(dupErr);

      await expect(
        service.redeemItem(
          'member-1',
          'item-001',
          'redroompleasures',
          'idem-key-concurrent-reserved',
        ),
      ).rejects.toThrow(ConflictException);
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when E11000 winner has a different catalogue_item_id', async () => {
      // Winner slot was created for item-999, but this request is for item-001
      const winnerRecord = {
        redemption_id: 'winner-id',
        redemption_code: 'RRR-REDR-WINNER',
        points_spent: 500,
        item_title: 'Some Other Item',
        catalogue_item_id: 'item-999',
      };
      mockFindOne
        .mockReturnValueOnce({ exec: () => Promise.resolve(null) })
        .mockReturnValueOnce({ exec: () => Promise.resolve({ ...mockItemBase }) })
        .mockReturnValueOnce({ exec: () => Promise.resolve(winnerRecord) });
      const dupErr = Object.assign(new Error('E11000'), { code: 11000 });
      mockCreate.mockRejectedValue(dupErr);

      await expect(
        service.redeemItem('member-1', 'item-001', 'redroompleasures', 'idem-key-concurrent'),
      ).rejects.toThrow(BadRequestException);
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('returns existing redemption record on idempotent retry without side effects', async () => {
      const existingRedemption = {
        redemption_id: 'existing-id',
        redemption_code: 'RRR-REDR-EXISTING',
        points_spent: 500,
        catalogue_item_id: 'item-001',
        item_title: '10% Off Coupon',
      };
      // Idempotency guard returns existing record — no item lookup needed
      mockFindOne.mockReturnValueOnce({ exec: () => Promise.resolve(existingRedemption) });

      const result = await service.redeemItem(
        'member-1',
        'item-001',
        'redroompleasures',
        'idem-key-duplicate',
      );

      expect(result.redemptionId).toBe('existing-id');
      expect(result.redemptionCode).toBe('RRR-REDR-EXISTING');
      expect(result.itemTitle).toBe('10% Off Coupon');
      // No inventory decrement or new redemption record on retry
      expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('throws ConflictException when existing redemption is RESERVED (in-progress)', async () => {
      const reservedRedemption = {
        redemption_id: 'reserved-id',
        redemption_code: 'RRR-REDR-RESERVED',
        points_spent: 500,
        catalogue_item_id: 'item-001',
        item_title: '10% Off Coupon',
        status: 'RESERVED',
      };
      mockFindOne.mockReturnValueOnce({ exec: () => Promise.resolve(reservedRedemption) });

      await expect(
        service.redeemItem('member-1', 'item-001', 'redroompleasures', 'idem-key-reserved'),
      ).rejects.toThrow(ConflictException);
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when idempotency key reused for a different item', async () => {
      const existingRedemption = {
        redemption_id: 'existing-id',
        redemption_code: 'RRR-REDR-EXISTING',
        points_spent: 500,
        catalogue_item_id: 'item-001',
        item_title: '10% Off Coupon',
      };
      mockFindOne.mockReturnValueOnce({ exec: () => Promise.resolve(existingRedemption) });

      await expect(
        service.redeemItem('member-1', 'item-999', 'redroompleasures', 'idem-key-duplicate'),
      ).rejects.toThrow(BadRequestException);
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });
  });

  describe('listCatalogueItems', () => {
    it('returns paginated items and total', async () => {
      mockFind.mockReturnValue({
        skip: () => ({
          limit: () => ({ lean: () => ({ exec: () => Promise.resolve([mockItemBase]) }) }),
        }),
      });
      mockCountDocuments.mockReturnValue({ exec: () => Promise.resolve(1) });

      const result = await service.listCatalogueItems('redroompleasures', {}, 1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('applies redemption_type and max_points_cost filters', async () => {
      mockFind.mockReturnValue({
        skip: () => ({ limit: () => ({ lean: () => ({ exec: () => Promise.resolve([]) }) }) }),
      });
      mockCountDocuments.mockReturnValue({ exec: () => Promise.resolve(0) });

      await service.listCatalogueItems(
        'redroompleasures',
        { redemption_type: 'DISCOUNT_CODE', max_points_cost: 1000 },
        1,
        10,
      );

      expect(mockFind).toHaveBeenCalled();
    });
  });

  describe('getCatalogueItem', () => {
    it('returns item when found', async () => {
      mockFindOne.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(mockItemBase) }) });

      const result = await service.getCatalogueItem('item-001', 'redroompleasures');
      expect(result.item_id).toBe('item-001');
    });

    it('throws NotFoundException when item not found', async () => {
      mockFindOne.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(null) }) });

      await expect(service.getCatalogueItem('missing', 'redroompleasures')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMyRedemptions', () => {
    it('returns list of redemptions for a member', async () => {
      const redemption = { redemption_id: 'r-1', member_id: 'member-1', points_spent: 500 };
      mockFind.mockReturnValue({
        sort: () => ({ lean: () => ({ exec: () => Promise.resolve([redemption]) }) }),
      });

      const result = await service.getMyRedemptions('member-1', 'redroompleasures');
      expect(result).toHaveLength(1);
    });
  });

  describe('fulfillRedemption', () => {
    it('throws NotFoundException when redemption not found', async () => {
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(null) });

      await expect(service.fulfillRedemption('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when redemption is not PENDING', async () => {
      mockFindOne.mockReturnValue({
        exec: () => Promise.resolve({ status: 'FULFILLED', save: jest.fn() }),
      });

      await expect(service.fulfillRedemption('r-1')).rejects.toThrow(BadRequestException);
    });

    it('updates status to FULFILLED', async () => {
      const mockSave = jest.fn().mockResolvedValue(undefined);
      const record = { redemption_id: 'r-1', status: 'PENDING', save: mockSave };
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(record) });

      const result = await service.fulfillRedemption('r-1');
      expect(result.status).toBe('FULFILLED');
      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe('updateCatalogueItem', () => {
    it('throws BadRequestException for invalid points_cost', async () => {
      await expect(
        service.updateCatalogueItem('item-001', 'redroompleasures', { points_cost: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when item does not exist', async () => {
      mockFindOneAndUpdate.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(null) }) });

      await expect(
        service.updateCatalogueItem('missing', 'redroompleasures', { title: 'New Title' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns updated item', async () => {
      const updated = { ...mockItemBase, title: 'New Title' };
      mockFindOneAndUpdate.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(updated) }),
      });

      const result = await service.updateCatalogueItem('item-001', 'redroompleasures', {
        title: 'New Title',
      });
      expect(result.title).toBe('New Title');
    });

    it('throws BadRequestException for invalid inventory_count', async () => {
      await expect(
        service.updateCatalogueItem('item-001', 'redroompleasures', { inventory_count: -1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('redeemItem — not-yet-available', () => {
    it('throws BadRequestException when valid_from is in the future', async () => {
      const future = new Date(Date.now() + 100_000);
      mockFindOne.mockReturnValueOnce({ exec: () => Promise.resolve(null) }).mockReturnValueOnce({
        exec: () => Promise.resolve({ ...mockItemBase, valid_from: future }),
      });

      await expect(
        service.redeemItem('member-1', 'item-001', 'redroompleasures', 'idem-key-future'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when ledger deductPoints throws (rolls back pending record)', async () => {
      mockFindOne
        .mockReturnValueOnce({ exec: () => Promise.resolve(null) })
        .mockReturnValueOnce({ exec: () => Promise.resolve({ ...mockItemBase }) });
      mockCreate.mockResolvedValue({});
      mockDeleteOne.mockReturnValue({ exec: () => Promise.resolve({}) });
      ledger.deductPoints.mockRejectedValue(new Error('insufficient balance'));

      await expect(
        service.redeemItem('member-1', 'item-001', 'redroompleasures', 'idem-key-broke'),
      ).rejects.toThrow(BadRequestException);
      expect(mockDeleteOne).toHaveBeenCalled();
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

    it('throws BadRequestException for negative inventory_count', async () => {
      await expect(
        service.createCatalogueItem({
          tenant_id: 'redroompleasures',
          title: 'Test',
          description: 'Test item',
          points_cost: 100,
          inventory_count: -5,
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
