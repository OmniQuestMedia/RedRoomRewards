/**
 * Point Redemption Service
 * 
 * Handles point redemption operations by orchestrating escrow holds
 * through the wallet service. This service provides business logic
 * for different types of redemptions (chip menu, slot machine, etc.).
 * 
 * Settlement and refund are handled by the queue service, not here.
 * 
 * @module services/point-redemption
 */

import { IWalletService } from './types';
import { 
  EscrowHoldRequest, 
  TransactionReason 
} from '../wallets/types';

/**
 * Request to redeem points for a feature
 */
export interface RedeemPointsRequest {
  /** User making the redemption */
  userId: string;
  
  /** Amount to redeem */
  amount: number;
  
  /** Type of redemption (chip_menu, slot_machine, etc.) */
  featureType: string;
  
  /** Model involved (if applicable) */
  modelId?: string;
  
  /** Queue item ID for tracking */
  queueItemId: string;
  
  /** Reason for redemption */
  reason: TransactionReason;
  
  /** Request ID for tracing */
  requestId: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Response from redemption operation
 */
export interface RedeemPointsResponse {
  /** Transaction ID */
  transactionId: string;
  
  /** Escrow ID holding the funds */
  escrowId: string;
  
  /** Amount redeemed and held in escrow */
  amountRedeemed: number;
  
  /** User's new available balance */
  newAvailableBalance: number;
  
  /** User's escrow balance */
  escrowBalance: number;
  
  /** Queue item ID for tracking */
  queueItemId: string;
  
  /** Redemption timestamp */
  timestamp: Date;
}

/**
 * Configuration for point redemption service
 */
export interface PointRedemptionConfig {
  /** Maximum redemption amount per transaction */
  maxRedemptionAmount: number;
  
  /** Minimum redemption amount */
  minRedemptionAmount: number;
  
  /** Enable balance validation */
  validateBalance: boolean;
}

const DEFAULT_CONFIG: PointRedemptionConfig = {
  maxRedemptionAmount: 100000,
  minRedemptionAmount: 1,
  validateBalance: true,
};

/**
 * Point Redemption Service Implementation
 * 
 * Orchestrates point redemptions by holding funds in escrow.
 * Does NOT handle settlement or refund - that's the queue service's responsibility.
 */
export class PointRedemptionService {
  private config: PointRedemptionConfig;
  private walletService: IWalletService;

  constructor(
    walletService: IWalletService,
    config: Partial<PointRedemptionConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.walletService = walletService;
  }

  /**
   * Redeem points by placing them in escrow
   * 
   * This method validates the redemption and holds funds in escrow.
   * The funds remain in escrow until the queue service either:
   * - Settles them to a model (performance completed)
   * - Refunds them to the user (performance abandoned)
   * 
   * @param request Redemption request details
   * @returns Redemption response with escrow details
   * @throws InsufficientBalanceError if user doesn't have enough points
   * @throws ValidationError if amount is invalid
   */
  async redeemPoints(request: RedeemPointsRequest): Promise<RedeemPointsResponse> {
    // Validate amount
    this.validateAmount(request.amount);
    
    // Validate reason is a redemption reason
    this.validateRedemptionReason(request.reason);
    
    // Validate feature type
    this.validateFeatureType(request.featureType);
    
    // Check balance if enabled
    if (this.config.validateBalance) {
      const balance = await this.walletService.getUserBalance(request.userId);
      if (balance.available < request.amount) {
        throw new Error(
          `Insufficient balance. Required: ${request.amount}, Available: ${balance.available}`
        );
      }
    }
    
    // Hold in escrow via wallet service
    // Use request-specific idempotency key for proper duplicate detection
    const idempotencyKey = `redemption-${request.userId}-${request.queueItemId}`;
    
    const escrowRequest: EscrowHoldRequest = {
      userId: request.userId,
      amount: request.amount,
      reason: request.reason,
      queueItemId: request.queueItemId,
      featureType: request.featureType,
      idempotencyKey,
      requestId: request.requestId,
      metadata: {
        ...request.metadata,
        modelId: request.modelId,
      },
    };
    
    const escrowResponse = await this.walletService.holdInEscrow(escrowRequest);
    
    return {
      transactionId: escrowResponse.transactionId,
      escrowId: escrowResponse.escrowId,
      amountRedeemed: request.amount,
      newAvailableBalance: escrowResponse.newAvailableBalance,
      escrowBalance: escrowResponse.escrowBalance,
      queueItemId: request.queueItemId,
      timestamp: escrowResponse.timestamp,
    };
  }
  
