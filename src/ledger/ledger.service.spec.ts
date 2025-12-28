/**
 * Ledger Service Tests
 */

import { LedgerService } from './ledger.service';
import { CreateLedgerEntryRequest, LedgerQueryFilter } from './types';
import { TransactionType, TransactionReason } from '../wallets/types';
import { LedgerEntryModel } from '../db/models/ledger-entry.model';
import { IdempotencyRecordModel } from '../db/models/idempotency.model';

// Mock mongoose models
jest.mock('../db/models/ledger-entry.model');
jest.mock('../db/models/idempotency.model');

describe('LedgerService', () => {
  let service: LedgerService;

  beforeEach(() => {
    service = new LedgerService();
    jest.clearAllMocks();
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
        })
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
      const duplicateError: any = new Error('Duplicate key');
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
        })
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
        })
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
        })
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
      const mockEntries = [
        {
          balanceState: 'available',
          balanceAfter: 500,
          timestamp: new Date('2024-01-01'),
        },
        {
          balanceState: 'escrow',
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

    it('should calculate balance snapshot for model', async () => {
      const mockEntries = [
        {
          balanceState: 'earned',
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

      const result = await service.checkIdempotency('test-key', 'credit');

      expect(result).toBe(true);
      expect(IdempotencyRecordModel.findOne).toHaveBeenCalledWith({
        pointsIdempotencyKey: { $eq: 'test-key' },
        eventScope: { $eq: 'credit' },
      });
    });

    it('should return false if idempotency key does not exist', async () => {
      (IdempotencyRecordModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.checkIdempotency('new-key', 'debit');

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
        })
      );
    });
  });
});
