/**
 * Ledger Service Tests
 */

import { LedgerService } from './ledger.service';
import { CreateLedgerEntryRequest, LedgerQueryFilter } from './types';
import { TransactionType, TransactionReason } from '../wallets/types';
import { LedgerEntryModel } from '../db/models/ledger-entry.model';
import { IdempotencyRecordModel } from '../db/models/idempotency.model';
import { WalletModel } from '../db/models/wallet.model';

// Mock mongoose models
jest.mock('../db/models/ledger-entry.model');
jest.mock('../db/models/idempotency.model');
jest.mock('../db/models/wallet.model');

describe('LedgerService', () => {
  let service: LedgerService;

  beforeEach(() => {
    service = new LedgerService();
    jest.clearAllMocks();

    // LCR-1: creditPoints/deductPoints mutate the authoritative WalletModel.
    // Default mock emulates an atomic `$inc` from a zero starting balance.
    (WalletModel.findOneAndUpdate as jest.Mock).mockImplementation(
      (_filter: unknown, update: { $inc?: { availableBalance?: number } }) => {
        const inc = update?.$inc?.availableBalance ?? 0;
        return Promise.resolve({ availableBalance: inc, version: 1 });
      },
    );
    (WalletModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ availableBalance: 0 }),
    });
  });

  describe('createEntry', () => {
    it('should create a new ledger entry', async () => {
      const request: CreateLedgerEntryRequest = {
        accountId: 'user-123',
        accountType: 'user',
        amount: 100,
        type: TransactionType.CREDIT,
        balanceState: 'available',
        stateTransition: 'credit→available',
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey: 'idem-123',
        requestId: 'req-123',
        balanceBefore: 0,
        balanceAfter: 100,
      };

      const mockEntry = {
        entryId: 'entry-123',
        transactionId: 'txn-123',
        ...request,
        timestamp: new Date(),
        currency: 'points',
      };

      (LedgerEntryModel.create as jest.Mock).mockResolvedValue(mockEntry);

      const result = await service.createEntry(request);

      expect(result.accountId).toBe('user-123');
      expect(result.amount).toBe(100);
      expect(result.type).toBe('credit');
      expect(LedgerEntryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'user-123',
          amount: 100,
          type: 'credit',
        }),
      );
    });

    it('should handle duplicate idempotency key', async () => {
      const request: CreateLedgerEntryRequest = {
        accountId: 'user-456',
        accountType: 'user',
        amount: 50,
        type: TransactionType.DEBIT,
        balanceState: 'available',
        stateTransition: 'available→debit',
        reason: TransactionReason.ADMIN_DEBIT,
        idempotencyKey: 'idem-duplicate',
        requestId: 'req-456',
        balanceBefore: 100,
        balanceAfter: 50,
      };

      const existingEntry = {
        entryId: 'entry-existing',
        transactionId: 'txn-existing',
        accountId: 'user-456',
        accountType: 'user',
        amount: 50,
        type: 'debit',
        balanceState: 'available',
        stateTransition: 'available→debit',
        reason: 'admin_debit',
        idempotencyKey: 'idem-duplicate',
        requestId: 'req-456',
        balanceBefore: 100,
        balanceAfter: 50,
        timestamp: new Date(),
        currency: 'points',
      };

      // Simulate duplicate key error
      const duplicateError: Error & { code?: number; keyPattern?: { idempotencyKey: number } } =
        new Error('Duplicate key');
      duplicateError.code = 11000;
      duplicateError.keyPattern = { idempotencyKey: 1 };

      const leanMock = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(existingEntry),
      });

      (LedgerEntryModel.create as jest.Mock).mockRejectedValue(duplicateError);
      (LedgerEntryModel.findOne as jest.Mock).mockReturnValue({
        lean: leanMock,
      });

      const result = await service.createEntry(request);

      expect(result).toBeDefined();
      expect(result.entryId).toBe('entry-existing');
      expect(LedgerEntryModel.findOne).toHaveBeenCalledWith({
        idempotencyKey: { $eq: 'idem-duplicate' },
      });
    });

    it('should generate transaction ID if not provided', async () => {
      const request: CreateLedgerEntryRequest = {
        accountId: 'user-789',
        accountType: 'user',
        amount: 200,
        type: TransactionType.CREDIT,
        balanceState: 'available',
        stateTransition: 'credit→available',
        reason: TransactionReason.PROMOTIONAL_AWARD,
        idempotencyKey: 'idem-789',
        requestId: 'req-789',
        balanceBefore: 0,
        balanceAfter: 200,
      };

      const mockEntry = {
        entryId: 'entry-789',
        transactionId: 'generated-txn-id',
        ...request,
        timestamp: new Date(),
        currency: 'points',
      };

      (LedgerEntryModel.create as jest.Mock).mockResolvedValue(mockEntry);

      await service.createEntry(request);

      expect(LedgerEntryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: expect.any(String),
        }),
      );
    });
  });

  describe('queryEntries', () => {
    it('should query entries with filters', async () => {
      const filter: LedgerQueryFilter = {
        accountId: 'user-123',
        accountType: 'user',
        type: TransactionType.CREDIT,
        limit: 10,
        offset: 0,
      };

      const mockEntries = [
        {
          entryId: 'entry-1',
          transactionId: 'txn-1',
          accountId: 'user-123',
          accountType: 'user',
          amount: 100,
          type: 'credit',
          balanceState: 'available',
          stateTransition: 'credit→available',
          reason: 'user_signup_bonus',
          idempotencyKey: 'idem-1',
          requestId: 'req-1',
          balanceBefore: 0,
          balanceAfter: 100,
          timestamp: new Date(),
          currency: 'points',
        },
      ];

      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockEntries),
      });

      (LedgerEntryModel.countDocuments as jest.Mock).mockResolvedValue(1);

      const result = await service.queryEntries(filter);

      expect(result.entries).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(LedgerEntryModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: { $eq: 'user-123' },
          accountType: { $eq: 'user' },
          type: { $eq: 'credit' },
        }),
      );
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const filter: LedgerQueryFilter = {
        accountId: 'user-456',
        startDate,
        endDate,
        limit: 10,
        offset: 0,
      };

      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      (LedgerEntryModel.countDocuments as jest.Mock).mockResolvedValue(0);

      await service.queryEntries(filter);

      expect(LedgerEntryModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: { $gte: startDate, $lte: endDate },
        }),
      );
    });

    it('should enforce maximum limit of 1000', async () => {
      const filter: LedgerQueryFilter = {
        limit: 5000,
        offset: 0,
      };

      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      (LedgerEntryModel.countDocuments as jest.Mock).mockResolvedValue(0);

      const result = await service.queryEntries(filter);

      expect(result.limit).toBe(1000);
    });
  });

  describe('getEntry', () => {
    it('should retrieve a specific entry by ID', async () => {
      const mockEntry = {
        entryId: 'entry-specific',
        transactionId: 'txn-specific',
        accountId: 'user-123',
        accountType: 'user',
        amount: 100,
        type: 'credit',
        balanceState: 'available',
        stateTransition: 'credit→available',
        reason: 'user_signup_bonus',
        idempotencyKey: 'idem-specific',
        requestId: 'req-specific',
        balanceBefore: 0,
        balanceAfter: 100,
        timestamp: new Date(),
        currency: 'points',
      };

      (LedgerEntryModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockEntry),
      });

      const result = await service.getEntry('entry-specific');

      expect(result).not.toBeNull();
      expect(result?.entryId).toBe('entry-specific');
      expect(LedgerEntryModel.findOne).toHaveBeenCalledWith({
        entryId: { $eq: 'entry-specific' },
      });
    });

    it('should return null if entry not found', async () => {
      (LedgerEntryModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.getEntry('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getBalanceSnapshot', () => {
    it('should calculate balance snapshot for user', async () => {
      // LCR-4: balances are the sum of signed `amount` deltas per state.
      const mockEntries = [
        {
          balanceState: 'available',
          amount: 500,
          balanceAfter: 500,
          timestamp: new Date('2024-01-01'),
        },
        {
          balanceState: 'escrow',
          amount: 100,
          balanceAfter: 100,
          timestamp: new Date('2024-01-02'),
        },
      ];

      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockEntries),
      });

      const result = await service.getBalanceSnapshot('user-123', 'user');

      expect(result.accountId).toBe('user-123');
      expect(result.accountType).toBe('user');
      expect(result.availableBalance).toBe(500);
      expect(result.escrowBalance).toBe(100);
    });

    it('sums multiple deltas per state rather than reading the last balanceAfter', async () => {
      // Two credits and a debit on `available`; a stale/incorrect balanceAfter
      // on the last entry must NOT leak into the projection.
      const mockEntries = [
        { balanceState: 'available', amount: 500, balanceAfter: 500 },
        { balanceState: 'available', amount: 300, balanceAfter: 800 },
        { balanceState: 'available', amount: -200, balanceAfter: 99999 },
      ];

      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockEntries),
      });

      const result = await service.getBalanceSnapshot('user-sum', 'user');

      // 500 + 300 - 200 = 600 (NOT the bogus 99999 balanceAfter).
      expect(result.availableBalance).toBe(600);
    });

    it('should calculate balance snapshot for model', async () => {
      const mockEntries = [
        {
          balanceState: 'earned',
          amount: 1000,
          balanceAfter: 1000,
          timestamp: new Date('2024-01-01'),
        },
      ];

      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockEntries),
      });

      const result = await service.getBalanceSnapshot('model-456', 'model');

      expect(result.accountId).toBe('model-456');
      expect(result.accountType).toBe('model');
      expect(result.earnedBalance).toBe(1000);
    });
  });

  describe('checkIdempotency', () => {
    it('should return true if idempotency key exists', async () => {
      (IdempotencyRecordModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ pointsIdempotencyKey: 'test-key' }),
      });

      const result = await service.checkIdempotency('test-key', 'credit', 'tenant-1');

      expect(result).toBe(true);
      expect(IdempotencyRecordModel.findOne).toHaveBeenCalledWith({
        tenant_id: { $eq: 'tenant-1' },
        pointsIdempotencyKey: { $eq: 'test-key' },
        eventScope: { $eq: 'credit' },
      });
    });

    it('should return false if idempotency key does not exist', async () => {
      (IdempotencyRecordModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.checkIdempotency('new-key', 'debit', 'tenant-1');

      expect(result).toBe(false);
    });
  });

  describe('storeIdempotencyResult', () => {
    it('should store idempotency result with TTL', async () => {
      (IdempotencyRecordModel.create as jest.Mock).mockResolvedValue({});

      const result = { success: true };
      await service.storeIdempotencyResult('key-123', 'credit', result, 200, 86400);

      expect(IdempotencyRecordModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pointsIdempotencyKey: 'key-123',
          eventScope: 'credit',
          storedResult: result,
        }),
      );
    });
  });

  describe('awardPromotionalPoints (stub)', () => {
    it('should resolve true for the promotional-bonus stub', async () => {
      const ok = await service.awardPromotionalPoints(
        'creator-1',
        5000,
        'MERCHANT_AWARD_m1',
        'reason',
        30,
      );
      expect(ok).toBe(true);
    });
  });

  describe('createGiftingPromotion (stub)', () => {
    it('should resolve true for the gifting-promotion stub', async () => {
      const ok = await service.createGiftingPromotion('creator-1', 1000, 'title', 'cond', 100, 7);
      expect(ok).toBe(true);
    });
  });
});

