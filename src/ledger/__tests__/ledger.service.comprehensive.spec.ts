/**
 * Comprehensive Ledger Service Tests
 * 
 * Tests immutability, idempotency, audit trails, and reconciliation
 * as specified in TEST_STRATEGY.md
 */

import { LedgerService } from '../ledger.service';
import { TransactionType, TransactionReason } from '../../wallets/types';

// Mock implementations
const mockLedgerModel = {
  create: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
};

// Mock modules
jest.mock('../../db/models/ledger-entry.model', () => ({
  LedgerEntryModel: mockLedgerModel,
}));

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

      mockLedgerModel.findOne.mockResolvedValue(null);
      mockLedgerModel.create.mockResolvedValue({
        entryId: 'entry-1',
        ...entryData,
        timestamp: new Date(),
      });

      // Act
      const entry = await ledgerService.createEntry(entryData);

      // Assert
      expect(entry.entryId).toBeDefined();
      expect(entry.amount).toBe(100);
      expect(mockLedgerModel.create).toHaveBeenCalled();
    });

    it('should enforce idempotency', async () => {
      // Arrange
      const idempotencyKey = 'idem-duplicate';
      const existingEntry = {
        entryId: 'existing-1',
        idempotencyKey,
      };

      mockLedgerModel.findOne.mockResolvedValue(existingEntry);

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
      expect(mockLedgerModel.create).not.toHaveBeenCalled();
    });

    it('should reject invalid state transitions', async () => {
      mockLedgerModel.findOne.mockResolvedValue(null);

      // Invalid transition: earned→escrow (should be available→escrow)
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
        })
      ).rejects.toThrow('Invalid state transition');
    });

    it('should validate transaction type matches amount sign', async () => {
      mockLedgerModel.findOne.mockResolvedValue(null);

      // Credit with negative amount
      await expect(
        ledgerService.createEntry({
          accountId: 'user-123',
          accountType: 'user',
          amount: -100,
          type: TransactionType.CREDIT,
          balanceState: 'available',
          stateTransition: 'available+100',
          reason: TransactionReason.USER_SIGNUP_BONUS,
          idempotencyKey: 'idem-invalid-2',
          requestId: 'req-invalid-2',
          balanceBefore: 0,
          balanceAfter: 100,
        })
      ).rejects.toThrow();
    });

    it('should prevent PII in metadata', async () => {
      mockLedgerModel.findOne.mockResolvedValue(null);

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
        })
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
        },
        {
          entryId: 'entry-2',
          accountId,
          amount: -50,
          type: TransactionType.DEBIT,
        },
      ];

      mockLedgerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockEntries),
      });
      mockLedgerModel.countDocuments.mockResolvedValue(2);

      // Act
      const result = await ledgerService.queryEntries({
        accountId,
      });

      // Assert
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].accountId).toBe(accountId);
      expect(mockLedgerModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ accountId })
      );
    });

    it('should filter by date range', async () => {
      // Arrange
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      mockLedgerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      });
      mockLedgerModel.countDocuments.mockResolvedValue(0);

      // Act
      await ledgerService.queryEntries({
        startDate,
        endDate,
      });

      // Assert
      expect(mockLedgerModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          },
        })
      );
    });

    it('should paginate results', async () => {
      // Arrange
      const limit = 10;
      const offset = 20;

      mockLedgerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      });
      mockLedgerModel.countDocuments.mockResolvedValue(100);

      // Act
      const result = await ledgerService.queryEntries({
        limit,
        offset,
      });

      // Assert
      expect(result.limit).toBe(limit);
      expect(result.offset).toBe(offset);
      expect(result.totalCount).toBe(100);
    });

    it('should support filtering by transaction type', async () => {
      mockLedgerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      });
      mockLedgerModel.countDocuments.mockResolvedValue(0);

      await ledgerService.queryEntries({
        type: TransactionType.CREDIT,
      });

      expect(mockLedgerModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.CREDIT,
        })
      );
    });
  });

  describe('getBalanceSnapshot', () => {
    it('should calculate balance from ledger', async () => {
      // Arrange
      const accountId = 'user-123';
      const mockEntries = [
        { amount: 100, type: TransactionType.CREDIT },
        { amount: -30, type: TransactionType.DEBIT },
        { amount: 50, type: TransactionType.CREDIT },
      ];

      mockLedgerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockEntries),
      });

      // Act
      const snapshot = await ledgerService.getBalanceSnapshot(
        accountId,
        'user'
      );

      // Assert
      expect(snapshot.availableBalance).toBe(120); // 100 - 30 + 50
    });

    it('should support point-in-time queries', async () => {
      // Arrange
      const accountId = 'user-123';
      const asOfDate = new Date('2026-01-15');
      const mockEntries = [
        {
          amount: 100,
          type: TransactionType.CREDIT,
          timestamp: new Date('2026-01-10'),
        },
        {
          amount: -30,
          type: TransactionType.DEBIT,
          timestamp: new Date('2026-01-12'),
        },
        // This one is after asOfDate, should not be included
        {
          amount: 50,
          type: TransactionType.CREDIT,
          timestamp: new Date('2026-01-20'),
        },
      ];

      mockLedgerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockEntries.slice(0, 2)),
      });

      // Act
      const snapshot = await ledgerService.getBalanceSnapshot(
        accountId,
        'user',
        asOfDate
      );

      // Assert
      expect(snapshot.availableBalance).toBe(70); // 100 - 30 (excludes the 50 from Jan 20)
      expect(mockLedgerModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: { $lte: asOfDate },
        })
      );
    });
  });

  describe('generateReconciliationReport', () => {
    it('should detect balance mismatches', async () => {
      // Arrange
      const accountId = 'user-123';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');
      
      // Ledger shows 100
      mockLedgerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { amount: 100, type: TransactionType.CREDIT },
        ]),
      });

      // Mock wallet balance lookup
      jest.spyOn(ledgerService, 'getBalanceSnapshot')
        .mockResolvedValueOnce({ availableBalance: 0, escrowBalance: 0 } as any) // start
        .mockResolvedValueOnce({ availableBalance: 90, escrowBalance: 0 } as any); // end (mismatch!)

      // Act
      const report = await ledgerService.generateReconciliationReport(
        accountId,
        'user',
        { start: startDate, end: endDate }
      );

      // Assert
      expect(report.reconciled).toBe(false);
      expect(report.calculatedBalance).toBe(100);
      expect(report.actualBalance).toBe(90);
      expect(report.difference).toBe(-10);
    });

    it('should show all transactions in range', async () => {
      // Arrange
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const mockEntries = [
        {
          entryId: 'entry-1',
          accountId: 'user-123',
          amount: 100,
          type: TransactionType.CREDIT,
          timestamp: new Date('2026-01-15'),
        },
        {
          entryId: 'entry-2',
          accountId: 'user-123',
          amount: -30,
          type: TransactionType.DEBIT,
          timestamp: new Date('2026-01-20'),
        },
      ];

      mockLedgerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockEntries),
      });

      // Mock balance snapshots
      jest.spyOn(ledgerService, 'getBalanceSnapshot')
        .mockResolvedValueOnce({ availableBalance: 0, escrowBalance: 0 } as any) // start
        .mockResolvedValueOnce({ availableBalance: 70, escrowBalance: 0 } as any); // end

      // Act
      const report = await ledgerService.generateReconciliationReport(
        'user-123',
        'user',
        { start: startDate, end: endDate }
      );

      // Assert
      expect(report.accountId).toBe('user-123');
      expect(report.totalCredits).toBe(100);
      expect(report.totalDebits).toBe(30);
    });
  });

  describe('Audit Trail', () => {
    it('should include full context in ledger entries', async () => {
      mockLedgerModel.findOne.mockResolvedValue(null);
      mockLedgerModel.create.mockResolvedValue({
        entryId: 'entry-audit',
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

      expect(mockLedgerModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            campaignId: 'campaign-123',
            sourceIp: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          }),
        })
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

      mockLedgerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      });
      mockLedgerModel.countDocuments.mockResolvedValue(0);

      await ledgerService.queryEntries({
        startDate: sevenYearsAgo,
        endDate: new Date(),
      });

      expect(mockLedgerModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.objectContaining({
            $gte: sevenYearsAgo,
          }),
        })
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
          // No password, token, or secret fields exposed
        },
      ];

      mockLedgerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockEntries),
      });
      mockLedgerModel.countDocuments.mockResolvedValue(1);

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
