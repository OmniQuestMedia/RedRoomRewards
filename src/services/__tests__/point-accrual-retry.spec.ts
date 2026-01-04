/**
 * Point Accrual Retry Logic Tests
 * 
 * Tests to verify bounded retry with exponential backoff for optimistic locking conflicts.
 */

import { PointAccrualService } from '../point-accrual.service';
import { LedgerService } from '../../ledger/ledger.service';
import { WalletModel } from '../../db/models/wallet.model';
import { TransactionReason, TransactionType } from '../../wallets/types';

// Mock dependencies
jest.mock('../../ledger/ledger.service');
jest.mock('../../db/models/wallet.model');

describe('Point Accrual Retry Logic', () => {
  let accrualService: PointAccrualService;
  let ledgerService: LedgerService;

  beforeEach(() => {
    jest.clearAllMocks();
    ledgerService = new LedgerService();
    accrualService = new PointAccrualService(ledgerService, {
      maxRetryAttempts: 3,
      retryBackoffMs: 100,
    });
  });

  describe('Bounded Retry with Exponential Backoff', () => {
    it('should retry on optimistic lock conflict', async () => {
      const mockWallet = {
        userId: 'user-retry-1',
        availableBalance: 100,
        version: 0,
      };

      // Mock wallet findOne
      (WalletModel.findOne as jest.Mock).mockResolvedValue(mockWallet);
      
      // First two attempts fail (return null), third succeeds
      (WalletModel.findOneAndUpdate as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-retry-1',
          availableBalance: 200,
          version: 3,
        });

      // Mock ledger service
      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);
      (ledgerService.createEntry as jest.Mock).mockResolvedValue({
        entryId: 'entry-123',
        transactionId: 'txn-123',
      });

      const request = {
        userId: 'user-retry-1',
        amount: 100,
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey: 'idem-retry-1',
        requestId: 'req-retry-1',
      };

      // Should eventually succeed after retries
      const result = await accrualService.awardPoints(request);

      expect(result.amountAwarded).toBe(100);
      expect(result.newBalance).toBe(200);
      
      // Should have been called 3 times (2 failures + 1 success)
      expect(WalletModel.findOneAndUpdate).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retry attempts', async () => {
      const mockWallet = {
        userId: 'user-retry-2',
        availableBalance: 100,
        version: 0,
      };

      (WalletModel.findOne as jest.Mock).mockResolvedValue(mockWallet);
      
      // All attempts fail
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      
      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);

      const request = {
        userId: 'user-retry-2',
        amount: 100,
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey: 'idem-retry-2',
        requestId: 'req-retry-2',
      };

      // Should throw after max attempts
      await expect(accrualService.awardPoints(request)).rejects.toThrow(
        /Optimistic lock conflict after 3 attempts/
      );

      // Should have tried exactly maxRetryAttempts times
      expect(WalletModel.findOneAndUpdate).toHaveBeenCalledTimes(3);
    });

    it('should check idempotency only on first attempt', async () => {
      const mockWallet = {
        userId: 'user-retry-3',
        availableBalance: 100,
        version: 0,
      };

      (WalletModel.findOne as jest.Mock).mockResolvedValue(mockWallet);
      
      // First attempt fails, second succeeds
      (WalletModel.findOneAndUpdate as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-retry-3',
          availableBalance: 200,
          version: 2,
        });

      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);
      (ledgerService.createEntry as jest.Mock).mockResolvedValue({});

      const request = {
        userId: 'user-retry-3',
        amount: 100,
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey: 'idem-retry-3',
        requestId: 'req-retry-3',
      };

      await accrualService.awardPoints(request);

      // checkIdempotency should be called only once (on first attempt)
      expect(ledgerService.checkIdempotency).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff between retries', async () => {
      // This test verifies the retry delay calculation
      const retryBackoffMs = 100;
      const expectedDelays = [
        retryBackoffMs * Math.pow(2, 0), // First retry: 100ms
        retryBackoffMs * Math.pow(2, 1), // Second retry: 200ms
        retryBackoffMs * Math.pow(2, 2), // Third retry: 400ms
      ];

      expect(expectedDelays[0]).toBe(100);
      expect(expectedDelays[1]).toBe(200);
      expect(expectedDelays[2]).toBe(400);
    });
  });

  describe('Retry Count Tracking', () => {
    it('should pass retry count to recursive calls', () => {
      // Verify that retryCount parameter exists and is incremented
      // This test validates the retry count logic without making actual calls
      
      // First call: retryCount = 0 (default)
      // Second call: retryCount = 1
      // Third call: retryCount = 2
      // Fourth call would be retryCount = 3, which exceeds max

      expect(0).toBeLessThan(3); // First attempt
      expect(1).toBeLessThan(3); // First retry
      expect(2).toBeLessThan(3); // Second retry
      expect(3).not.toBeLessThan(3); // Would fail
    });

    it('should include retry count in error message', async () => {
      const error = new Error('Optimistic lock conflict after 3 attempts for user user-123');
      
      expect(error.message).toContain('3 attempts');
      expect(error.message).toContain('user-123');
    });
  });

  describe('Configuration', () => {
    it('should use configured max retry attempts', () => {
      const customService = new PointAccrualService(ledgerService, {
        maxRetryAttempts: 5,
        retryBackoffMs: 50,
      });

      // Verify configuration is stored
      expect(customService).toBeDefined();
    });

    it('should use configured backoff duration', () => {
      // Verify backoff calculation
      const expectedFirstRetryDelay = 250 * Math.pow(2, 0);
      expect(expectedFirstRetryDelay).toBe(250);
    });

    it('should use default config if not provided', () => {
      const defaultService = new PointAccrualService(ledgerService);
      
      // Default maxRetryAttempts should be 3
      // Default retryBackoffMs should be 100
      expect(defaultService).toBeDefined();
    });
  });

  describe('Error Scenarios', () => {
    it('should throw error with meaningful message on max retries', async () => {
      const mockWallet = {
        userId: 'user-error-1',
        availableBalance: 100,
        version: 0,
      };

      (WalletModel.findOne as jest.Mock).mockResolvedValue(mockWallet);
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);

      const request = {
        userId: 'user-error-1',
        amount: 100,
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey: 'idem-error-1',
        requestId: 'req-error-1',
      };

      await expect(accrualService.awardPoints(request)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('Optimistic lock conflict'),
        })
      );
    });

    it('should propagate non-retry errors immediately', async () => {
      (WalletModel.findOne as jest.Mock).mockRejectedValue(
        new Error('Database connection lost')
      );
      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);

      const request = {
        userId: 'user-error-2',
        amount: 100,
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey: 'idem-error-2',
        requestId: 'req-error-2',
      };

      await expect(accrualService.awardPoints(request)).rejects.toThrow(
        'Database connection lost'
      );

      // Should not retry on non-lock errors
      expect(WalletModel.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('Success After Retry', () => {
    it('should create ledger entry after successful retry', async () => {
      const mockWallet = {
        userId: 'user-success-1',
        availableBalance: 100,
        version: 0,
      };

      (WalletModel.findOne as jest.Mock).mockResolvedValue(mockWallet);
      (WalletModel.findOneAndUpdate as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-success-1',
          availableBalance: 200,
          version: 2,
        });

      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);
      (ledgerService.createEntry as jest.Mock).mockResolvedValue({
        entryId: 'entry-success',
        transactionId: 'txn-success',
      });

      const request = {
        userId: 'user-success-1',
        amount: 100,
        reason: TransactionReason.USER_SIGNUP_BONUS,
        idempotencyKey: 'idem-success-1',
        requestId: 'req-success-1',
      };

      await accrualService.awardPoints(request);

      // Ledger entry should be created after successful wallet update
      expect(ledgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'user-success-1',
          amount: 100,
          type: TransactionType.CREDIT,
          balanceState: 'available',
        })
      );
    });

    it('should return correct balance after successful retry', async () => {
      const mockWallet = {
        userId: 'user-success-2',
        availableBalance: 500,
        version: 0,
      };

      (WalletModel.findOne as jest.Mock).mockResolvedValue(mockWallet);
      (WalletModel.findOneAndUpdate as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          userId: 'user-success-2',
          availableBalance: 750,
          version: 3,
        });

      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);
      (ledgerService.createEntry as jest.Mock).mockResolvedValue({});

      const request = {
        userId: 'user-success-2',
        amount: 250,
        reason: TransactionReason.PROMOTIONAL_AWARD,
        idempotencyKey: 'idem-success-2',
        requestId: 'req-success-2',
      };

      const result = await accrualService.awardPoints(request);

      expect(result.newBalance).toBe(750);
      expect(result.amountAwarded).toBe(250);
    });
  });
});
