/**
 * Comprehensive Point Expiration Service Tests
 * 
 * Tests point expiration logic, batch processing, and edge cases
 * as specified in TEST_STRATEGY.md
 */

import { PointExpirationService } from '../point-expiration.service';
import { TransactionType, TransactionReason } from '../../wallets/types';

// Mock implementations
const mockLedgerService = {
  createEntry: jest.fn(),
  queryEntries: jest.fn(),
  getBalanceSnapshot: jest.fn(),
};

const mockWalletModel = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
};

jest.mock('../../db/models/wallet.model', () => ({
  WalletModel: mockWalletModel,
}));

describe('PointExpirationService - Comprehensive Tests', () => {
  let expirationService: PointExpirationService;

  beforeEach(() => {
    jest.clearAllMocks();
    expirationService = new PointExpirationService(mockLedgerService as any);
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
        pagination: { total: 2, limit: 100, offset: 0 },
      });

      mockWalletModel.findOne.mockResolvedValue({
        userId,
        availableBalance: 150,
        escrowBalance: 0,
        version: 5,
        save: jest.fn().mockResolvedValue(true),
      });

      mockLedgerService.createEntry.mockResolvedValue({
        entryId: 'expiration-entry',
      });

      // Act
      const result = await expirationService.processUserExpiration({
        userId,
        asOfDate: new Date('2026-01-03'),
      });

      // Assert
      expect(result.amountExpired).toBe(150); // 100 + 50
      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.DEBIT,
          amount: -150,
          reason: TransactionReason.POINTS_EXPIRED,
        })
      );
    });

    it('should handle users with no expired points', async () => {
      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [],
        pagination: { total: 0, limit: 100, offset: 0 },
      });

      const result = await expirationService.processUserExpiration({
        userId: 'user-no-expired',
        asOfDate: new Date(),
      });

      expect(result.amountExpired).toBe(0);
      expect(mockLedgerService.createEntry).not.toHaveBeenCalled();
    });

    it('should respect grace period', async () => {
      const expirationDate = new Date('2026-01-01');
      const checkDate = new Date('2026-01-02');
      const gracePeriodDays = 3;

      expirationService = new PointExpirationService(mockLedgerService as any, {
        gracePeriodDays,
      });

      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [
          {
            entryId: 'entry-1',
            accountId: 'user-123',
            amount: 100,
            metadata: { expiresAt: expirationDate },
          },
        ],
        pagination: { total: 1, limit: 100, offset: 0 },
      });

      // Check before grace period ends
      const result = await expirationService.processUserExpiration({
        userId: 'user-123',
        asOfDate: checkDate, // Only 1 day after expiration, grace period is 3 days
      });

      // Should not expire yet
      expect(result.amountExpired).toBe(0);
      expect(mockLedgerService.createEntry).not.toHaveBeenCalled();
    });

    it('should create deterministic idempotency key', async () => {
      const userId = 'user-123';
      const asOfDate = new Date('2026-01-03');

      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [
          {
            entryId: 'entry-1',
            accountId: userId,
            amount: 100,
            metadata: { expiresAt: new Date('2025-12-31') },
          },
        ],
        pagination: { total: 1, limit: 100, offset: 0 },
      });

      mockWalletModel.findOne.mockResolvedValue({
        userId,
        availableBalance: 100,
        version: 1,
        save: jest.fn().mockResolvedValue(true),
      });

      mockLedgerService.createEntry.mockResolvedValue({
        entryId: 'exp-entry',
      });

      await expirationService.processUserExpiration({
        userId,
        asOfDate,
      });

      // Idempotency key should be based on userId and date
      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: expect.stringContaining(userId),
        })
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

      // Mock getUsersWithExpiringPoints
      jest.spyOn(expirationService, 'getUsersWithExpiringPoints').mockResolvedValue(
        usersWithExpiringPoints.map((u) => ({
          userId: u.userId,
          pointsExpiring: u.amountExpiring,
          expirationDate: new Date('2025-12-31'),
          daysUntilExpiration: 0,
        }))
      );

      // Mock processUserExpiration for each user
      jest
        .spyOn(expirationService, 'processUserExpiration')
        .mockImplementation(async ({ userId }) => {
          const user = usersWithExpiringPoints.find((u) => u.userId === userId);
          return {
            userId,
            amountExpired: user?.amountExpiring || 0,
            transactionId: `txn-${userId}`,
            timestamp: new Date(),
          };
        });

      // Act
      const result = await expirationService.processBatchExpiration({
        batchSize: 100,
        asOfDate: new Date('2026-01-03'),
      });

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

      jest.spyOn(expirationService, 'getUsersWithExpiringPoints').mockResolvedValue(
        usersWithExpiringPoints.map((u) => ({
          userId: u.userId,
          pointsExpiring: u.amountExpiring,
          expirationDate: new Date('2025-12-31'),
          daysUntilExpiration: 0,
        }))
      );

      jest
        .spyOn(expirationService, 'processUserExpiration')
        .mockImplementation(async ({ userId }) => {
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

      const result = await expirationService.processBatchExpiration({
        batchSize: 100,
        asOfDate: new Date(),
      });

      expect(result.usersProcessed).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].userId).toBe('user-2');
    });

    it('should respect batch size', async () => {
      const batchSize = 2;
      const allUsers = [
        { userId: 'user-1', pointsExpiring: 100 },
        { userId: 'user-2', pointsExpiring: 50 },
        { userId: 'user-3', pointsExpiring: 200 },
      ];

      jest
        .spyOn(expirationService, 'getUsersWithExpiringPoints')
        .mockResolvedValue(
          allUsers.map((u) => ({
            ...u,
            expirationDate: new Date('2025-12-31'),
            daysUntilExpiration: 0,
          }))
        );

      jest.spyOn(expirationService, 'processUserExpiration').mockResolvedValue({
        userId: 'user-1',
        amountExpired: 100,
        transactionId: 'txn-1',
        timestamp: new Date(),
      });

      await expirationService.processBatchExpiration({
        batchSize,
        asOfDate: new Date(),
      });

      // Should only process batchSize number of users
      expect(expirationService.processUserExpiration).toHaveBeenCalledTimes(
        batchSize
      );
    });
  });

  describe('getUsersWithExpiringPoints', () => {
    it('should return users with points expiring soon', async () => {
      const daysAhead = 7;
      const mockUsers = [
        {
          userId: 'user-1',
          availableBalance: 100,
        },
        {
          userId: 'user-2',
          availableBalance: 50,
        },
      ];

      mockWalletModel.find.mockResolvedValue(mockUsers);

      mockLedgerService.queryEntries
        .mockResolvedValueOnce({
          // user-1
          entries: [
            {
              accountId: 'user-1',
              amount: 100,
              metadata: {
                expiresAt: new Date(
                  Date.now() + 5 * 24 * 60 * 60 * 1000
                ), // 5 days from now
              },
            },
          ],
          pagination: { total: 1, limit: 100, offset: 0 },
        })
        .mockResolvedValueOnce({
          // user-2
          entries: [
            {
              accountId: 'user-2',
              amount: 50,
              metadata: {
                expiresAt: new Date(
                  Date.now() + 3 * 24 * 60 * 60 * 1000
                ), // 3 days from now
              },
            },
          ],
          pagination: { total: 1, limit: 100, offset: 0 },
        });

      const result = await expirationService.getUsersWithExpiringPoints({
        daysAhead,
      });

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe('user-1');
      expect(result[0].pointsExpiring).toBe(100);
      expect(result[1].userId).toBe('user-2');
      expect(result[1].pointsExpiring).toBe(50);
    });

    it('should not include users with no expiring points', async () => {
      mockWalletModel.find.mockResolvedValue([
        { userId: 'user-no-expiration', availableBalance: 100 },
      ]);

      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [], // No entries with expiration dates
        pagination: { total: 0, limit: 100, offset: 0 },
      });

      const result = await expirationService.getUsersWithExpiringPoints({
        daysAhead: 7,
      });

      expect(result).toHaveLength(0);
    });

    it('should calculate days until expiration correctly', async () => {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 5); // 5 days from now

      mockWalletModel.find.mockResolvedValue([
        { userId: 'user-1', availableBalance: 100 },
      ]);

      mockLedgerService.queryEntries.mockResolvedValue({
        entries: [
          {
            accountId: 'user-1',
            amount: 100,
            metadata: { expiresAt: expirationDate },
          },
        ],
        pagination: { total: 1, limit: 100, offset: 0 },
      });

      const result = await expirationService.getUsersWithExpiringPoints({
        daysAhead: 7,
      });

      expect(result[0].daysUntilExpiration).toBe(5);
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
        pagination: { total: 2, limit: 100, offset: 0 },
      });

      mockWalletModel.findOne.mockResolvedValue({
        userId: 'user-123',
        availableBalance: 200,
        version: 1,
        save: jest.fn().mockResolvedValue(true),
      });

      mockLedgerService.createEntry.mockResolvedValue({
        entryId: 'exp-entry',
      });

      const result = await expirationService.processUserExpiration({
        userId: 'user-123',
        asOfDate: new Date('2026-01-03'),
      });

      // Only expired points should be processed
      expect(result.amountExpired).toBe(100);
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
        pagination: { total: 1, limit: 100, offset: 0 },
      });

      mockWalletModel.findOne.mockResolvedValue({
        userId: 'user-123',
        availableBalance: 50, // User already spent 50 points
        version: 2,
        save: jest.fn().mockResolvedValue(true),
      });

      mockLedgerService.createEntry.mockResolvedValue({
        entryId: 'exp-entry',
      });

      const result = await expirationService.processUserExpiration({
        userId: 'user-123',
        asOfDate: new Date('2026-01-03'),
      });

      // Should only expire what's available
      expect(result.amountExpired).toBe(50);
    });
  });
});
