/**
 * Wallet Service Implementation
 * 
 * Handles wallet operations including escrow management with optimistic locking.
 * All operations are idempotent and create immutable ledger entries.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  IWalletService,
  InsufficientBalanceError,
  EscrowNotFoundError,
  EscrowAlreadyProcessedError,
  OptimisticLockError,
  QueueSettlementAuthorization,
  QueueRefundAuthorization,
  QueuePartialSettlementAuthorization,
} from '../services/types';
import {
  EscrowHoldRequest,
  EscrowHoldResponse,
  EscrowSettleRequest,
  EscrowSettleResponse,
  EscrowRefundRequest,
  EscrowRefundResponse,
  EscrowPartialSettleRequest,
  EscrowPartialSettleResponse,
  TransactionType,
} from '../wallets/types';
import { WalletModel } from '../db/models/wallet.model';
import { ModelWalletModel } from '../db/models/model-wallet.model';
import { EscrowItemModel } from '../db/models/escrow-item.model';
import { ILedgerService } from '../ledger/types';

/**
 * Wallet Service configuration
 */
export interface WalletServiceConfigOptions {
  maxRetryAttempts: number;
  retryBackoffMs: number;
  defaultCurrency: string;
}

const DEFAULT_CONFIG: WalletServiceConfigOptions = {
  maxRetryAttempts: 3,
  retryBackoffMs: 100,
  defaultCurrency: 'points',
};

/**
 * WalletService implementation
 */
export class WalletService implements IWalletService {
  private config: WalletServiceConfigOptions;
  private ledgerService: ILedgerService;

  constructor(ledgerService: ILedgerService, config: Partial<WalletServiceConfigOptions> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ledgerService = ledgerService;
  }

  /**
   * Hold funds in escrow (deduct from available balance)
   */
  async holdInEscrow(request: EscrowHoldRequest): Promise<EscrowHoldResponse> {
    // Check idempotency
    const exists = await this.ledgerService.checkIdempotency(
      request.idempotencyKey,
      'hold_escrow'
    );
    if (exists) {
      throw new Error('Idempotency key already used');
    }

    // Attempt with retries for optimistic lock conflicts
    let attempts = 0;
    while (attempts < this.config.maxRetryAttempts) {
      try {
        return await this.executeHoldInEscrow(request);
      } catch (error) {
        if (error instanceof OptimisticLockError && attempts < this.config.maxRetryAttempts - 1) {
          attempts++;
          await this.sleep(this.config.retryBackoffMs * Math.pow(2, attempts));
          continue;
        }
        throw error;
      }
    }
    throw new OptimisticLockError('wallet', request.userId);
  }

  /**
   * Execute escrow hold operation
   */
  private async executeHoldInEscrow(request: EscrowHoldRequest): Promise<EscrowHoldResponse> {
    // Get or create wallet
    let wallet = await WalletModel.findOne({ userId: { $eq: request.userId } });
    if (!wallet) {
      wallet = await WalletModel.create({
        userId: request.userId,
        availableBalance: 0,
        escrowBalance: 0,
        currency: this.config.defaultCurrency,
        version: 0,
      });
    }

    // Check sufficient balance
    if (wallet.availableBalance < request.amount) {
      throw new InsufficientBalanceError(request.amount, wallet.availableBalance);
    }

    const previousBalance = wallet.availableBalance;
    const newAvailableBalance = wallet.availableBalance - request.amount;
    const newEscrowBalance = wallet.escrowBalance + request.amount;
    const currentVersion = wallet.version;

    // Create escrow item
    const escrowId = uuidv4();
    await EscrowItemModel.create({
      escrowId,
      userId: request.userId,
      amount: request.amount,
      status: 'held',
      queueItemId: request.queueItemId,
      featureType: request.featureType,
      reason: request.reason,
      metadata: request.metadata,
      createdAt: new Date(),
    });

    // Update wallet with optimistic locking
    const updated = await WalletModel.findOneAndUpdate(
      { 
        userId: { $eq: request.userId },
        version: { $eq: currentVersion },
      },
      {
        $set: {
          availableBalance: newAvailableBalance,
          escrowBalance: newEscrowBalance,
          version: currentVersion + 1,
        },
      },
      { new: true }
    );

    if (!updated) {
      // Optimistic lock conflict - delete escrow item and retry
      await EscrowItemModel.deleteOne({ escrowId: { $eq: escrowId } });
      throw new OptimisticLockError('wallet', request.userId);
    }

    // Create ledger entries for the transaction
    const transactionId = uuidv4();
    const timestamp = new Date();

    // Entry 1: Debit from available
    await this.ledgerService.createEntry({
      transactionId,
      accountId: request.userId,
      accountType: 'user',
      amount: -request.amount,
      type: TransactionType.DEBIT,
      balanceState: 'available',
      stateTransition: 'available→escrow',
      reason: request.reason,
      idempotencyKey: `${request.idempotencyKey}_debit`,
      requestId: request.requestId,
      balanceBefore: previousBalance,
      balanceAfter: newAvailableBalance,
      currency: this.config.defaultCurrency,
      escrowId,
      queueItemId: request.queueItemId,
      featureType: request.featureType,
      metadata: request.metadata,
    });

    // Entry 2: Credit to escrow
    await this.ledgerService.createEntry({
      transactionId,
      accountId: request.userId,
      accountType: 'user',
      amount: request.amount,
      type: TransactionType.CREDIT,
      balanceState: 'escrow',
      stateTransition: 'available→escrow',
      reason: request.reason,
      idempotencyKey: `${request.idempotencyKey}_credit`,
      requestId: request.requestId,
      balanceBefore: wallet.escrowBalance,
      balanceAfter: newEscrowBalance,
      currency: this.config.defaultCurrency,
      escrowId,
      queueItemId: request.queueItemId,
      featureType: request.featureType,
      metadata: request.metadata,
    });

    return {
      transactionId,
      escrowId,
      previousBalance,
      newAvailableBalance,
      escrowBalance: newEscrowBalance,
      timestamp,
    };
  }

