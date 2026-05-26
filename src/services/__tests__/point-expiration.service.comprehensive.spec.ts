/**
 * Comprehensive Point Expiration Service Tests
 *
 * Tests point expiration logic, batch processing, and edge cases
 * as specified in TEST_STRATEGY.md
 */

import { PointExpirationService } from '../point-expiration.service';
import { TransactionType, TransactionReason } from '../../wallets/types';
import { WalletModel } from '../../db/models/wallet.model';

// Auto-mock DB model (avoids jest hoisting issues with const variables in factories)
jest.mock('../../db/models/wallet.model');

// Mock ledger service
const mockLedgerService = {
  createEntry: jest.fn(),
  queryEntries: jest.fn(),
  getBalanceSnapshot: jest.fn(),
};

describe('PointExpirationService - Comprehensive Tests', () => {
  let expirationService: PointExpirationService;

  beforeEach(() => {
    jest.clearAllMocks();
    expirationService = new PointExpirationService(mockLedgerService as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  describe('processUserExpiration', () => {
    it('should expire points for a single user', async () => {
      // Arrange
      const userId = 'user-123';
      const expiredEntries = [
        {
          entryId: 'entry-1',
          accountId: userId,
          amount: 100,
          type: TransactionType.CREDIT,
          timestamp: new Date('2025-01-01'),
          metadata: { expiresAt: new Date('2025-12-31') },
        },
        {
          entryId: 'entry-2',
          accountId: userId,
          amount: 50,
          type: TransactionType.CREDIT,
          timestamp: new Date('2025-02-01'),
          metadata: { expiresAt: new Date('2025-12-31') },
        },
      ];

      mockLedgerService.queryEntries.mockResolvedValue({
        entries: expiredEntries,
        totalCount: 2,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId,
        availableBalance: 150,
        escrowBalance: 0,
        version: 5,
        save: jest.fn().mockResolvedValue(true),
      });

      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId,
        availableBalance: 0,
        version: 6,
      });

      mockLedgerService.createEntry.mockResolvedValue({
        entryId: 'expiration-entry',
      });

      // Act — positional args: (userId, requestId)
      const result = await expirationService.processUserExpiration(userId, 'req-expire-1');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.amountExpired).toBe(150); // 100 + 50, capped at availableBalance
      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.DEBIT,
          reason: TransactionReason.POINT_EXPIRY,
        }),
      );
    });

    it('should handle users with no expired points', async () => {
      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [],
        totalCount: 0,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      const result = await expirationService.processUserExpiration(
        'user-no-expired',
        'req-no-expire',
      );

      // Service returns null when no points are expired
      expect(result).toBeNull();
      expect(mockLedgerService.createEntry).not.toHaveBeenCalled();
    });

    it('should respect grace period', async () => {
      const gracePeriodDays = 3;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expirationService = new PointExpirationService(mockLedgerService as any, {
        gracePeriodDays,
      });

      // Entry expired only 1 day ago — inside grace period, should NOT be processed
      const recentExpiration = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [
          {
            entryId: 'entry-1',
            accountId: 'user-123',
            amount: 100,
            metadata: { expiresAt: recentExpiration },
          },
        ],
        totalCount: 1,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      const result = await expirationService.processUserExpiration('user-123', 'req-grace');

      // Should not expire yet — still within grace period
      expect(result).toBeNull();
      expect(mockLedgerService.createEntry).not.toHaveBeenCalled();
    });

    it('should create deterministic idempotency key', async () => {
      const userId = 'user-123';

      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [
          {
            entryId: 'entry-1',
            accountId: userId,
            amount: 100,
            metadata: { expiresAt: new Date('2025-12-31') },
          },
        ],
        totalCount: 1,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId,
        availableBalance: 100,
        version: 1,
        save: jest.fn().mockResolvedValue(true),
      });

      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId,
        availableBalance: 0,
        version: 2,
      });

      mockLedgerService.createEntry.mockResolvedValue({
        entryId: 'exp-entry',
      });

      await expirationService.processUserExpiration(userId, 'req-idem');

      // Idempotency key should be based on userId and date
      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: expect.stringContaining(userId),
        }),
      );
    });
  });

  describe('processBatchExpiration', () => {
    it('should process multiple users in batch', async () => {
      // Arrange
      const usersWithExpiringPoints = [
        { userId: 'user-1', amountExpiring: 100 },
        { userId: 'user-2', amountExpiring: 50 },
        { userId: 'user-3', amountExpiring: 200 },
      ];

      // Spy on processUserExpiration — new signature: (userId: string, requestId: string)
      jest
        .spyOn(expirationService, 'processUserExpiration')
        .mockImplementation(async (userId: string) => {
          const user = usersWithExpiringPoints.find((u) => u.userId === userId);
          return {
            userId,
            amountExpired: user?.amountExpiring || 0,
            transactionId: `txn-${userId}`,
            timestamp: new Date(),
          };
        });

      // Act — new API: (userIds, requestId)
      const result = await expirationService.processBatchExpiration(
        ['user-1', 'user-2', 'user-3'],
        'req-batch-1',
      );

      // Assert
      expect(result.usersProcessed).toBe(3);
      expect(result.totalPointsExpired).toBe(350); // 100 + 50 + 200
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
    });

    it('should handle partial batch failures', async () => {
      const usersWithExpiringPoints = [
        { userId: 'user-1', amountExpiring: 100 },
        { userId: 'user-2', amountExpiring: 50 }, // Will fail
        { userId: 'user-3', amountExpiring: 200 },
      ];

      jest
        .spyOn(expirationService, 'processUserExpiration')
        .mockImplementation(async (userId: string) => {
          if (userId === 'user-2') {
            throw new Error('Database error');
          }
          const user = usersWithExpiringPoints.find((u) => u.userId === userId);
          return {
            userId,
            amountExpired: user?.amountExpiring || 0,
            transactionId: `txn-${userId}`,
            timestamp: new Date(),
          };
        });

      const result = await expirationService.processBatchExpiration(
        ['user-1', 'user-2', 'user-3'],
        'req-batch-2',
      );

      expect(result.usersProcessed).toBe(2); // only successful ones counted
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].userId).toBe('user-2');
    });

    it('should process all provided user IDs', async () => {
      jest.spyOn(expirationService, 'processUserExpiration').mockResolvedValue({
        userId: 'user-1',
        amountExpired: 100,
        transactionId: 'txn-1',
        timestamp: new Date(),
      });

      await expirationService.processBatchExpiration(['user-1', 'user-2', 'user-3'], 'req-batch-3');

      // All 3 userIds should have been processed
      expect(expirationService.processUserExpiration).toHaveBeenCalledTimes(3);
    });
  });

  describe('getUsersWithExpiringPoints', () => {
    it('should return users with points expiring soon', async () => {
      // Service does a single queryEntries call and groups by accountId
      const warningDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now

      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [
          {
            accountId: 'user-1',
            amount: 100,
            metadata: { expiresAt: warningDate },
          },
          {
            accountId: 'user-2',
            amount: 50,
            metadata: {
              expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
            },
          },
        ],
        totalCount: 2,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      // Act — no arguments in the current API
      const result = await expirationService.getUsersWithExpiringPoints();

      expect(result).toHaveLength(2);
      expect(result.some((u) => u.userId === 'user-1')).toBe(true);
      expect(result.some((u) => u.userId === 'user-2')).toBe(true);
    });

    it('should not include users with no expiring points', async () => {
      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [], // No entries with expiration dates
        totalCount: 0,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      // Act
      const result = await expirationService.getUsersWithExpiringPoints();

      expect(result).toHaveLength(0);
    });

    it('should return expiration date for users with expiring points', async () => {
      const expirationDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now

      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [
          {
            accountId: 'user-1',
            amount: 100,
            metadata: { expiresAt: expirationDate },
          },
        ],
        totalCount: 1,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      const result = await expirationService.getUsersWithExpiringPoints();

      expect(result[0].userId).toBe('user-1');
      // Return type: {userId, amountExpiring, expiresAt}
      expect(result[0].amountExpiring).toBe(100);
      expect(result[0].expiresAt).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle users with partial expired points', async () => {
      // User has 200 points, but only 100 are expired
      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [
          {
            entryId: 'entry-expired',
            accountId: 'user-123',
            amount: 100,
            metadata: { expiresAt: new Date('2025-12-31') },
          },
          {
            entryId: 'entry-valid',
            accountId: 'user-123',
            amount: 100,
            metadata: { expiresAt: new Date('2027-12-31') }, // Not expired yet
          },
        ],
        totalCount: 2,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId: 'user-123',
        availableBalance: 200,
        version: 1,
        save: jest.fn().mockResolvedValue(true),
      });

      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user-123',
        availableBalance: 100,
        version: 2,
      });

      mockLedgerService.createEntry.mockResolvedValue({
        entryId: 'exp-entry',
      });

      const result = await expirationService.processUserExpiration('user-123', 'req-partial');

      // Only expired points should be processed
      expect(result).not.toBeNull();
      expect(result!.amountExpired).toBe(100);
    });

    it('should not create negative balance', async () => {
      // Edge case: user has withdrawn some points already
      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [
          {
            accountId: 'user-123',
            amount: 100,
            metadata: { expiresAt: new Date('2025-12-31') },
          },
        ],
        totalCount: 1,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId: 'user-123',
        availableBalance: 50, // User already spent 50 points
        version: 2,
        save: jest.fn().mockResolvedValue(true),
      });

      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user-123',
        availableBalance: 0,
        version: 3,
      });

      mockLedgerService.createEntry.mockResolvedValue({
        entryId: 'exp-entry',
      });

      const result = await expirationService.processUserExpiration('user-123', 'req-no-negative');

      // Should only expire what's available
      expect(result).not.toBeNull();
      expect(result!.amountExpired).toBe(50);
    });
  });
});