  /**
   * Redeem points for chip menu action
   * 
   * @param userId User ID
   * @param modelId Model ID
   * @param amount Amount to redeem
   * @param actionType Type of chip menu action
   * @param queueItemId Queue item ID
   * @param requestId Request ID
   * @returns Redemption response
   */
  async redeemForChipMenu(
    userId: string,
    modelId: string,
    amount: number,
    actionType: string,
    queueItemId: string,
    requestId: string
  ): Promise<RedeemPointsResponse> {
    return this.redeemPoints({
      userId,
      amount,
      featureType: 'chip_menu',
      modelId,
      queueItemId,
      reason: TransactionReason.CHIP_MENU_PURCHASE,
      requestId,
      metadata: {
        actionType,
      },
    });
  }
  
  /**
   * Redeem points for slot machine play
   * 
   * @param userId User ID
   * @param amount Amount to redeem
   * @param queueItemId Queue item ID
   * @param requestId Request ID
   * @returns Redemption response
   */
  async redeemForSlotMachine(
    userId: string,
    amount: number,
    queueItemId: string,
    requestId: string
  ): Promise<RedeemPointsResponse> {
    return this.redeemPoints({
      userId,
      amount,
      featureType: 'slot_machine',
      queueItemId,
      reason: TransactionReason.SLOT_MACHINE_PLAY,
      requestId,
    });
  }
  
  /**
   * Redeem points for spin wheel play
   * 
   * @param userId User ID
   * @param amount Amount to redeem
   * @param queueItemId Queue item ID
   * @param requestId Request ID
   * @returns Redemption response
   */
  async redeemForSpinWheel(
    userId: string,
    amount: number,
    queueItemId: string,
    requestId: string
  ): Promise<RedeemPointsResponse> {
    return this.redeemPoints({
      userId,
      amount,
      featureType: 'spin_wheel',
      queueItemId,
      reason: TransactionReason.SPIN_WHEEL_PLAY,
      requestId,
    });
  }
  
  /**
   * Redeem points for performance request
   * 
   * @param userId User ID
   * @param modelId Model ID
   * @param amount Amount to redeem
   * @param performanceType Type of performance
   * @param queueItemId Queue item ID
   * @param requestId Request ID
   * @returns Redemption response
   */
  async redeemForPerformance(
    userId: string,
    modelId: string,
    amount: number,
    performanceType: string,
    queueItemId: string,
    requestId: string
  ): Promise<RedeemPointsResponse> {
    return this.redeemPoints({
      userId,
      amount,
      featureType: 'performance',
      modelId,
      queueItemId,
      reason: TransactionReason.PERFORMANCE_REQUEST,
      requestId,
      metadata: {
        performanceType,
      },
    });
  }
  
  /**
   * Validate redemption amount
   */
  private validateAmount(amount: number): void {
    if (amount < this.config.minRedemptionAmount) {
      throw new Error(`Amount must be at least ${this.config.minRedemptionAmount}`);
    }
    
    if (amount > this.config.maxRedemptionAmount) {
      throw new Error(`Amount cannot exceed ${this.config.maxRedemptionAmount}`);
    }
    
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be a positive finite number');
    }
  }
  
  /**
   * Validate redemption reason
   */
  private validateRedemptionReason(reason: TransactionReason): void {
    const redemptionReasons = [
      TransactionReason.CHIP_MENU_PURCHASE,
      TransactionReason.SLOT_MACHINE_PLAY,
      TransactionReason.SPIN_WHEEL_PLAY,
      TransactionReason.PERFORMANCE_REQUEST,
    ];
    
    if (!redemptionReasons.includes(reason)) {
      throw new Error(`Invalid redemption reason: ${reason}`);
    }
  }
  
  /**
   * Validate feature type
   */
  private validateFeatureType(featureType: string): void {
    const validFeatures = [
      'chip_menu',
      'slot_machine',
      'spin_wheel',
      'performance',
    ];
    
    if (!validFeatures.includes(featureType)) {
      throw new Error(`Invalid feature type: ${featureType}`);
    }
  }
}

/**
 * Factory function to create point redemption service
 */
export function createPointRedemptionService(
  walletService: IWalletService,
  config?: Partial<PointRedemptionConfig>
): PointRedemptionService {
  return new PointRedemptionService(walletService, config);
}
