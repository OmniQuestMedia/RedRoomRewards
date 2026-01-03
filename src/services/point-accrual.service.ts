/**
 * Point Accrual Service
 * 
 * Handles all point earning operations including signups, referrals,
 * promotions, and admin credits. This is domain business logic that
 * orchestrates wallet and ledger operations.
 * 
 * @module services/point-accrual
 */

import { v4 as uuidv4 } from 'uuid';
import { ILedgerService } from '../ledger/types';
import { WalletModel } from '../db/models/wallet.model';
import { TransactionType, TransactionReason } from '../wallets/types';

/**
 * Request to award points to a user
 */
export interface AwardPointsRequest {
  /** User to credit */
  userId: string;
  
  /** Amount to award */
  amount: number;
  
  /** Reason for award */
  reason: TransactionReason;
  
  /** Idempotency key */
  idempotencyKey: string;
  
  /** Request ID for tracing */
  requestId: string;
  
  /** Additional metadata (no PII) */
  metadata?: Record<string, any>;
  
  /** Optional expiration date for points */
  expiresAt?: Date;
}

/**
 * Response from point award operation
 */
export interface AwardPointsResponse {
  /** Transaction ID */
  transactionId: string;
  
  /** Amount awarded */
  amountAwarded: number;
  
  /** User's new available balance */
  newBalance: number;
  
  /** Award timestamp */
  timestamp: Date;
}

/**
 * Configuration for point accrual service
 */
export interface PointAccrualConfig {
  /** Default currency */
  defaultCurrency: string;
  
  /** Maximum award amount per transaction */
  maxAwardAmount: number;
  
  /** Minimum award amount */
  minAwardAmount: number;
  
  /** Enable point expiration tracking */
  enableExpiration: boolean;
  
  /** Default expiration days (if not specified) */
  defaultExpirationDays: number;
}

const DEFAULT_CONFIG: PointAccrualConfig = {
  defaultCurrency: 'points',
  maxAwardAmount: 1000000,
  minAwardAmount: 1,
  enableExpiration: true,
  defaultExpirationDays: 365,
};

/**
 * Point Accrual Service Implementation
 * 
 * Provides business logic for earning points through various mechanisms.
 * All operations are atomic and create immutable ledger entries.
 */
export class PointAccrualService {
  private config: PointAccrualConfig;
  private ledgerService: ILedgerService;

  constructor(
    ledgerService: ILedgerService,
    config: Partial<PointAccrualConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ledgerService = ledgerService;
  }

  /**
   * Award points to a user
   * 
   * This method handles all point earning scenarios:
   * - Signup bonuses
   * - Referral rewards
   * - Promotional awards
   * - Admin credits
   * 
   * @param request Award request details
   * @returns Award response with new balance
   * @throws ValidationError if amount is invalid
   * @throws IdempotencyConflictError if key already used
   */
  async awardPoints(request: AwardPointsRequest): Promise<AwardPointsResponse> {
    // Validate amount
    this.validateAmount(request.amount);
    
    // Validate reason is an earning reason
    this.validateEarningReason(request.reason);
    
    // Check idempotency
    const exists = await this.ledgerService.checkIdempotency(
      request.idempotencyKey,
      'award_points'
    );
    
    if (exists) {
      throw new Error('Idempotency key already used');
    }
    
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
    
    const previousBalance = wallet.availableBalance;
    const newBalance = wallet.availableBalance + request.amount;
    const currentVersion = wallet.version;
    
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
      return this.awardPoints(request);
    }
    
    // Create ledger entry
    const transactionId = uuidv4();
    const timestamp = new Date();
    
    await this.ledgerService.createEntry({
      transactionId,
      accountId: request.userId,
      accountType: 'user',
      amount: request.amount,
      type: TransactionType.CREDIT,
      balanceState: 'available',
      stateTransition: 'none→available',
      reason: request.reason,
      idempotencyKey: request.idempotencyKey,
      requestId: request.requestId,
      balanceBefore: previousBalance,
      balanceAfter: newBalance,
      currency: this.config.defaultCurrency,
      metadata: {
        ...request.metadata,
        expiresAt: request.expiresAt?.toISOString(),
      },
    });
    
