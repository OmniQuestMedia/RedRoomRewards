/**
 * Wallet Controller
 * 
 * REST API controller for wallet operations based on OpenAPI specification.
 * Provides endpoints for wallet queries and balance modifications (credit/deduct).
 * 
 * @see /api/openapi.yaml for API contract
 */

import { IWalletService } from '../services/types';

/**
 * Response interface for GET /wallets/:userId
 */
export interface WalletResponse {
  userId: string;
  availableBalance: number;
  escrowBalance: number;
  totalBalance: number;
  currency: string;
  version: number;
  createdAt: string;
  lastUpdated: string;
}

/**
 * Request interface for POST /wallets/:userId/deduct
 */
export interface DeductPointsRequest {
  amount: number;
  reason: string;
  metadata?: Record<string, any>;
  idempotencyKey: string;
  requestId: string;
}

/**
 * Request interface for POST /wallets/:userId/credit
 */
export interface CreditPointsRequest {
  amount: number;
  reason: string;
  metadata?: Record<string, any>;
  idempotencyKey: string;
  requestId: string;
}

/**
 * Response interface for credit/deduct operations
 */
export interface TransactionResponse {
  transaction: {
    id: string;
    userId: string;
    amount: number;
    type: 'credit' | 'debit';
    reason: string;
    timestamp: string;
    idempotencyKey: string;
    previousBalance: number;
    newBalance: number;
    requestId: string;
  };
  wallet: WalletResponse;
}

/**
 * Wallet Controller Class
 * Handles HTTP requests for wallet operations
 */
export class WalletController {
  private walletService: IWalletService;

  constructor(walletService: IWalletService) {
    this.walletService = walletService;
  }

  /**
   * GET /wallets/:userId
   * Fetch detailed wallet information for the user
   * 
   * @param userId - User identifier
   * @returns Promise<WalletResponse>
   */
  async getWallet(userId: string): Promise<WalletResponse> {
    // Get user balance from wallet service
    const balance = await this.walletService.getUserBalance(userId);

    // In a full implementation, we'd fetch the complete wallet object
    // For now, return a structured response based on balance
    return {
      userId,
      availableBalance: balance.available,
      escrowBalance: balance.escrow,
      totalBalance: balance.total,
      currency: 'points',
      version: 0,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * POST /wallets/:userId/deduct
   * Deduct points for a specified user
   * 
   * @param userId - User identifier
   * @param request - Deduct request parameters
   * @returns Promise<TransactionResponse>
   */
  async deductPoints(userId: string, request: DeductPointsRequest): Promise<TransactionResponse> {
    // Validate amount
    if (request.amount <= 0) {
      throw new Error('Amount must be positive');
    }

    // In a full implementation, this would call a ledger service to create a debit transaction
    // For now, we'll return a structured response
    const previousBalance = 1000; // Placeholder
    const newBalance = previousBalance - request.amount;

    const transaction = {
      id: this.generateTransactionId(),
      userId,
      amount: -request.amount, // Negative for debit
      type: 'debit' as const,
      reason: request.reason,
      timestamp: new Date().toISOString(),
      idempotencyKey: request.idempotencyKey,
      previousBalance,
      newBalance,
      requestId: request.requestId,
    };

    const wallet = await this.getWallet(userId);

    return {
      transaction,
      wallet,
    };
  }

  /**
   * POST /wallets/:userId/credit
   * Credit points to a specified user
   * 
   * @param userId - User identifier
   * @param request - Credit request parameters
   * @returns Promise<TransactionResponse>
   */
  async creditPoints(userId: string, request: CreditPointsRequest): Promise<TransactionResponse> {
    // Validate amount
    if (request.amount <= 0) {
      throw new Error('Amount must be positive');
    }

    // In a full implementation, this would call a ledger service to create a credit transaction
    // For now, we'll return a structured response
    const previousBalance = 1000; // Placeholder
    const newBalance = previousBalance + request.amount;

    const transaction = {
      id: this.generateTransactionId(),
      userId,
      amount: request.amount, // Positive for credit
      type: 'credit' as const,
      reason: request.reason,
      timestamp: new Date().toISOString(),
      idempotencyKey: request.idempotencyKey,
      previousBalance,
      newBalance,
      requestId: request.requestId,
    };

    const wallet = await this.getWallet(userId);

    return {
      transaction,
      wallet,
    };
  }

  /**
   * Helper method to generate transaction ID
   * @private
   */
  private generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Factory function to create controller instance
 */
export function createWalletController(walletService: IWalletService): WalletController {
  return new WalletController(walletService);
}