  /**
   * Settle escrow to model earnings
   */
  async settleEscrow(
    request: EscrowSettleRequest,
    authorization: QueueSettlementAuthorization
  ): Promise<EscrowSettleResponse> {
    // Validate authorization token
    // Note: This requires auth service instance - in production, inject AuthService
    // and call: this.authService.validateSettlementAuthorization(authorization, request.queueItemId, request.escrowId)
    
    if (!authorization || !authorization.token) {
      throw new Error('Authorization required');
    }
    
    // Check idempotency
    const exists = await this.ledgerService.checkIdempotency(
      request.idempotencyKey,
      'settle_escrow'
    );
    if (exists) {
      throw new Error('Idempotency key already used');
    }

    // Get escrow item
    const escrow = await EscrowItemModel.findOne({ escrowId: { $eq: request.escrowId } });
    if (!escrow) {
      throw new EscrowNotFoundError(request.escrowId);
    }

    if (escrow.status !== 'held') {
      throw new EscrowAlreadyProcessedError(request.escrowId, escrow.status);
    }

    // Get or create model wallet
    let modelWallet = await ModelWalletModel.findOne({ modelId: { $eq: request.modelId } });
    if (!modelWallet) {
      modelWallet = await ModelWalletModel.create({
        modelId: request.modelId,
        earnedBalance: 0,
        currency: this.config.defaultCurrency,
        type: 'earnings',
        version: 0,
      });
    }

    const previousEarnedBalance = modelWallet.earnedBalance;
    const newEarnedBalance = modelWallet.earnedBalance + request.amount;
    const modelVersion = modelWallet.version;

    // Update model wallet with optimistic locking
    const updatedModelWallet = await ModelWalletModel.findOneAndUpdate(
      { 
        modelId: { $eq: request.modelId },
        version: { $eq: modelVersion },
      },
      {
        $set: {
          earnedBalance: newEarnedBalance,
        },
        $inc: { version: 1 },
      },
      { new: true }
    );

    if (!updatedModelWallet) {
      throw new OptimisticLockError('model_wallet', request.modelId);
    }

    // Update user wallet escrow with optimistic locking
    const userWallet = await WalletModel.findOne({ userId: { $eq: escrow.userId } });
    if (!userWallet) {
      throw new Error('User wallet not found');
    }

    const userVersion = userWallet.version;
    const updatedUserWallet = await WalletModel.findOneAndUpdate(
      { 
        userId: { $eq: escrow.userId },
        version: { $eq: userVersion },
      },
      {
        $inc: {
          escrowBalance: -request.amount,
          version: 1,
        },
      },
      { new: true }
    );

    if (!updatedUserWallet) {
      throw new OptimisticLockError('wallet', escrow.userId);
    }

    // Update escrow status
    await EscrowItemModel.updateOne(
      { escrowId: { $eq: request.escrowId } },
      {
        $set: {
          status: 'settled',
          processedAt: new Date(),
          modelId: request.modelId,
        },
      }
    );

    // Create ledger entry for model
    const transactionId = uuidv4();
    await this.ledgerService.createEntry({
      transactionId,
      accountId: request.modelId,
      accountType: 'model',
      amount: request.amount,
      type: TransactionType.CREDIT,
      balanceState: 'earned',
      stateTransition: 'escrow→earned',
      reason: request.reason,
      idempotencyKey: request.idempotencyKey,
      requestId: request.requestId,
      balanceBefore: previousEarnedBalance,
      balanceAfter: newEarnedBalance,
      currency: this.config.defaultCurrency,
      escrowId: request.escrowId,
      queueItemId: request.queueItemId,
      metadata: request.metadata,
    });

    return {
      transactionId,
      settledAmount: request.amount,
      modelEarnedBalance: newEarnedBalance,
      timestamp: new Date(),
    };
  }