    return {
      transactionId,
      amountAwarded: request.amount,
      newBalance,
      timestamp,
    };
  }
  
  /**
   * Award signup bonus to a new user
   * 
   * @param userId User ID
   * @param bonusAmount Bonus amount
   * @param requestId Request ID
   * @returns Award response
   */
  async awardSignupBonus(
    userId: string,
    bonusAmount: number,
    requestId: string
  ): Promise<AwardPointsResponse> {
    return this.awardPoints({
      userId,
      amount: bonusAmount,
      reason: TransactionReason.USER_SIGNUP_BONUS,
      idempotencyKey: `signup-bonus-${userId}`,
      requestId,
      metadata: {
        bonusType: 'signup',
      },
    });
  }
  
  /**
   * Award referral bonus
   * 
   * @param referrerId User who made the referral
   * @param referredUserId User who was referred
   * @param bonusAmount Bonus amount
   * @param requestId Request ID
   * @returns Award response
   */
  async awardReferralBonus(
    referrerId: string,
    referredUserId: string,
    bonusAmount: number,
    requestId: string
  ): Promise<AwardPointsResponse> {
    return this.awardPoints({
      userId: referrerId,
      amount: bonusAmount,
      reason: TransactionReason.REFERRAL_BONUS,
      idempotencyKey: `referral-bonus-${referrerId}-${referredUserId}`,
      requestId,
      metadata: {
        bonusType: 'referral',
        referredUserId,
      },
    });
  }
  
  /**
   * Award promotional points
   * 
   * @param userId User ID
   * @param amount Amount to award
   * @param promotionId Promotion identifier
   * @param requestId Request ID
   * @param expiresAt Optional expiration date
   * @returns Award response
   */
  async awardPromotionalPoints(
    userId: string,
    amount: number,
    promotionId: string,
    requestId: string,
    expiresAt?: Date
  ): Promise<AwardPointsResponse> {
    return this.awardPoints({
      userId,
      amount,
      reason: TransactionReason.PROMOTIONAL_AWARD,
      idempotencyKey: `promo-${promotionId}-${userId}`,
      requestId,
      expiresAt,
      metadata: {
        promotionId,
        bonusType: 'promotional',
      },
    });
  }
  
  /**
   * Admin credit points (for corrections or special cases)
   * 
   * @param userId User ID
   * @param amount Amount to credit
   * @param adminId Admin performing the action
   * @param reason Description of why credit is being made
   * @param requestId Request ID
   * @returns Award response
   */
  async adminCreditPoints(
    userId: string,
    amount: number,
    adminId: string,
    reason: string,
    requestId: string
  ): Promise<AwardPointsResponse> {
    // Use deterministic idempotency key based on admin, user, and request
    const idempotencyKey = `admin-credit-${adminId}-${userId}-${requestId}`;
    
    return this.awardPoints({
      userId,
      amount,
      reason: TransactionReason.ADMIN_CREDIT,
      idempotencyKey,
      requestId,
      metadata: {
        adminId,
        adminReason: reason,
        operationType: 'admin_credit',
      },
    });
  }
  
  /**
   * Validate award amount is within acceptable range
   */
  private validateAmount(amount: number): void {
    if (amount < this.config.minAwardAmount) {
      throw new Error(`Amount must be at least ${this.config.minAwardAmount}`);
    }
    
    if (amount > this.config.maxAwardAmount) {
      throw new Error(`Amount cannot exceed ${this.config.maxAwardAmount}`);
    }
    
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be a positive finite number');
    }
  }
  
  /**
   * Validate that the reason is an earning reason (not redemption/debit)
   */
  private validateEarningReason(reason: TransactionReason): void {
    const earningReasons = [
      TransactionReason.USER_SIGNUP_BONUS,
      TransactionReason.REFERRAL_BONUS,
      TransactionReason.PROMOTIONAL_AWARD,
      TransactionReason.ADMIN_CREDIT,
    ];
    
    if (!earningReasons.includes(reason)) {
      throw new Error(`Invalid earning reason: ${reason}`);
    }
  }
}

/**
 * Factory function to create point accrual service
 */
export function createPointAccrualService(
  ledgerService: ILedgerService,
  config?: Partial<PointAccrualConfig>
): PointAccrualService {
  return new PointAccrualService(ledgerService, config);
}
