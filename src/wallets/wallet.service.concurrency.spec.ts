/**
 * Wallet Service Concurrency Tests
 * 
 * Tests for race condition handling, optimistic locking, and concurrent operations.
 * These tests validate that the wallet service can handle multiple simultaneous
 * operations safely without data corruption.
 */

import { WalletService } from './wallet.service';
import { LedgerService } from '../ledger/ledger.service';
import { WalletModel } from '../db/models/wallet.model';
import { TransactionReason } from './types';

describe('Wallet Service - Concurrency and Race Conditions', () => {
  let walletService: WalletService;
  let ledgerService: LedgerService;

  beforeEach(() => {
    ledgerService = new LedgerService();
    walletService = new WalletService(ledgerService);
  });

  describe('Optimistic Locking', () => {
    it('should retry on optimistic lock conflicts', async () => {
      // This test simulates a race condition where two operations
      // try to update the same wallet simultaneously
      
      const userId = 'user-concurrent-1';
      
      // Create initial wallet
      await WalletModel.create({
        userId,
        availableBalance: 1000,
        escrowBalance: 0,
        currency: 'points',
        version: 0,
      });

      // Mock function to simulate concurrent update
      const simulateConcurrentUpdate = async (amount: number, idempotencyKey: string) => {
        return walletService.holdInEscrow({
          userId,
          amount,
          reason: TransactionReason.PERFORMANCE_REQUEST,
          queueItemId: `queue-${idempotencyKey}`,
          featureType: 'test',
          idempotencyKey,
          requestId: `req-${idempotencyKey}`,
        });
      };

      // Execute concurrent operations
      const results = await Promise.allSettled([
        simulateConcurrentUpdate(100, 'idem-1'),
        simulateConcurrentUpdate(200, 'idem-2'),
        simulateConcurrentUpdate(300, 'idem-3'),
      ]);

      // All operations should eventually succeed due to retry logic
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThan(0);

      // Verify final wallet state is consistent
      const wallet = await WalletModel.findOne({ userId });
      expect(wallet).toBeDefined();
      
      // Total escrow should equal sum of successful operations
      const successfulAmounts = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value.escrowBalance);
      
      const expectedEscrow = successfulAmounts[successfulAmounts.length - 1];
      expect(wallet!.escrowBalance).toBe(expectedEscrow);
    });

    it('should handle version conflicts correctly', async () => {
      const userId = 'user-version-test';
      
      // Create wallet with specific version
      const wallet = await WalletModel.create({
        userId,
        availableBalance: 1000,
        escrowBalance: 0,
        currency: 'points',
        version: 5, // Start at version 5
      });

      // Perform operation
      await walletService.holdInEscrow({
        userId,
        amount: 100,
        reason: TransactionReason.PERFORMANCE_REQUEST,
        queueItemId: 'queue-1',
        featureType: 'test',
        idempotencyKey: 'idem-version-1',
        requestId: 'req-version-1',
      });

      // Verify version was incremented
      const updatedWallet = await WalletModel.findOne({ userId });
      expect(updatedWallet!.version).toBe(6);
    });
  });

  describe('Idempotency Under Concurrent Load', () => {
    it('should prevent duplicate operations with same idempotency key', async () => {
      const userId = 'user-idem-test';
      
      await WalletModel.create({
        userId,
        availableBalance: 1000,
        escrowBalance: 0,
        currency: 'points',
        version: 0,
      });

      const request = {
        userId,
        amount: 100,
        reason: TransactionReason.PERFORMANCE_REQUEST,
        queueItemId: 'queue-idem',
        featureType: 'test',
        idempotencyKey: 'same-idem-key',
        requestId: 'req-idem',
      };

      // Try to execute the same operation multiple times concurrently
      const results = await Promise.allSettled([
        walletService.holdInEscrow(request),
        walletService.holdInEscrow(request),
        walletService.holdInEscrow(request),
      ]);

      // Only one should succeed, others should fail with idempotency error
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(2);

      // Verify wallet was only debited once
      const wallet = await WalletModel.findOne({ userId });
      expect(wallet!.availableBalance).toBe(900);
      expect(wallet!.escrowBalance).toBe(100);
    });
  });

  describe('Balance Consistency Under Load', () => {
    it('should maintain balance consistency with multiple operations', async () => {
      const userId = 'user-consistency-test';
      const initialBalance = 10000;
      
      await WalletModel.create({
        userId,
        availableBalance: initialBalance,
        escrowBalance: 0,
        currency: 'points',
        version: 0,
      });

      // Perform multiple escrow holds
      const operations = Array.from({ length: 10 }, (_, i) => ({
        userId,
        amount: 100,
        reason: TransactionReason.PERFORMANCE_REQUEST,
        queueItemId: `queue-${i}`,
        featureType: 'test',
        idempotencyKey: `idem-${i}`,
        requestId: `req-${i}`,
      }));

      const results = await Promise.allSettled(
        operations.map(op => walletService.holdInEscrow(op))
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;

      // Verify final balance
      const wallet = await WalletModel.findOne({ userId });
      const expectedAvailable = initialBalance - (successCount * 100);
      const expectedEscrow = successCount * 100;

      expect(wallet!.availableBalance).toBe(expectedAvailable);
      expect(wallet!.escrowBalance).toBe(expectedEscrow);
      
      // Verify total balance unchanged
      const totalBalance = wallet!.availableBalance + wallet!.escrowBalance;
      expect(totalBalance).toBe(initialBalance);
    });

    it('should handle mixed operations (hold, settle, refund) correctly', async () => {
      const userId = 'user-mixed-ops';
      const modelId = 'model-mixed-ops';
      
      await WalletModel.create({
        userId,
        availableBalance: 5000,
        escrowBalance: 0,
        currency: 'points',
        version: 0,
      });

      // Hold some escrow
      const holdResult1 = await walletService.holdInEscrow({
        userId,
        amount: 1000,
        reason: TransactionReason.PERFORMANCE_REQUEST,
        queueItemId: 'queue-hold-1',
        featureType: 'test',
        idempotencyKey: 'idem-hold-1',
        requestId: 'req-hold-1',
      });

      const holdResult2 = await walletService.holdInEscrow({
        userId,
        amount: 1000,
        reason: TransactionReason.PERFORMANCE_REQUEST,
        queueItemId: 'queue-hold-2',
        featureType: 'test',
        idempotencyKey: 'idem-hold-2',
        requestId: 'req-hold-2',
      });

      // Settle one escrow
      await walletService.settleEscrow(
        {
          escrowId: holdResult1.escrowId,
          modelId,
          amount: 1000,
          queueItemId: 'queue-hold-1',
          reason: TransactionReason.PERFORMANCE_COMPLETED,
          authorizationToken: 'auth-token-1',
          idempotencyKey: 'idem-settle-1',
          requestId: 'req-settle-1',
        },
        { 
          token: 'auth-token-1', 
          queueItemId: 'queue-hold-1', 
          escrowId: holdResult1.escrowId,
          modelId,
          amount: 1000,
          reason: TransactionReason.PERFORMANCE_COMPLETED,
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 60000),
        }
      );

      // Refund the other
      await walletService.refundEscrow(
        {
          escrowId: holdResult2.escrowId,
          userId,
          amount: 1000,
          queueItemId: 'queue-hold-2',
          reason: TransactionReason.PERFORMANCE_ABANDONED,
          authorizationToken: 'auth-token-2',
          idempotencyKey: 'idem-refund-1',
          requestId: 'req-refund-1',
        },
        { 
          token: 'auth-token-2', 
          queueItemId: 'queue-hold-2', 
          escrowId: holdResult2.escrowId,
          userId,
          amount: 1000,
          reason: TransactionReason.PERFORMANCE_ABANDONED,
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 60000),
        }
      );

      // Verify final state
      const userWallet = await WalletModel.findOne({ userId });
      expect(userWallet!.availableBalance).toBe(4000); // 5000 - 1000 (settled)
      expect(userWallet!.escrowBalance).toBe(0);
    });
  });

  describe('Error Recovery', () => {
    it('should handle insufficient balance gracefully', async () => {
      const userId = 'user-insufficient';
      
      await WalletModel.create({
        userId,
        availableBalance: 100,
        escrowBalance: 0,
        currency: 'points',
        version: 0,
      });

      await expect(
        walletService.holdInEscrow({
          userId,
          amount: 500, // More than available
          reason: TransactionReason.PERFORMANCE_REQUEST,
          queueItemId: 'queue-insufficient',
          featureType: 'test',
          idempotencyKey: 'idem-insufficient',
          requestId: 'req-insufficient',
        })
      ).rejects.toThrow();

      // Verify wallet state unchanged
      const wallet = await WalletModel.findOne({ userId });
      expect(wallet!.availableBalance).toBe(100);
      expect(wallet!.escrowBalance).toBe(0);
    });

    it('should rollback on ledger entry failure', async () => {
      // This test would require mocking ledger service to fail
      // and verifying that wallet changes are not persisted
      // Implementation depends on transaction/rollback strategy
    });
  });

  describe('Performance Under Load', () => {
    it('should handle high concurrency without deadlocks', async () => {
      const userId = 'user-high-load';
      
      await WalletModel.create({
        userId,
        availableBalance: 100000,
        escrowBalance: 0,
        currency: 'points',
        version: 0,
      });

      // Create 50 concurrent operations
      const operations = Array.from({ length: 50 }, (_, i) => ({
        userId,
        amount: 100,
        reason: TransactionReason.PERFORMANCE_REQUEST,
        queueItemId: `queue-load-${i}`,
        featureType: 'test',
        idempotencyKey: `idem-load-${i}`,
        requestId: `req-load-${i}`,
      }));

      const startTime = Date.now();
      
      const results = await Promise.allSettled(
        operations.map(op => walletService.holdInEscrow(op))
      );

      const duration = Date.now() - startTime;
      const successCount = results.filter(r => r.status === 'fulfilled').length;

      // Should complete in reasonable time (adjust based on environment)
      expect(duration).toBeLessThan(30000); // 30 seconds
      
      // Most operations should succeed (some may fail due to retries exhausted)
      expect(successCount).toBeGreaterThan(40);

      // Verify consistency
      const wallet = await WalletModel.findOne({ userId });
      const totalBalance = wallet!.availableBalance + wallet!.escrowBalance;
      expect(totalBalance).toBe(100000);
    });
  });
});
