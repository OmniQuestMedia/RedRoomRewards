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
import { EarnRateConfigModel } from '../db/models/earn-rate-config.model';
import { TransactionType, TransactionReason } from '../wallets/types';
import { resolveTenantId } from '../config/program-tenant';

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

  /** Tenant identifier for multi-tenant scoping */
  tenantId: string;

  /** Additional metadata (no PII) */
  metadata?: Record<string, unknown>;

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

  /** Maximum retry attempts for optimistic lock conflicts */
  maxRetryAttempts: number;

  /** Retry backoff base in milliseconds */
  retryBackoffMs: number;
}

const DEFAULT_CONFIG: PointAccrualConfig = {
  defaultCurrency: 'points',
  maxAwardAmount: 1000000,
  minAwardAmount: 1,
  enableExpiration: true,
  defaultExpirationDays: 365,
  maxRetryAttempts: 3,
  retryBackoffMs: 100,
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

  constructor(ledgerService: ILedgerService, config: Partial<PointAccrualConfig> = {}) {
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
   * @param retryCount Internal retry counter for optimistic locking
   * @returns Award response with new balance
   * @throws ValidationError if amount is invalid
   * @throws IdempotencyConflictError if key already used
   * @throws OptimisticLockError if max retries exceeded
   */
  async awardPoints(
    request: AwardPointsRequest,
    retryCount: number = 0,
  ): Promise<AwardPointsResponse> {
    // Check retry limit
    if (retryCount >= this.config.maxRetryAttempts) {
      throw new Error(
        `Optimistic lock conflict after ${this.config.maxRetryAttempts} attempts for user ${request.userId}`,
      );
    }

    // Validate amount
    this.validateAmount(request.amount);

    // Validate reason is an earning reason
    this.validateEarningReason(request.reason);

    // Check idempotency (only on first attempt)
    if (retryCount === 0) {
      const exists = await this.ledgerService.checkIdempotency(
        request.idempotencyKey,
        'award_points',
        request.tenantId,
      );

      if (exists) {
        throw new Error('Idempotency key already used');
      }
    }

    // Get or create wallet
    const tenantId = resolveTenantId(request.tenantId);
    let wallet = await WalletModel.findOne({
      tenant_id: { $eq: tenantId },
      userId: { $eq: request.userId },
    });
    if (!wallet) {
      wallet = await WalletModel.create({
        tenant_id: tenantId,
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
        tenant_id: { $eq: tenantId },
        userId: { $eq: request.userId },
        version: { $eq: currentVersion },
      },
      {
        $inc: {
          availableBalance: request.amount,
          version: 1,
        },
      },
      { new: true },
    );

    if (!updated) {
      // Retry with exponential backoff
      await this.sleep(this.config.retryBackoffMs * Math.pow(2, retryCount));
      return this.awardPoints(request, retryCount + 1);
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
   * @param tenantId Tenant identifier
   * @returns Award response
   */
  async awardSignupBonus(
    userId: string,
    bonusAmount: number,
    requestId: string,
    tenantId: string,
  ): Promise<AwardPointsResponse> {
    return this.awardPoints({
      userId,
      amount: bonusAmount,
      reason: TransactionReason.USER_SIGNUP_BONUS,
      idempotencyKey: `signup-bonus-${userId}`,
      requestId,
      tenantId,
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
   * @param tenantId Tenant identifier
   * @returns Award response
   */
  async awardReferralBonus(
    referrerId: string,
    referredUserId: string,
    bonusAmount: number,
    requestId: string,
    tenantId: string,
  ): Promise<AwardPointsResponse> {
    return this.awardPoints({
      userId: referrerId,
      amount: bonusAmount,
      reason: TransactionReason.REFERRAL_BONUS,
      idempotencyKey: `referral-bonus-${referrerId}-${referredUserId}`,
      requestId,
      tenantId,
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
   * @param tenantId Tenant identifier
   * @param expiresAt Optional expiration date
   * @returns Award response
   */
  async awardPromotionalPoints(
    userId: string,
    amount: number,
    promotionId: string,
    requestId: string,
    tenantId: string,
    expiresAt?: Date,
  ): Promise<AwardPointsResponse> {
    return this.awardPoints({
      userId,
      amount,
      reason: TransactionReason.PROMOTIONAL_AWARD,
      idempotencyKey: `promo-${promotionId}-${userId}`,
      requestId,
      tenantId,
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
   * @param tenantId Tenant identifier
   * @returns Award response
   */
  async adminCreditPoints(
    userId: string,
    amount: number,
    adminId: string,
    reason: string,
    requestId: string,
    tenantId: string,
  ): Promise<AwardPointsResponse> {
    // Use deterministic idempotency key based on admin, user, and request
    const idempotencyKey = `admin-credit-${adminId}-${userId}-${requestId}`;

    return this.awardPoints({
      userId,
      amount,
      reason: TransactionReason.ADMIN_CREDIT,
      idempotencyKey,
      requestId,
      tenantId,
      metadata: {
        adminId,
        adminReason: reason,
        operationType: 'admin_credit',
      },
    });
  }

  /**
   * Calculate the earn rate for a given tier, event class, and spend amount (C-001).
   *
   * Looks up the active `EarnRateConfig` row for the tenant/merchant/tier/event
   * combination and applies `base_points_per_unit * inferno_multiplier * amount`.
   * Diamond Concierge purchases earn 0 when `diamond_concierge_zero_earn` is true
   * (CEO Decision D3).
   *
   * @param tenantId   Tenant identifier
   * @param merchantId Merchant identifier
   * @param merchantTier Merchant loyalty tier (e.g. "GOLD")
   * @param eventClass Event class (e.g. "PURCHASE")
   * @param amount     Spend amount (units) to convert to points
   * @param isDiamondConcierge Whether the purchase is a Diamond Concierge purchase (CEO D3)
   * @returns Calculated points to award
   * @throws Error when no active earn-rate config exists for the given parameters
   */
  async calculateEarnRate(
    tenantId: string,
    merchantId: string,
    merchantTier: string,
    eventClass: string,
    amount: number,
    isDiamondConcierge: boolean = false,
  ): Promise<number> {
    const config = await EarnRateConfigModel.findOne({
      tenant_id: { $eq: tenantId },
      merchant_id: { $eq: merchantId },
      merchant_tier: { $eq: merchantTier },
      event_class: { $eq: eventClass },
      superseded_at: null,
    }).sort({ effective_at: -1 });

    if (!config) {
      throw new Error(
        `No active earn-rate config for tenant=${tenantId} merchant=${merchantId} tier=${merchantTier} event=${eventClass}`,
      );
    }

    // CEO Decision D3: Diamond Concierge earns 0 unless explicitly overridden
    if (isDiamondConcierge && config.diamond_concierge_zero_earn) {
      return 0;
    }

    return config.base_points_per_unit * config.inferno_multiplier * amount;
  }

  /**
   * Deduct points from a user's available balance (B-002).
   *
   * Mirror of awardPoints — atomic optimistic-locked WalletModel
   * decrement plus an immutable LedgerEntry. Does NOT route through
   * escrow; this is the path for direct admin debits and any other
   * non-escrow deduct flow surfaced by `WalletController.deductPoints`.
   * For escrow-flow redemptions (CHIP_MENU_PURCHASE, SPIN_WHEEL_PLAY,
   * PERFORMANCE_REQUEST) callers should use
   * `PointRedemptionService.redeemPoints`, which holds funds in
   * escrow rather than burning them outright.
   *
   * Throws on insufficient balance; preserves existing retry/back-off
   * semantics for optimistic-lock conflicts.
   */
  async deductFromAvailable(
    request: AwardPointsRequest,
    retryCount: number = 0,
  ): Promise<AwardPointsResponse> {
    if (retryCount >= this.config.maxRetryAttempts) {
      throw new Error(
        `Optimistic lock conflict after ${this.config.maxRetryAttempts} attempts for user ${request.userId}`,
      );
    }

    this.validateAmount(request.amount);
    this.validateDebitReason(request.reason);

    if (retryCount === 0) {
      const exists = await this.ledgerService.checkIdempotency(
        request.idempotencyKey,
        'deduct_points',
        request.tenantId,
      );
      if (exists) {
        throw new Error('Idempotency key already used');
      }
    }

    const tenantId = resolveTenantId(request.tenantId);
    const wallet = await WalletModel.findOne({
      tenant_id: { $eq: tenantId },
      userId: { $eq: request.userId },
    });
    if (!wallet) {
      throw new Error(`Insufficient balance: wallet not found for ${request.userId}`);
    }
    if (wallet.availableBalance < request.amount) {
      throw new Error(
        `Insufficient balance for ${request.userId} — available ${wallet.availableBalance}, requested ${request.amount}`,
      );
    }

    const previousBalance = wallet.availableBalance;
    const newBalance = wallet.availableBalance - request.amount;
    const currentVersion = wallet.version;

    // Optimistic-locked decrement; matches the awardPoints retry pattern.
    const updated = await WalletModel.findOneAndUpdate(
      {
        tenant_id: { $eq: tenantId },
        userId: { $eq: request.userId },
        version: { $eq: currentVersion },
        availableBalance: { $gte: request.amount },
      },
      {
        $inc: {
          availableBalance: -request.amount,
          version: 1,
        },
      },
      { new: true },
    );

    if (!updated) {
      await this.sleep(this.config.retryBackoffMs * Math.pow(2, retryCount));
      return this.deductFromAvailable(request, retryCount + 1);
    }

    const transactionId = uuidv4();
    const timestamp = new Date();

    await this.ledgerService.createEntry({
      transactionId,
      accountId: request.userId,
      accountType: 'user',
      amount: -request.amount,
      type: TransactionType.DEBIT,
      balanceState: 'available',
      stateTransition: 'available→debit',
      reason: request.reason,
      idempotencyKey: request.idempotencyKey,
      requestId: request.requestId,
      balanceBefore: previousBalance,
      balanceAfter: newBalance,
      currency: this.config.defaultCurrency,
      correlationId: transactionId,
      metadata: {
        ...request.metadata,
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
   * Validate that the reason is an admissible debit reason for
   * `deductFromAvailable`. Escrow-flow redemption reasons go through
   * `PointRedemptionService` instead.
   */
  private validateDebitReason(reason: TransactionReason): void {
    const debitReasons = [TransactionReason.ADMIN_DEBIT, TransactionReason.POINT_EXPIRY];
    if (!debitReasons.includes(reason)) {
      throw new Error(`Invalid debit reason for deductFromAvailable: ${reason}`);
    }
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

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create point accrual service
 */
export function createPointAccrualService(
  ledgerService: ILedgerService,
  config?: Partial<PointAccrualConfig>,
): PointAccrualService {
  return new PointAccrualService(ledgerService, config);
}
