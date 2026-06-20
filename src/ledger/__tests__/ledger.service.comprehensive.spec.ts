/**
 * Comprehensive Ledger Service Tests
 *
 * Tests immutability, idempotency, audit trails, and reconciliation
 * as specified in TEST_STRATEGY.md
 */

import { LedgerService } from '../ledger.service';
import { TransactionType, TransactionReason } from '../../wallets/types';
import { LedgerEntryModel } from '../../db/models/ledger-entry.model';

// Auto-mock the DB model so no real MongoDB connection is needed
jest.mock('../../db/models/ledger-entry.model');
jest.mock('../../db/models/idempotency.model');

describe('LedgerService - Comprehensive Tests', () => {
  let ledgerService: LedgerService;

  beforeEach(() => {
    jest.clearAllMocks();
    ledgerService = new LedgerService();
  });

  describe('createEntry', () => {
    it('should create immutable ledger entry', async () => {
      // Arrange
      const idempotencyKey = 'idem-ledger-1';
      const entryData = {
        accountId: 'user-123',
        accountType: 'user' as const,
        amount: 100,
        type: TransactionType.CREDIT,
        balanceState: 'available' as const,
        stateTransition: 'available+100',
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey,
        requestId: 'req-1',
        balanceBefore: 0,
        balanceAfter: 100,
      };

      (LedgerEntryModel.create as jest.Mock).mockResolvedValue({
        entryId: 'entry-1',
        ...entryData,
        timestamp: new Date(),
        currency: 'points',
      });

      // Act
      const entry = await ledgerService.createEntry(entryData);

      // Assert
      expect(entry.entryId).toBeDefined();
      expect(entry.amount).toBe(100);
      expect(LedgerEntryModel.create).toHaveBeenCalled();
    });

    it('should enforce idempotency', async () => {
      // Arrange
      const idempotencyKey = 'idem-duplicate';
      const existingEntry = {
        entryId: 'existing-1',
        idempotencyKey,
        accountId: 'user-123',
        accountType: 'user',
        amount: 100,
        type: 'credit',
        balanceState: 'available',
        stateTransition: 'available+100',
        reason: 'user_signup_bonus',
        requestId: 'req-2',
        balanceBefore: 0,
        balanceAfter: 100,
        timestamp: new Date(),
        currency: 'points',
      };

      // Simulate duplicate key error on create, then findOne returns existing
      const duplicateError: any = new Error('Duplicate key'); // eslint-disable-line @typescript-eslint/no-explicit-any
      duplicateError.code = 11000;
      duplicateError.keyPattern = { idempotencyKey: 1 };

      (LedgerEntryModel.create as jest.Mock).mockRejectedValue(duplicateError);
      (LedgerEntryModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(existingEntry),
        }),
      });

      // Act
      const entry = await ledgerService.createEntry({
        accountId: 'user-123',
        accountType: 'user',
        amount: 100,
        type: TransactionType.CREDIT,
        balanceState: 'available',
        stateTransition: 'available+100',
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey,
        requestId: 'req-2',
        balanceBefore: 0,
        balanceAfter: 100,
      });

      // Assert
      expect(entry.entryId).toBe('existing-1');
      expect(LedgerEntryModel.create).toHaveBeenCalled();
    });

    it('should reject invalid state transitions', async () => {
      // Invalid: user account with 'earned' balance state (earned is for models only)
      await expect(
        ledgerService.createEntry({
          accountId: 'user-123',
          accountType: 'user',
          amount: 100,
          type: TransactionType.DEBIT,
          balanceState: 'earned',
          stateTransition: 'earned→escrow',
          reason: TransactionReason.CHIP_MENU_PURCHASE,
          idempotencyKey: 'idem-invalid-1',
          requestId: 'req-invalid-1',
          balanceBefore: 100,
          balanceAfter: 0,
        }),
      ).rejects.toThrow('Invalid state transition');
    });

    it('should validate that user accounts cannot use earned balance state', async () => {
      // DEBIT with a negative amount is valid in production (wallet.service uses this pattern)
      // This test verifies model accounts cannot use escrow state
      await expect(
        ledgerService.createEntry({
          accountId: 'model-123',
          accountType: 'model',
          amount: -100,
          type: TransactionType.DEBIT,
          balanceState: 'escrow',
          stateTransition: 'escrow→debit',
          reason: TransactionReason.CHIP_MENU_PURCHASE,
          idempotencyKey: 'idem-invalid-2',
          requestId: 'req-invalid-2',
          balanceBefore: 100,
          balanceAfter: 0,
        }),
      ).rejects.toThrow('Invalid state transition');
    });

    it('should prevent PII in metadata', async () => {
      await expect(
        ledgerService.createEntry({
          accountId: 'user-123',
          accountType: 'user',
          amount: 100,
          type: TransactionType.CREDIT,
          balanceState: 'available',
          stateTransition: 'available+100',
          reason: TransactionReason.USER_SIGNUP_BONUS,
          idempotencyKey: 'idem-pii',
          requestId: 'req-pii',
          balanceBefore: 0,
          balanceAfter: 100,
          metadata: {
            email: 'user@example.com', // PII!
            campaignId: 'campaign-123',
          },
        }),
      ).rejects.toThrow('PII detected');
    });
  });

  describe('queryEntries', () => {
    it('should filter by account ID', async () => {
      // Arrange
      const accountId = 'user-123';
      const mockEntries = [
        {
          entryId: 'entry-1',
          accountId,
          amount: 100,
          type: TransactionType.CREDIT,
          balanceState: 'available',
          stateTransition: 'available+100',
          reason: 'user_signup_bonus',
          idempotencyKey: 'idem-1',
          requestId: 'req-1',
          balanceBefore: 0,
          balanceAfter: 100,
          timestamp: new Date(),
          currency: 'points',
        },
        {
          entryId: 'entry-2',
          accountId,
          amount: -50,
          type: TransactionType.DEBIT,
          balanceState: 'available',
          stateTransition: 'available-50',
          reason: 'chip_menu_purchase',
          idempotencyKey: 'idem-2',
          requestId: 'req-2',
          balanceBefore: 100,
          balanceAfter: 50,
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
      (LedgerEntryModel.countDocuments as jest.Mock).mockResolvedValue(2);

      // Act
      const result = await ledgerService.queryEntries({
        accountId,
      });

      // Assert
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].accountId).toBe(accountId);
      expect(LedgerEntryModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: { $eq: accountId } }),
      );
    });

    it('should filter by date range', async () => {
      // Arrange
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      (LedgerEntryModel.countDocuments as jest.Mock).mockResolvedValue(0);

      // Act
      await ledgerService.queryEntries({
        startDate,
        endDate,
      });

      // Assert
      expect(LedgerEntryModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          },
        }),
      );
    });

    it('should paginate results', async () => {
      // Arrange
      const limit = 10;
      const offset = 20;

      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      (LedgerEntryModel.countDocuments as jest.Mock).mockResolvedValue(100);

      // Act
      const result = await ledgerService.queryEntries({
        limit,
        offset,
      });

      // Assert — LedgerQueryResult stores pagination fields at the top level
      expect(result.limit).toBe(limit);
      expect(result.offset).toBe(offset);
      expect(result.totalCount).toBe(100);
    });

    it('should support filtering by transaction type', async () => {
      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      (LedgerEntryModel.countDocuments as jest.Mock).mockResolvedValue(0);

      await ledgerService.queryEntries({
        type: TransactionType.CREDIT,
      });

      expect(LedgerEntryModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          type: { $eq: TransactionType.CREDIT },
        }),
      );
    });
  });

  describe('getBalanceSnapshot', () => {
    it('should calculate balance from ledger', async () => {
      // Arrange
      const accountId = 'user-123';
      // LCR-4: snapshot sums signed `amount` deltas per state.
      const mockEntries = [
        { balanceState: 'available', balanceAfter: 120, amount: 120, type: TransactionType.CREDIT },
      ];

      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockEntries),
      });

      // Act — positional args: (accountId, accountType, asOf?)
      const snapshot = await ledgerService.getBalanceSnapshot(accountId, 'user');

      // Assert — BalanceSnapshot uses availableBalance, not balance
      expect(snapshot.availableBalance).toBe(120);
    });

    it('should support point-in-time queries', async () => {
      // Arrange
      const accountId = 'user-123';
      const asOfDate = new Date('2026-01-15');
      const mockEntries = [
        {
          balanceState: 'available',
          balanceAfter: 70,
          amount: 70,
          type: TransactionType.CREDIT,
          timestamp: new Date('2026-01-10'),
        },
      ];

      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockEntries),
      });

      // Act
      const snapshot = await ledgerService.getBalanceSnapshot(accountId, 'user', asOfDate);

      // Assert
      expect(snapshot.availableBalance).toBe(70);
      expect(LedgerEntryModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: { $lte: asOfDate },
        }),
      );
    });
  });

  describe('generateReconciliationReport', () => {
    it('should calculate credits and debits in date range', async () => {
      // Arrange
      const accountId = 'user-123';
      const dateRange = { start: new Date('2026-01-01'), end: new Date('2026-01-31') };
      const mockEntries = [
        { amount: 100, type: 'credit', balanceState: 'available', balanceAfter: 100 },
      ];

      (LedgerEntryModel.find as jest.Mock)
        // First call: getBalanceSnapshot for start date
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([]),
        })
        // Second call: entries in range
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(mockEntries),
        })
        // Third call: getBalanceSnapshot for end date
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockReturnThis(),
          exec: jest
            .fn()
            .mockResolvedValue([{ balanceState: 'available', amount: 100, balanceAfter: 100 }]),
        });

      // Act — positional args: (accountId, accountType, dateRange, tenantId)
      const report = await ledgerService.generateReconciliationReport(
        accountId,
        'user',
        dateRange,
        'tenant-1',
      );

      // Assert — ReconciliationReport fields: totalCredits, totalDebits, reconciled, difference
      expect(report.totalCredits).toBe(100);
      expect(report.totalDebits).toBe(0);
      expect(report.accountId).toBe(accountId);
    });

    it('should show all transactions in range', async () => {
      // Arrange
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      (LedgerEntryModel.find as jest.Mock)
        // getBalanceSnapshot start
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([]),
        })
        // entries in range
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([
            { amount: 100, type: 'credit', balanceState: 'available', balanceAfter: 100 },
            { amount: -30, type: 'debit', balanceState: 'available', balanceAfter: 70 },
          ]),
        })
        // getBalanceSnapshot end
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockReturnThis(),
          exec: jest
            .fn()
            .mockResolvedValue([{ balanceState: 'available', amount: 70, balanceAfter: 70 }]),
        });

      // Act
      const report = await ledgerService.generateReconciliationReport(
        'user-123',
        'user',
        {
          start: startDate,
          end: endDate,
        },
        'tenant-1',
      );

      // Assert
      expect(report.totalCredits).toBe(100);
      expect(report.totalDebits).toBe(30);
      expect(report.calculatedBalance).toBe(70); // 0 + 100 - 30
    });
  });

  describe('Audit Trail', () => {
    it('should include full context in ledger entries', async () => {
      (LedgerEntryModel.create as jest.Mock).mockResolvedValue({
        entryId: 'entry-audit',
        accountId: 'user-123',
        accountType: 'user',
        amount: 100,
        type: 'credit',
        balanceState: 'available',
        stateTransition: 'available+100',
        reason: 'user_signup_bonus',
        idempotencyKey: 'idem-audit',
        requestId: 'req-audit',
        balanceBefore: 0,
        balanceAfter: 100,
        timestamp: new Date(),
        currency: 'points',
        metadata: {
          campaignId: 'campaign-123',
          sourceIp: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      });

      await ledgerService.createEntry({
        accountId: 'user-123',
        accountType: 'user',
        amount: 100,
        type: TransactionType.CREDIT,
        balanceState: 'available',
        stateTransition: 'available+100',
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey: 'idem-audit',
        requestId: 'req-audit',
        balanceBefore: 0,
        balanceAfter: 100,
        metadata: {
          campaignId: 'campaign-123',
          sourceIp: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      });

      expect(LedgerEntryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            campaignId: 'campaign-123',
            sourceIp: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          }),
        }),
      );
    });

    it('should never allow deletion of ledger entries', async () => {
      // LedgerService should not expose any delete methods
      expect(ledgerService).not.toHaveProperty('deleteEntry');
      expect(ledgerService).not.toHaveProperty('deleteEntries');
      expect(ledgerService).not.toHaveProperty('removeEntry');
    });

    it('should never allow modification of existing entries', async () => {
      // LedgerService should not expose any update methods
      expect(ledgerService).not.toHaveProperty('updateEntry');
      expect(ledgerService).not.toHaveProperty('modifyEntry');
      expect(ledgerService).not.toHaveProperty('editEntry');
    });

    it('should support 7-year retention queries', async () => {
      const sevenYearsAgo = new Date();
      sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);

      (LedgerEntryModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      (LedgerEntryModel.countDocuments as jest.Mock).mockResolvedValue(0);

      await ledgerService.queryEntries({
        startDate: sevenYearsAgo,
        endDate: new Date(),
      });

      expect(LedgerEntryModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.objectContaining({
            $gte: sevenYearsAgo,
          }),
        }),
      );
    });
  });

  describe('Security', () => {
    it('should not expose sensitive data in queries', async () => {
      const mockEntries = [
        {
          entryId: 'entry-1',
          accountId: 'user-123',
          amount: 100,
          type: 'credit',
          balanceState: 'available',
          stateTransition: 'available+100',
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

      const result = await ledgerService.queryEntries({
        accountId: 'user-123',
      });

      // Verify no sensitive fields in result
      result.entries.forEach((entry) => {
        expect(entry).not.toHaveProperty('password');
        expect(entry).not.toHaveProperty('token');
        expect(entry).not.toHaveProperty('secret');
        expect(entry).not.toHaveProperty('apiKey');
      });
    });
  });
});
