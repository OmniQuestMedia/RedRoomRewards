/**
 * Point Accrual Service Tests
 * 
 * Tests for point earning operations including signups, referrals,
 * promotions, and admin credits.
 */

import { PointAccrualService } from './point-accrual.service';
import { ILedgerService } from '../ledger/types';
import { TransactionReason } from '../wallets/types';
import { WalletModel } from '../db/models/wallet.model';

// Mock dependencies
jest.mock('../db/models/wallet.model');
jest.mock('../ledger/types');

describe('PointAccrualService', () => {
  let service: PointAccrualService;
  let mockLedgerService: jest.Mocked<ILedgerService>;

  beforeEach(() => {
    // Create mock ledger service
    mockLedgerService = {
      createEntry: jest.fn(),
      queryEntries: jest.fn(),
      getEntry: jest.fn(),
      getBalanceSnapshot: jest.fn(),
      generateReconciliationReport: jest.fn(),
      getAuditTrail: jest.fn(),
      checkIdempotency: jest.fn().mockResolvedValue(false),
      storeIdempotencyResult: jest.fn(),
    } as any;

    service = new PointAccrualService(mockLedgerService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('awardPoints', () => {
    it('should award points to a user with new wallet', async () => {
      // Arrange
      const userId = 'user-123';
      const amount = 100;
      
      (WalletModel.findOne as jest.Mock).mockResolvedValue(null);
      (WalletModel.create as jest.Mock).mockResolvedValue({
        userId,
        availableBalance: 0,
        escrowBalance: 0,
        version: 0,
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId,
        availableBalance: amount,
        escrowBalance: 0,
        version: 1,
      });

      mockLedgerService.createEntry.mockResolvedValue({
        entryId: 'entry-1',
        transactionId: 'tx-1',
        accountId: userId,
        accountType: 'user',
        amount,
        type: 'credit',
        balanceState: 'available',
        stateTransition: 'none→available',
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey: 'key-1',
        requestId: 'req-1',
        balanceBefore: 0,
        balanceAfter: amount,
        timestamp: new Date(),
        currency: 'points',
      } as any);

      // Act
      const result = await service.awardPoints({
        userId,
        amount,
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      });

      // Assert
      expect(result.amountAwarded).toBe(amount);
      expect(result.newBalance).toBe(amount);
      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: userId,
          amount,
          type: 'credit',
          reason: TransactionReason.USER_SIGNUP_BONUS,
        })
      );
    });

    it('should award points to existing wallet', async () => {
      // Arrange
      const userId = 'user-123';
      const amount = 50;
      const existingBalance = 100;
      
      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId,
        availableBalance: existingBalance,
        escrowBalance: 0,
        version: 5,
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId,
        availableBalance: existingBalance + amount,
        escrowBalance: 0,
        version: 6,
      });

      mockLedgerService.createEntry.mockResolvedValue({} as any);

      // Act
      const result = await service.awardPoints({
        userId,
        amount,
        reason: TransactionReason.PROMOTIONAL_AWARD,
        idempotencyKey: 'key-2',
        requestId: 'req-2',
      });

      // Assert
      expect(result.newBalance).toBe(existingBalance + amount);
      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          balanceBefore: existingBalance,
          balanceAfter: existingBalance + amount,
        })
      );
    });

    it('should reject invalid amount (too small)', async () => {
      // Act & Assert
      await expect(
        service.awardPoints({
          userId: 'user-123',
          amount: 0,
          reason: TransactionReason.USER_SIGNUP_BONUS,
          idempotencyKey: 'key-3',
          requestId: 'req-3',
        })
      ).rejects.toThrow('Amount must be a positive finite number');
    });

    it('should reject invalid amount (too large)', async () => {
      // Act & Assert
      await expect(
        service.awardPoints({
          userId: 'user-123',
          amount: 9999999999,
          reason: TransactionReason.USER_SIGNUP_BONUS,
          idempotencyKey: 'key-4',
          requestId: 'req-4',
        })
      ).rejects.toThrow('Amount cannot exceed');
    });

    it('should reject invalid reason (not an earning reason)', async () => {
      // Act & Assert
      await expect(
        service.awardPoints({
          userId: 'user-123',
          amount: 100,
          reason: TransactionReason.CHIP_MENU_PURCHASE,
          idempotencyKey: 'key-5',
          requestId: 'req-5',
        })
      ).rejects.toThrow('Invalid earning reason');
    });

    it('should reject duplicate idempotency key', async () => {
      // Arrange
      mockLedgerService.checkIdempotency.mockResolvedValue(true);

      // Act & Assert
      await expect(
        service.awardPoints({
          userId: 'user-123',
          amount: 100,
          reason: TransactionReason.USER_SIGNUP_BONUS,
          idempotencyKey: 'duplicate-key',
          requestId: 'req-6',
        })
      ).rejects.toThrow('Idempotency key already used');
    });
  });

  describe('awardSignupBonus', () => {
    it('should award signup bonus with correct reason', async () => {
      // Arrange
      (WalletModel.findOne as jest.Mock).mockResolvedValue(null);
      (WalletModel.create as jest.Mock).mockResolvedValue({
        userId: 'user-new',
        availableBalance: 0,
        escrowBalance: 0,
        version: 0,
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user-new',
        availableBalance: 500,
        escrowBalance: 0,
        version: 1,
      });

      mockLedgerService.createEntry.mockResolvedValue({} as any);

      // Act
      const result = await service.awardSignupBonus('user-new', 500, 'req-signup');

      // Assert
      expect(result.amountAwarded).toBe(500);
      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: TransactionReason.USER_SIGNUP_BONUS,
        })
      );
    });
  });

  describe('awardReferralBonus', () => {
    it('should award referral bonus with metadata', async () => {
      // Arrange
      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId: 'referrer',
        availableBalance: 100,
        version: 1,
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'referrer',
        availableBalance: 200,
        version: 2,
      });

      mockLedgerService.createEntry.mockResolvedValue({} as any);

      // Act
      const result = await service.awardReferralBonus(
        'referrer',
        'referred-user',
        100,
        'req-referral'
      );

      // Assert
      expect(result.amountAwarded).toBe(100);
      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: TransactionReason.REFERRAL_BONUS,
          metadata: expect.objectContaining({
            bonusType: 'referral',
            referredUserId: 'referred-user',
          }),
        })
      );
    });
  });

  describe('awardPromotionalPoints', () => {
    it('should award promotional points with expiration', async () => {
      // Arrange
      const expiresAt = new Date('2025-12-31');
      
      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId: 'user-promo',
        availableBalance: 50,
        version: 0,
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user-promo',
        availableBalance: 150,
        version: 1,
      });

      mockLedgerService.createEntry.mockResolvedValue({} as any);

      // Act
      const result = await service.awardPromotionalPoints(
        'user-promo',
        100,
        'promo-2025',
        'req-promo',
        expiresAt
      );

      // Assert
      expect(result.amountAwarded).toBe(100);
      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: TransactionReason.PROMOTIONAL_AWARD,
          metadata: expect.objectContaining({
            promotionId: 'promo-2025',
            expiresAt: expiresAt.toISOString(),
          }),
        })
      );
    });
  });

  describe('adminCreditPoints', () => {
    it('should credit points with admin metadata', async () => {
      // Arrange
      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId: 'user-admin',
        availableBalance: 100,
        version: 2,
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user-admin',
        availableBalance: 300,
        version: 3,
      });

      mockLedgerService.createEntry.mockResolvedValue({} as any);

      // Act
      const result = await service.adminCreditPoints(
        'user-admin',
        200,
        'admin-001',
        'Compensation for service issue',
        'req-admin'
      );

      // Assert
      expect(result.amountAwarded).toBe(200);
      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: TransactionReason.ADMIN_CREDIT,
          metadata: expect.objectContaining({
            adminId: 'admin-001',
            adminReason: 'Compensation for service issue',
            operationType: 'admin_credit',
          }),
        })
      );
    });
  });
});
