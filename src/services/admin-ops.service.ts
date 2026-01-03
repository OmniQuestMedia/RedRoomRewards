/**
 * Admin Operations Service
 * 
 * Provides administrative operations for point management including:
 * - Manual point adjustments (credits/debits)
 * - Refund processing
 * - Balance corrections
 * - Emergency operations
 * 
 * All operations require proper admin authorization and create
 * full audit trails in the immutable ledger.
 * 
 * @module services/admin-ops
 */

import { v4 as uuidv4 } from 'uuid';
import { ILedgerService } from '../ledger/types';
import { IWalletService } from './types';
import { WalletModel } from '../db/models/wallet.model';
import { TransactionType, TransactionReason } from '../wallets/types';

/**
 * Admin context for operations (audit trail)
 */
export interface AdminContext {
  /** Admin user ID */
  adminId: string;
  
  /** Admin username/email */
  adminUsername: string;
  
  /** Admin role(s) */
  roles: string[];
  
  /** IP address of admin */
  ipAddress?: string;
  
  /** User agent */
  userAgent?: string;
}

/**
 * Request for manual point adjustment
 */
export interface ManualAdjustmentRequest {
  /** User to adjust */
  userId: string;
  
  /** Amount (positive for credit, negative for debit) */
  amount: number;
  
  /** Reason for adjustment */
  reason: string;
  
  /** Admin performing the operation */
  admin: AdminContext;
  
  /** Request ID for tracing */
  requestId: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Response from manual adjustment
 */
export interface ManualAdjustmentResponse {
  /** Transaction ID */
  transactionId: string;
  
  /** Amount adjusted */
  amountAdjusted: number;
  
  /** Previous balance */
  previousBalance: number;
  
  /** New balance */
  newBalance: number;
  
  /** Operation timestamp */
  timestamp: Date;
}

/**
 * Request for admin refund
 */
export interface AdminRefundRequest {
  /** User to refund */
  userId: string;
  
  /** Amount to refund */
  amount: number;
  
  /** Reason for refund */
  reason: string;
  
  /** Reference transaction ID (original transaction) */
  referenceTransactionId?: string;
  
  /** Admin performing the operation */
  admin: AdminContext;
  
  /** Request ID for tracing */
  requestId: string;
}

/**
 * Response from admin refund
 */
export interface AdminRefundResponse {
  /** Transaction ID */
  transactionId: string;
  
  /** Amount refunded */
  amountRefunded: number;
  
  /** New balance */
  newBalance: number;
  
  /** Operation timestamp */
  timestamp: Date;
}

/**
 * Balance correction request
 */
export interface BalanceCorrectionRequest {
  /** User to correct */
  userId: string;
  
  /** Expected balance (what it should be) */
  expectedBalance: number;
  
  /** Actual balance (what ledger shows) */
  actualBalance: number;
  
  /** Reason for correction */
  reason: string;
  
  /** Admin performing the operation */
  admin: AdminContext;
  
  /** Request ID for tracing */
  requestId: string;
}

/**
 * Balance correction response
 */
export interface BalanceCorrectionResponse {
  /** Transaction ID */
  transactionId: string;
  
  /** Correction amount applied */
  correctionAmount: number;
  
  /** New balance */
  newBalance: number;
  
  /** Operation timestamp */
  timestamp: Date;
}

/**
 * Configuration for admin operations service
 */
export interface AdminOpsConfig {
  /** Default currency */
  defaultCurrency: string;
  
  /** Maximum adjustment amount */
  maxAdjustmentAmount: number;
  
  /** Require reason for all operations */
  requireReason: boolean;
  