describe('LedgerService.getLifetimeEarnedPoints', () => {
  let service: LedgerService;

  beforeEach(() => {
    service = new LedgerService();
    jest.clearAllMocks();
  });

  it('sums credit-to-available entries, excluding refund/release reasons', async () => {
    const aggregate = LedgerEntryModel.aggregate as unknown as jest.Mock;
    aggregate.mockResolvedValue([{ total: 12500 }]);

    const total = await service.getLifetimeEarnedPoints('user-1');

    expect(total).toBe(12500);
    const pipeline = aggregate.mock.calls[0][0];
    const match = pipeline[0].$match;
    expect(match.accountId).toEqual({ $eq: 'user-1' });
    expect(match.type).toBe(TransactionType.CREDIT);
    expect(match.balanceState).toBe('available');
    // Escrow releases (voids) and refunds must be excluded from lifetime earned.
    expect(match.reason.$nin).toContain(TransactionReason.MERCHANT_ORDER_REDEMPTION_VOID);
    expect(match.reason.$nin).toContain(TransactionReason.ADMIN_REFUND);
  });

  it('returns 0 when the member has no earning history', async () => {
    (LedgerEntryModel.aggregate as unknown as jest.Mock).mockResolvedValue([]);
    expect(await service.getLifetimeEarnedPoints('user-none')).toBe(0);
  });
});
