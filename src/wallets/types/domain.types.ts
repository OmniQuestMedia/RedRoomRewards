/**
 * Wallet Domain Type Definitions
 *
 * Core enums and interfaces for the wallet domain model.
 */

/**
 * Wallet states represent the distinct ledger buckets for point tracking.
 * These are explicit states, not derived calculations.
 */
export enum WalletState {
  /** Points that a user can freely spend */
  AVAILABLE = 'available',

  /** Points deducted from user but not yet credited to recipient */
  ESCROW = 'escrow',

  /** Points credited to a model's account after performance completion */
  EARNED = 'earned',

  /** Points returned to user from escrow */
  REFUNDED = 'refunded',
}

/**
 * Transaction types for ledger entries
 */
export enum TransactionType {
  /** Adding points to a balance */
  CREDIT = 'credit',

  /** Removing points from a balance */
  DEBIT = 'debit',
}

/**
 * Escrow item status tracking
 */
export enum EscrowStatus {
  /** Funds are held in escrow, awaiting settlement or refund */
  HELD = 'held',

  /** Funds have been settled to model earned balance */
  SETTLED = 'settled',

  /** Funds have been refunded to user available balance */
  REFUNDED = 'refunded',
}

/**
 * Standard reason codes for transactions
 * These enable structured audit trails without free-text
 */
export enum TransactionReason {
  // Earning reasons
  USER_SIGNUP_BONUS = 'user_signup_bonus',
  REFERRAL_BONUS = 'referral_bonus',
  PROMOTIONAL_AWARD = 'promotional_award',
  ADMIN_CREDIT = 'admin_credit',

  // Purchasing reasons
  CHIP_MENU_PURCHASE = 'chip_menu_purchase',
  SPIN_WHEEL_PLAY = 'spin_wheel_play',
  PERFORMANCE_REQUEST = 'performance_request',

  // Settlement reasons
  PERFORMANCE_COMPLETED = 'performance_completed',
  PARTIAL_PERFORMANCE = 'partial_performance',

  // Refund reasons
  PERFORMANCE_ABANDONED = 'performance_abandoned',
  USER_DISCONNECTED = 'user_disconnected',
  MODEL_INITIATED_REFUND = 'model_initiated_refund',
  ROPE_DROP_TIMEOUT = 'rope_drop_timeout',
  ADMIN_REFUND = 'admin_refund',

  // Merchant order redemption
  MERCHANT_ORDER_REDEMPTION = 'merchant_order_redemption',
  // Merchant redemption escrow lifecycle: settle (sale final → burn) /
  // void (order cancelled → release held points back to available).
  MERCHANT_ORDER_REDEMPTION_SETTLE = 'merchant_order_redemption_settle',
  MERCHANT_ORDER_REDEMPTION_VOID = 'merchant_order_redemption_void',

  // Admin award reasons (Screen 07)
  MODEL_GIFT = 'model_gift',

  // Debit reasons
  POINT_EXPIRY = 'point_expiry',
  ADMIN_DEBIT = 'admin_debit',
  CHARGEBACK = 'chargeback',
}

/**
 * User wallet structure with all balance states
 */
export interface Wallet {
  /** User identifier */
  userId: string;

  /** Points available for spending */
  availableBalance: number;

  /** Points held in escrow */
  escrowBalance: number;

  /** Currency type (default: 'points') */
  currency: string;

  /** Optimistic locking version */
  version: number;

  /** Wallet creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Model wallet structure for earnings
 */
export interface ModelWallet {
  /** Model identifier */
  modelId: string;

  /** Points earned and available for withdrawal */
  earnedBalance: number;

  /** Currency type (default: 'points') */
  currency: string;

  /** Wallet type */
  type: 'promotional' | 'earnings';

  /** Optimistic locking version */
  version: number;

  /** Wallet creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Escrow item tracking individual held amounts
 */
export interface EscrowItem {
  /** Unique escrow identifier */
  escrowId: string;

  /** User who initiated the transaction */
  userId: string;

  /** Amount held in escrow */
  amount: number;

  /** Current status of escrow */
  status: EscrowStatus;

  /** Performance queue item ID */
  queueItemId: string;

  /** Feature that created this escrow */
  featureType: string;

  /** Reason for holding */
  reason: TransactionReason;

  /** Metadata for audit trail */
  metadata?: Record<string, unknown>;

  /** When escrow was created */
  createdAt: Date;

  /** When escrow was settled or refunded (null if still held) */
  processedAt: Date | null;

  /** Model ID if settled */
  modelId?: string;
}

/**
 * Immutable ledger transaction record
 */
export interface Transaction {
  /** Unique transaction identifier */
  transactionId: string;

  /** User or model identifier */
  accountId: string;

  /** Account type */
  accountType: 'user' | 'model';

  /** Transaction amount (positive for credit, negative for debit) */
  amount: number;

  /** Transaction type */
  type: TransactionType;

  /** State transition (e.g., 'available→escrow', 'escrow→earned') */
  stateTransition: string;

  /** Structured reason code */
  reason: TransactionReason;

  /** Idempotency key for duplicate prevention */
  idempotencyKey: string;

  /** Request ID for tracing */
  requestId: string;

  /** Balance before transaction */
  previousBalance: number;

  /** Balance after transaction */
  newBalance: number;

  /** Transaction timestamp */
  timestamp: Date;

  /** Additional context data */
  metadata?: Record<string, unknown>;

  /** Related escrow ID if applicable */
  escrowId?: string;

  /** Related queue item ID if applicable */
  queueItemId?: string;
}