  /**
   * Refund escrow to user available
   */
  async refundEscrow(
    request: EscrowRefundRequest,
    authorization: QueueRefundAuthorization
  ): Promise<EscrowRefundResponse> {
    // Validate authorization token
    // Note: This requires auth service instance - in production, inject AuthService
    // and call: this.authService.validateRefundAuthorization(authorization, request.queueItemId, request.escrowId)
    
    if (!authorization || !authorization.token) {
      throw new Error('Authorization required');
    }
    
    // Check idempotency
    const exists = await this.ledgerService.checkIdempotency(
      request.idempotencyKey,
      'refund_escrow'
    );
    if (exists) {
      throw new Error('Idempotency key already used');
    }

    // Get escrow item
    const escrow = await EscrowItemModel.findOne({ escrowId: { $eq: request.escrowId } });
    if (!escrow) {
      throw new EscrowNotFoundError(request.escrowId);
    }

    if (escrow.status !== 'held') {
      throw new EscrowAlreadyProcessedError(request.escrowId, escrow.status);
    }

    // Get user wallet
    const wallet = await WalletModel.findOne({ userId: { $eq: request.userId } });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const previousAvailableBalance = wallet.availableBalance;
    const newAvailableBalance = wallet.availableBalance + request.amount;
    const walletVersion = wallet.version;

    // Update user wallet with optimistic locking
    const updatedWallet = await WalletModel.findOneAndUpdate(
      { 
        userId: { $eq: request.userId },
        version: { $eq: walletVersion },
      },
      {
        $inc: {
          availableBalance: request.amount,
          escrowBalance: -request.amount,
          version: 1,
        },
      },
      { new: true }
    );

    if (!updatedWallet) {
      throw new OptimisticLockError('wallet', request.userId);
    }

    // Update escrow status
    await EscrowItemModel.updateOne(
      { escrowId: { $eq: request.escrowId } },
      {
        $set: {
          status: 'refunded',
          processedAt: new Date(),
        },
      }
    );

    // Create ledger entry
    const transactionId = uuidv4();
    await this.ledgerService.createEntry({
      transactionId,
      accountId: request.userId,
      accountType: 'user',
      amount: request.amount,
      type: TransactionType.CREDIT,
      balanceState: 'available',
      stateTransition: 'escrow→available',
      reason: request.reason,
      idempotencyKey: request.idempotencyKey,
      requestId: request.requestId,
      balanceBefore: previousAvailableBalance,
      balanceAfter: newAvailableBalance,
      currency: this.config.defaultCurrency,
      escrowId: request.escrowId,
      queueItemId: request.queueItemId,
      metadata: request.metadata,
    });

    return {
      transactionId,
      refundedAmount: request.amount,
      userAvailableBalance: newAvailableBalance,
      timestamp: new Date(),
    };
  }

