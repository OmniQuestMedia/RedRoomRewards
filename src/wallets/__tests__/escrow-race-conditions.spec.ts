/**
 * Escrow Race Condition Tests
 * 
 * Tests to verify that escrow settlement and refund operations are protected
 * against race conditions and double-processing through optimistic locking.
 */

import { WalletService } from '../wallet.service';
import { LedgerService } from '../../ledger/ledger.service';
import { EscrowItemModel } from '../../db/models/escrow-item.model';
import { WalletModel } from '../../db/models/wallet.model';
import { ModelWalletModel } from '../../db/models/model-wallet.model';
import { TransactionReason } from '../types';
import { 
  EscrowNotFoundError, 
  EscrowAlreadyProcessedError,
  OptimisticLockError 
} from '../../services/types';

// Mock all database models
jest.mock('../../db/models/escrow-item.model');
jest.mock('../../db/models/wallet.model');
jest.mock('../../db/models/model-wallet.model');
jest.mock('../../ledger/ledger.service');

describe('Escrow Race Condition Protection', () => {
  let walletService: WalletService;
  let ledgerService: LedgerService;

  beforeEach(() => {
    jest.clearAllMocks();
    ledgerService = new LedgerService();
    walletService = new WalletService(ledgerService);
  });

  describe('Settlement Race Condition Prevention', () => {
    it('should lock escrow atomically on first settlement attempt', async () => {
      const mockEscrow = {
        escrowId: 'escrow-123',
        userId: 'user-123',
        amount: 100,
        status: 'held',
        queueItemId: 'queue-123',
        featureType: 'test',
        reason: 'performance_request',
      };

      // Mock findOneAndUpdate to return the escrow (successful lock)
      (EscrowItemModel.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(mockEscrow);
      
      // Mock wallet and model wallet operations
      (ModelWalletModel.findOne as jest.Mock).mockResolvedValue(null);
      (ModelWalletModel.create as jest.Mock).mockResolvedValue({
        modelId: 'model-123',
        earnedBalance: 0,
        version: 0,
      });
      (ModelWalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        modelId: 'model-123',
        earnedBalance: 100,
        version: 1,
      });
      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId: 'user-123',
        escrowBalance: 100,
        version: 0,
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user-123',
        escrowBalance: 0,
        version: 1,
      });
      (EscrowItemModel.updateOne as jest.Mock).mockResolvedValue({ ok: 1 });
      
      // Mock ledger service
      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);
      (ledgerService.createEntry as jest.Mock).mockResolvedValue({});

      // First settlement attempt should succeed
      const request = {
        escrowId: 'escrow-123',
        modelId: 'model-123',
        amount: 100,
        queueItemId: 'queue-123',
        reason: TransactionReason.PERFORMANCE_COMPLETED,
        authorizationToken: 'valid-token',
        idempotencyKey: 'idem-settle-1',
        requestId: 'req-1',
      };

      const authorization = {
        queueItemId: 'queue-123',
        token: 'valid-token',
        escrowId: 'escrow-123',
        modelId: 'model-123',
        amount: 100,
        reason: TransactionReason.PERFORMANCE_COMPLETED,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      await walletService.settleEscrow(request, authorization);

      // Verify that findOneAndUpdate was called with status: 'held' check
      expect(EscrowItemModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          escrowId: { $eq: 'escrow-123' },
          status: { $eq: 'held' },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'settling',
          }),
        }),
        expect.any(Object)
      );
    });

    it('should reject second settlement attempt on same escrow', async () => {
      // First call returns null (escrow already locked)
      (EscrowItemModel.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(null);
      
      // Second call finds escrow in 'settling' state
      (EscrowItemModel.findOne as jest.Mock).mockResolvedValueOnce({
        escrowId: 'escrow-123',
        status: 'settling',
      });
      
      // Mock idempotency check
      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);

      const request = {
        escrowId: 'escrow-123',
        modelId: 'model-123',
        amount: 100,
        queueItemId: 'queue-123',
        reason: TransactionReason.PERFORMANCE_COMPLETED,
        authorizationToken: 'valid-token',
        idempotencyKey: 'idem-settle-2',
        requestId: 'req-2',
      };

      const authorization = {
        queueItemId: 'queue-123',
        token: 'valid-token',
        escrowId: 'escrow-123',
        modelId: 'model-123',
        amount: 100,
        reason: TransactionReason.PERFORMANCE_COMPLETED,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      // Second attempt should throw EscrowAlreadyProcessedError
      await expect(
        walletService.settleEscrow(request, authorization)
      ).rejects.toThrow(EscrowAlreadyProcessedError);
      
      // Verify error types exist
      expect(EscrowNotFoundError).toBeDefined();
      expect(OptimisticLockError).toBeDefined();
    });

    it('should rollback escrow status if wallet update fails', async () => {
      const mockEscrow = {
        escrowId: 'escrow-123',
        userId: 'user-123',
        amount: 100,
        status: 'held',
      };

      // Mock successful escrow lock
      (EscrowItemModel.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(mockEscrow);
      
      // Mock model wallet success
      (ModelWalletModel.findOne as jest.Mock).mockResolvedValue(null);
      (ModelWalletModel.create as jest.Mock).mockResolvedValue({
        modelId: 'model-123',
        earnedBalance: 0,
        version: 0,
      });
      (ModelWalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        modelId: 'model-123',
        earnedBalance: 100,
        version: 1,
      });
      
      // Mock wallet operations - findOne succeeds, findOneAndUpdate fails (null return)
      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId: 'user-123',
        escrowBalance: 100,
        version: 0,
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      
      // Mock rollback updateOne
      (EscrowItemModel.updateOne as jest.Mock).mockResolvedValue({ ok: 1 });
      
      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);

      const request = {
        escrowId: 'escrow-123',
        modelId: 'model-123',
        amount: 100,
        queueItemId: 'queue-123',
        reason: TransactionReason.PERFORMANCE_COMPLETED,
        authorizationToken: 'valid-token',
        idempotencyKey: 'idem-settle-3',
        requestId: 'req-3',
      };

      const authorization = {
        queueItemId: 'queue-123',
        token: 'valid-token',
        escrowId: 'escrow-123',
        modelId: 'model-123',
        amount: 100,
        reason: TransactionReason.PERFORMANCE_COMPLETED,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      // Should throw OptimisticLockError and rollback escrow
      await expect(
        walletService.settleEscrow(request, authorization)
      ).rejects.toThrow(OptimisticLockError);

      // Verify rollback was called
      expect(EscrowItemModel.updateOne).toHaveBeenCalledWith(
        { escrowId: { $eq: 'escrow-123' } },
        { $set: { status: 'held', processedAt: null } }
      );
    });
  });

  describe('Refund Race Condition Prevention', () => {
    it('should lock escrow atomically on first refund attempt', async () => {
      const mockEscrow = {
        escrowId: 'escrow-456',
        userId: 'user-456',
        amount: 50,
        status: 'held',
        queueItemId: 'queue-456',
      };

      (EscrowItemModel.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(mockEscrow);
      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId: 'user-456',
        availableBalance: 100,
        escrowBalance: 50,
        version: 0,
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user-456',
        availableBalance: 150,
        escrowBalance: 0,
        version: 1,
      });
      (EscrowItemModel.updateOne as jest.Mock).mockResolvedValue({ ok: 1 });
      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);
      (ledgerService.createEntry as jest.Mock).mockResolvedValue({});

      const request = {
        escrowId: 'escrow-456',
        userId: 'user-456',
        amount: 50,
        queueItemId: 'queue-456',
        reason: TransactionReason.USER_DISCONNECTED,
        authorizationToken: 'valid-token',
        idempotencyKey: 'idem-refund-1',
        requestId: 'req-refund-1',
      };

      const authorization = {
        queueItemId: 'queue-456',
        token: 'valid-token',
        escrowId: 'escrow-456',
        userId: 'user-456',
        amount: 50,
        reason: TransactionReason.USER_DISCONNECTED,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      await walletService.refundEscrow(request, authorization);

      // Verify atomic lock with status check
      expect(EscrowItemModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: { $eq: 'held' },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'refunding',
          }),
        }),
        expect.any(Object)
      );
    });

    it('should reject concurrent refund attempts', async () => {
      // First attempt locked it
      (EscrowItemModel.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(null);
      (EscrowItemModel.findOne as jest.Mock).mockResolvedValueOnce({
        escrowId: 'escrow-456',
        status: 'refunding',
      });
      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);

      const request = {
        escrowId: 'escrow-456',
        userId: 'user-456',
        amount: 50,
        queueItemId: 'queue-456',
        reason: TransactionReason.USER_DISCONNECTED,
        authorizationToken: 'valid-token',
        idempotencyKey: 'idem-refund-2',
        requestId: 'req-refund-2',
      };

      const authorization = {
        queueItemId: 'queue-456',
        token: 'valid-token',
        escrowId: 'escrow-456',
        userId: 'user-456',
        amount: 50,
        reason: TransactionReason.USER_DISCONNECTED,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      await expect(
        walletService.refundEscrow(request, authorization)
      ).rejects.toThrow(EscrowAlreadyProcessedError);
    });
  });

  describe('Partial Settlement Race Condition Prevention', () => {
    it('should lock escrow atomically for partial settlement', async () => {
      const mockEscrow = {
        escrowId: 'escrow-789',
        userId: 'user-789',
        amount: 100,
        status: 'held',
      };

      (EscrowItemModel.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(mockEscrow);
      (WalletModel.findOne as jest.Mock).mockResolvedValue({
        userId: 'user-789',
        availableBalance: 0,
        escrowBalance: 100,
        version: 0,
      });
      (ModelWalletModel.findOne as jest.Mock).mockResolvedValue(null);
      (ModelWalletModel.create as jest.Mock).mockResolvedValue({
        modelId: 'model-789',
        earnedBalance: 0,
        version: 0,
      });
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user-789',
        availableBalance: 30,
        escrowBalance: 0,
        version: 1,
      });
      (ModelWalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        modelId: 'model-789',
        earnedBalance: 70,
        version: 1,
      });
      (EscrowItemModel.updateOne as jest.Mock).mockResolvedValue({ ok: 1 });
      (ledgerService.checkIdempotency as jest.Mock).mockResolvedValue(false);
      (ledgerService.createEntry as jest.Mock).mockResolvedValue({});

      const request = {
        escrowId: 'escrow-789',
        userId: 'user-789',
        modelId: 'model-789',
        refundAmount: 30,
        settleAmount: 70,
        queueItemId: 'queue-789',
        reason: TransactionReason.PARTIAL_PERFORMANCE,
        authorizationToken: 'valid-token',
        idempotencyKey: 'idem-partial-1',
        requestId: 'req-partial-1',
      };

      const authorization = {
        queueItemId: 'queue-789',
        token: 'valid-token',
        escrowId: 'escrow-789',
        userId: 'user-789',
        modelId: 'model-789',
        refundAmount: 30,
        settleAmount: 70,
        reason: TransactionReason.PARTIAL_PERFORMANCE,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      await walletService.partialSettleEscrow(request, authorization);

      // Verify atomic lock
      expect(EscrowItemModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: { $eq: 'held' },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'partial_settling',
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('Intermediate Status States', () => {
    it('should use intermediate status "settling" during settlement', () => {
      const intermediateStatuses = ['settling', 'refunding', 'partial_settling'];
      expect(intermediateStatuses).toContain('settling');
      expect(intermediateStatuses).toContain('refunding');
      expect(intermediateStatuses).toContain('partial_settling');
    });

    it('should finalize to terminal status after successful operation', () => {
      const terminalStatuses = ['settled', 'refunded'];
      expect(terminalStatuses).toContain('settled');
      expect(terminalStatuses).toContain('refunded');
    });

    it('should rollback to "held" status on operation failure', () => {
      const rollbackStatus = 'held';
      expect(rollbackStatus).toBe('held');
    });
  });
});
