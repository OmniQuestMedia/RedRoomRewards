/**
 * Point Redemption Service Tests
 * 
 * Tests for point redemption operations including chip menu,
 * slot machine, and performance requests.
 */

import { PointRedemptionService } from './point-redemption.service';
import { IWalletService } from './types';
import { TransactionReason } from '../wallets/types';

// Mock dependencies
jest.mock('./types');

describe('PointRedemptionService', () => {
  let service: PointRedemptionService;
  let mockWalletService: jest.Mocked<IWalletService>;

  beforeEach(() => {
    // Create mock wallet service
    mockWalletService = {
      holdInEscrow: jest.fn(),
      settleEscrow: jest.fn(),
      refundEscrow: jest.fn(),
      partialSettleEscrow: jest.fn(),
      getUserBalance: jest.fn(),
      getModelBalance: jest.fn(),
    } as any;

    service = new PointRedemptionService(mockWalletService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('redeemPoints', () => {
    it('should redeem points successfully', async () => {
      // Arrange
      const userId = 'user-123';
      const amount = 100;
      
      mockWalletService.getUserBalance.mockResolvedValue({
        available: 500,
        escrow: 0,
        total: 500,
      });

      mockWalletService.holdInEscrow.mockResolvedValue({
        transactionId: 'tx-1',
        escrowId: 'esc-1',
        previousBalance: 500,
        newAvailableBalance: 400,
        escrowBalance: 100,
        timestamp: new Date(),
      });

      // Act
      const result = await service.redeemPoints({
        userId,
        amount,
        featureType: 'chip_menu',
        modelId: 'model-456',
        queueItemId: 'queue-1',
        reason: TransactionReason.CHIP_MENU_PURCHASE,
        requestId: 'req-1',
      });

      // Assert
      expect(result.amountRedeemed).toBe(amount);
      expect(result.escrowId).toBe('esc-1');
      expect(result.newAvailableBalance).toBe(400);
      expect(result.escrowBalance).toBe(100);
      expect(mockWalletService.holdInEscrow).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          amount,
          reason: TransactionReason.CHIP_MENU_PURCHASE,
          featureType: 'chip_menu',
        })
      );
    });

    it('should reject insufficient balance', async () => {
      // Arrange
      mockWalletService.getUserBalance.mockResolvedValue({
        available: 50,
        escrow: 0,
        total: 50,
      });

      // Act & Assert
      await expect(
        service.redeemPoints({
          userId: 'user-123',
          amount: 100,
          featureType: 'chip_menu',
          queueItemId: 'queue-1',
          reason: TransactionReason.CHIP_MENU_PURCHASE,
          requestId: 'req-2',
        })
      ).rejects.toThrow('Insufficient balance');
    });

    it('should reject invalid amount (too small)', async () => {
      // Act & Assert
      await expect(
        service.redeemPoints({
          userId: 'user-123',
          amount: 0,
          featureType: 'chip_menu',
          queueItemId: 'queue-1',
          reason: TransactionReason.CHIP_MENU_PURCHASE,
          requestId: 'req-3',
        })
      ).rejects.toThrow('Amount must be at least');
    });

    it('should reject invalid amount (too large)', async () => {
      // Act & Assert
      await expect(
        service.redeemPoints({
          userId: 'user-123',
          amount: 999999999,
          featureType: 'chip_menu',
          queueItemId: 'queue-1',
          reason: TransactionReason.CHIP_MENU_PURCHASE,
          requestId: 'req-4',
        })
      ).rejects.toThrow('Amount cannot exceed');
    });

    it('should reject invalid redemption reason', async () => {
      // Act & Assert
      await expect(
        service.redeemPoints({
          userId: 'user-123',
          amount: 100,
          featureType: 'chip_menu',
          queueItemId: 'queue-1',
          reason: TransactionReason.USER_SIGNUP_BONUS,
          requestId: 'req-5',
        })
      ).rejects.toThrow('Invalid redemption reason');
    });

    it('should reject invalid feature type', async () => {
      // Act & Assert
      await expect(
        service.redeemPoints({
          userId: 'user-123',
          amount: 100,
          featureType: 'invalid_feature',
          queueItemId: 'queue-1',
          reason: TransactionReason.CHIP_MENU_PURCHASE,
          requestId: 'req-6',
        })
      ).rejects.toThrow('Invalid feature type');
    });
  });

  describe('redeemForChipMenu', () => {
    it('should redeem for chip menu with correct parameters', async () => {
      // Arrange
      mockWalletService.getUserBalance.mockResolvedValue({
        available: 500,
        escrow: 0,
        total: 500,
      });

      mockWalletService.holdInEscrow.mockResolvedValue({
        transactionId: 'tx-chip',
        escrowId: 'esc-chip',
        previousBalance: 500,
        newAvailableBalance: 400,
        escrowBalance: 100,
        timestamp: new Date(),
      });

      // Act
      const result = await service.redeemForChipMenu(
        'user-123',
        'model-456',
        100,
        'dance',
        'queue-chip',
        'req-chip'
      );

      // Assert
      expect(result.amountRedeemed).toBe(100);
      expect(mockWalletService.holdInEscrow).toHaveBeenCalledWith(
        expect.objectContaining({
          featureType: 'chip_menu',
          reason: TransactionReason.CHIP_MENU_PURCHASE,
          metadata: expect.objectContaining({
            actionType: 'dance',
          }),
        })
      );
    });
  });

  describe('redeemForSlotMachine', () => {
    it('should redeem for slot machine', async () => {
      // Arrange
      mockWalletService.getUserBalance.mockResolvedValue({
        available: 200,
        escrow: 0,
        total: 200,
      });

      mockWalletService.holdInEscrow.mockResolvedValue({
        transactionId: 'tx-slot',
        escrowId: 'esc-slot',
        previousBalance: 200,
        newAvailableBalance: 150,
        escrowBalance: 50,
        timestamp: new Date(),
      });

      // Act
      const result = await service.redeemForSlotMachine(
        'user-123',
        50,
        'queue-slot',
        'req-slot'
      );

      // Assert
      expect(result.amountRedeemed).toBe(50);
      expect(mockWalletService.holdInEscrow).toHaveBeenCalledWith(
        expect.objectContaining({
          featureType: 'slot_machine',
          reason: TransactionReason.SLOT_MACHINE_PLAY,
        })
      );
    });
  });

  describe('redeemForSpinWheel', () => {
    it('should redeem for spin wheel', async () => {
      // Arrange
      mockWalletService.getUserBalance.mockResolvedValue({
        available: 300,
        escrow: 0,
        total: 300,
      });

      mockWalletService.holdInEscrow.mockResolvedValue({
        transactionId: 'tx-spin',
        escrowId: 'esc-spin',
        previousBalance: 300,
        newAvailableBalance: 275,
        escrowBalance: 25,
        timestamp: new Date(),
      });

      // Act
      const result = await service.redeemForSpinWheel(
        'user-123',
        25,
        'queue-spin',
        'req-spin'
      );

      // Assert
      expect(result.amountRedeemed).toBe(25);
      expect(mockWalletService.holdInEscrow).toHaveBeenCalledWith(
        expect.objectContaining({
          featureType: 'spin_wheel',
          reason: TransactionReason.SPIN_WHEEL_PLAY,
        })
      );
    });
  });

  describe('redeemForPerformance', () => {
    it('should redeem for performance request', async () => {
      // Arrange
      mockWalletService.getUserBalance.mockResolvedValue({
        available: 1000,
        escrow: 0,
        total: 1000,
      });

      mockWalletService.holdInEscrow.mockResolvedValue({
        transactionId: 'tx-perf',
        escrowId: 'esc-perf',
        previousBalance: 1000,
        newAvailableBalance: 800,
        escrowBalance: 200,
        timestamp: new Date(),
      });

      // Act
      const result = await service.redeemForPerformance(
        'user-123',
        'model-789',
        200,
        'private_show',
        'queue-perf',
        'req-perf'
      );

      // Assert
      expect(result.amountRedeemed).toBe(200);
      expect(mockWalletService.holdInEscrow).toHaveBeenCalledWith(
        expect.objectContaining({
          featureType: 'performance',
          reason: TransactionReason.PERFORMANCE_REQUEST,
          metadata: expect.objectContaining({
            performanceType: 'private_show',
          }),
        })
      );
    });
  });
});