  /**
   * Partial refund and settlement
   */
  async partialSettleEscrow(
    request: EscrowPartialSettleRequest,
    authorization: QueuePartialSettlementAuthorization
  ): Promise<EscrowPartialSettleResponse> {
    // Validate authorization token
    // Note: This requires auth service instance - in production, inject AuthService
    // and call: this.authService.validatePartialSettlementAuthorization(authorization, request.queueItemId, request.escrowId)
    
    if (!authorization || !authorization.token) {
      throw new Error('Authorization required');
    }
    
    // Check idempotency
    const exists = await this.ledgerService.checkIdempotency(
      request.idempotencyKey,
      'partial_settle_escrow'
    );
    if (exists) {
      throw new Error('Idempotency key already used');
    }

    // Get escrow item
    const escrow = await EscrowItemModel.findOne({ escrowId: { $eq: request.escrowId } });
    if (!escrow) {
      throw new EscrowNotFoundError(request.escrowId);
    }

    if (escrow.status !== 'held') {
      throw new EscrowAlreadyProcessedError(request.escrowId, escrow.status);
    }

    // Validate amounts
    const totalAmount = request.refundAmount + request.settleAmount;
    if (Math.abs(totalAmount - escrow.amount) > 0.01) {
      throw new Error('Refund + settle amounts must equal escrow amount');
    }

    // Process refund part
    const userWallet = await WalletModel.findOne({ userId: { $eq: request.userId } });
    if (!userWallet) {
      throw new Error('User wallet not found');
    }

    const newUserAvailableBalance = userWallet.availableBalance + request.refundAmount;
    const userVersion = userWallet.version;

    // Process settle part
    let modelWallet = await ModelWalletModel.findOne({ modelId: { $eq: request.modelId } });
    if (!modelWallet) {
      modelWallet = await ModelWalletModel.create({
        modelId: request.modelId,
        earnedBalance: 0,
        currency: this.config.defaultCurrency,
        type: 'earnings',
        version: 0,
      });
    }

    const newModelEarnedBalance = modelWallet.earnedBalance + request.settleAmount;
    const modelVersion = modelWallet.version;

    // Update user wallet with optimistic locking
    const updatedUserWallet = await WalletModel.findOneAndUpdate(
      { 
        userId: { $eq: request.userId },
        version: { $eq: userVersion },
      },
      {
        $inc: {
          availableBalance: request.refundAmount,
          escrowBalance: -escrow.amount,
          version: 1,
        },
      },
      { new: true }
    );

    if (!updatedUserWallet) {
      throw new OptimisticLockError('wallet', request.userId);
    }

    // Update model wallet with optimistic locking
    const updatedModelWallet = await ModelWalletModel.findOneAndUpdate(
      { 
        modelId: { $eq: request.modelId },
        version: { $eq: modelVersion },
      },
      {
        $set: {
          earnedBalance: newModelEarnedBalance,
        },
        $inc: { version: 1 },
      },
      { new: true }
    );

    if (!updatedModelWallet) {
      throw new OptimisticLockError('model_wallet', request.modelId);
    }

    // Update escrow status (marked as settled since it's processed)
    await EscrowItemModel.updateOne(
      { escrowId: { $eq: request.escrowId } },
      {
        $set: {
          status: 'settled',
          processedAt: new Date(),
          modelId: request.modelId,
        },
      }
    );

    // Create ledger entries
    const transactionId = uuidv4();

    if (request.refundAmount > 0) {
      await this.ledgerService.createEntry({
        transactionId,
        accountId: request.userId,
        accountType: 'user',
        amount: request.refundAmount,
        type: TransactionType.CREDIT,
        balanceState: 'available',
        stateTransition: 'escrow→available',
        reason: request.reason,
        idempotencyKey: `${request.idempotencyKey}_refund`,
        requestId: request.requestId,
        balanceBefore: userWallet.availableBalance,
        balanceAfter: newUserAvailableBalance,
        currency: this.config.defaultCurrency,
        escrowId: request.escrowId,
        queueItemId: request.queueItemId,
        metadata: request.metadata,
      });
    }

    if (request.settleAmount > 0) {
      await this.ledgerService.createEntry({
        transactionId,
        accountId: request.modelId,
        accountType: 'model',
        amount: request.settleAmount,
        type: TransactionType.CREDIT,
        balanceState: 'earned',
        stateTransition: 'escrow→earned',
        reason: request.reason,
        idempotencyKey: `${request.idempotencyKey}_settle`,
        requestId: request.requestId,
        balanceBefore: modelWallet.earnedBalance,
        balanceAfter: newModelEarnedBalance,
        currency: this.config.defaultCurrency,
        escrowId: request.escrowId,
        queueItemId: request.queueItemId,
        metadata: request.metadata,
      });
    }

    return {
      transactionId,
      refundedAmount: request.refundAmount,
      settledAmount: request.settleAmount,
      userAvailableBalance: newUserAvailableBalance,
      modelEarnedBalance: newModelEarnedBalance,
      timestamp: new Date(),
    };
  }

  /**
   * Get user wallet balance
   */
  async getUserBalance(userId: string): Promise<{
    available: number;
    escrow: number;
    total: number;
  }> {
    const wallet = await WalletModel.findOne({ userId: { $eq: userId } });
    
    if (!wallet) {
      return {
        available: 0,
        escrow: 0,
        total: 0,
      };
    }

    return {
      available: wallet.availableBalance,
      escrow: wallet.escrowBalance,
      total: wallet.availableBalance + wallet.escrowBalance,
    };
  }

  /**
   * Get model wallet balance
   */
  async getModelBalance(modelId: string): Promise<{
    earned: number;
  }> {
    const wallet = await ModelWalletModel.findOne({ modelId: { $eq: modelId } });
    
    if (!wallet) {
      return {
        earned: 0,
      };
    }

    return {
      earned: wallet.earnedBalance,
    };
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create wallet service instance
 */
export function createWalletService(
  ledgerService: ILedgerService,
  config?: Partial<WalletServiceConfigOptions>
): IWalletService {
  return new WalletService(ledgerService, config);
}