  /** Enable enhanced audit logging */
  enhancedAuditLogging: boolean;
}

const DEFAULT_CONFIG: AdminOpsConfig = {
  defaultCurrency: 'points',
  maxAdjustmentAmount: 1000000,
  requireReason: true,
  enhancedAuditLogging: true,
};

/**
 * Admin Operations Service Implementation
 * 
 * Provides privileged operations for administrators to manage
 * point balances, process refunds, and correct discrepancies.
 * 
 * ALL operations create full audit trails.
 */
export class AdminOpsService {
  private config: AdminOpsConfig;
  private ledgerService: ILedgerService;

  constructor(
    ledgerService: ILedgerService,
    _walletService: IWalletService,
    config: Partial<AdminOpsConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ledgerService = ledgerService;
  }

  /**
   * Perform manual point adjustment
   * 
   * This method allows admins to credit or debit points directly.
   * Use cases:
   * - Customer service compensations
   * - Technical issue resolutions
   * - Balance corrections
   * 
   * @param request Adjustment request
   * @returns Adjustment response
   * @throws Error if amount exceeds limits or admin not authorized
   */
  async manualAdjustment(
    request: ManualAdjustmentRequest
  ): Promise<ManualAdjustmentResponse> {
    // Validate admin authorization
    this.validateAdminAuth(request.admin);
    
    // Validate reason if required
    if (this.config.requireReason && !request.reason) {
      throw new Error('Reason is required for manual adjustments');
    }
    
    // Validate amount
    if (Math.abs(request.amount) > this.config.maxAdjustmentAmount) {
      throw new Error(`Adjustment amount exceeds maximum: ${this.config.maxAdjustmentAmount}`);
    }
    
    if (request.amount === 0) {
      throw new Error('Adjustment amount cannot be zero');
    }
    
    // Get wallet
    const wallet = await WalletModel.findOne({ userId: { $eq: request.userId } });
    if (!wallet) {
      throw new Error(`Wallet not found for user: ${request.userId}`);
    }
    
    const previousBalance = wallet.availableBalance;
    const newBalance = wallet.availableBalance + request.amount;
    const currentVersion = wallet.version;
    
    // Prevent negative balance unless it's a correction
    if (newBalance < 0 && !request.metadata?.allowNegative) {
      throw new Error('Adjustment would result in negative balance');
    }
    
    // Update wallet with optimistic locking
    const updated = await WalletModel.findOneAndUpdate(
      {
        userId: { $eq: request.userId },
        version: { $eq: currentVersion },
      },
      {
        $inc: {
          availableBalance: request.amount,
          version: 1,
        },
      },
      { new: true }
    );
    
    if (!updated) {
      // Retry once on conflict
      return this.manualAdjustment(request);
    }
    
    // Create ledger entry with full audit context
    const transactionId = uuidv4();
    const timestamp = new Date();
    
    const transactionType = request.amount > 0 
      ? TransactionType.CREDIT 
      : TransactionType.DEBIT;
    
    const reason = request.amount > 0
      ? TransactionReason.ADMIN_CREDIT
      : TransactionReason.ADMIN_DEBIT;
    
    await this.ledgerService.createEntry({
      transactionId,
      accountId: request.userId,
      accountType: 'user',
      amount: request.amount,
      type: transactionType,
      balanceState: 'available',
      stateTransition: request.amount > 0 ? 'none→available' : 'available→none',
      reason,
      idempotencyKey: uuidv4(),
      requestId: request.requestId,
      balanceBefore: previousBalance,
      balanceAfter: newBalance,
      currency: this.config.defaultCurrency,
      metadata: {
        ...request.metadata,
        adminId: request.admin.adminId,
        adminUsername: request.admin.adminUsername,
        adminReason: request.reason,
        adminIpAddress: request.admin.ipAddress,
        operationType: 'manual_adjustment',
      },
    });
    
    return {
      transactionId,
      amountAdjusted: request.amount,
      previousBalance,
      newBalance,
      timestamp,
    };
  }
  
  /**
   * Process admin refund
   * 
   * Returns points to a user with full audit trail.
   * 
   * @param request Refund request
   * @returns Refund response
   */
  async processRefund(
    request: AdminRefundRequest
  ): Promise<AdminRefundResponse> {
    // Validate admin authorization
    this.validateAdminAuth(request.admin);
    
    // Validate amount
    if (request.amount <= 0) {
      throw new Error('Refund amount must be positive');
    }
    
    if (request.amount > this.config.maxAdjustmentAmount) {
      throw new Error(`Refund amount exceeds maximum: ${this.config.maxAdjustmentAmount}`);
    }
    
    // Use manual adjustment for the refund
    const adjustmentRequest: ManualAdjustmentRequest = {
      userId: request.userId,
      amount: request.amount,
      reason: request.reason,
      admin: request.admin,
      requestId: request.requestId,
      metadata: {
        operationType: 'admin_refund',
        referenceTransactionId: request.referenceTransactionId,
      },
    };
    
    const result = await this.manualAdjustment(adjustmentRequest);
    
    return {
      transactionId: result.transactionId,
      amountRefunded: request.amount,
      newBalance: result.newBalance,
      timestamp: result.timestamp,
    };
  }
  
  /**
   * Correct balance discrepancy
   * 
   * When ledger and wallet are out of sync, this corrects the wallet
   * to match the ledger (source of truth).
   * 
   * @param request Correction request
   * @returns Correction response
   */
  async correctBalance(
    request: BalanceCorrectionRequest
  ): Promise<BalanceCorrectionResponse> {
    // Validate admin authorization
    this.validateAdminAuth(request.admin);
    
    // Calculate correction amount
    const correctionAmount = request.expectedBalance - request.actualBalance;
    
    if (correctionAmount === 0) {
      throw new Error('No correction needed - balances match');
    }
    
    // Use manual adjustment for the correction
    const adjustmentRequest: ManualAdjustmentRequest = {
      userId: request.userId,
      amount: correctionAmount,
      reason: request.reason,
      admin: request.admin,
      requestId: request.requestId,
      metadata: {
        operationType: 'balance_correction',
        expectedBalance: request.expectedBalance,
        actualBalance: request.actualBalance,
        allowNegative: true,
      },
    };
    
    const result = await this.manualAdjustment(adjustmentRequest);
    
    return {
      transactionId: result.transactionId,
      correctionAmount,
      newBalance: result.newBalance,
      timestamp: result.timestamp,
    };
  }
  
  /**
   * Get admin operation audit trail for a user
   * 
   * @param userId User ID
   * @returns List of admin operations
   */
  async getAdminOperationHistory(userId: string): Promise<any[]> {
    const filter = {
      accountId: userId,
      accountType: 'user' as const,
    };
    
    const result = await this.ledgerService.queryEntries(filter);
    
    // Filter to only admin operations
    return result.entries.filter(entry => 
      entry.reason === TransactionReason.ADMIN_CREDIT ||
      entry.reason === TransactionReason.ADMIN_DEBIT ||
      entry.reason === TransactionReason.ADMIN_REFUND
    );
  }
  
  /**
   * Validate admin authorization
   * 
   * @param admin Admin context
   * @throws Error if not authorized
   */
  private validateAdminAuth(admin: AdminContext): void {
    if (!admin.adminId || !admin.roles || admin.roles.length === 0) {
      throw new Error('Invalid admin context');
    }
    
    // Check for required admin role
    const hasAdminRole = admin.roles.includes('admin') || 
                        admin.roles.includes('super_admin') ||
                        admin.roles.includes('finance_admin');
    
    if (!hasAdminRole) {
      throw new Error('Insufficient permissions for admin operation');
    }
  }
}

/**
 * Factory function to create admin operations service
 */
export function createAdminOpsService(
  ledgerService: ILedgerService,
  walletService: IWalletService,
  config?: Partial<AdminOpsConfig>
): AdminOpsService {
  return new AdminOpsService(ledgerService, walletService, config);
}
