/**
 * Wallet and Escrow Type Definitions
 * 
 * These types define the core wallet and escrow structures for RedRoomRewards.
 * Based on established patterns from XXXChatNow integration requirements.
 * 
 * @see /docs/WALLET_ESCROW_ARCHITECTURE.md for detailed specifications
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
  SLOT_MACHINE_PLAY = 'slot_machine_play',
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
  metadata?: Record<string, any>;
  
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
  metadata?: Record<string, any>;
  
  /** Related escrow ID if applicable */
  escrowId?: string;
  
  /** Related queue item ID if applicable */
  queueItemId?: string;
}

/**
 * Request to hold funds in escrow
 */
export interface EscrowHoldRequest {
  /** User identifier */
  userId: string;
  
  /** Amount to hold */
  amount: number;
  
  /** Reason for holding */
  reason: TransactionReason;
  
  /** Performance queue item ID */
  queueItemId: string;
  
  /** Feature initiating the hold */
  featureType: string;
  
  /** Idempotency key */
  idempotencyKey: string;
  
  /** Request ID for tracing */
  requestId: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Response from escrow hold operation
 */
export interface EscrowHoldResponse {
  /** Created transaction ID */
  transactionId: string;
  
  /** Created escrow ID */
  escrowId: string;
  
  /** User's previous available balance */
  previousBalance: number;
  
  /** User's new available balance */
  newAvailableBalance: number;
  
  /** Amount now in escrow */
  escrowBalance: number;
  
  /** Operation timestamp */
  timestamp: Date;
}

/**
 * Request to settle escrow to model earnings
 */
export interface EscrowSettleRequest {
  /** Escrow ID to settle */
  escrowId: string;
  
  /** Model to credit */
  modelId: string;
  
  /** Amount to settle (must match escrow amount) */
  amount: number;
  
  /** Queue item ID */
  queueItemId: string;
  
  /** Reason for settlement */
  reason: TransactionReason;
  
  /** Queue authorization token */
  authorizationToken: string;
  
  /** Idempotency key */
  idempotencyKey: string;
  
  /** Request ID for tracing */
  requestId: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Response from escrow settlement
 */
export interface EscrowSettleResponse {
  /** Transaction ID for settlement */
  transactionId: string;
  
  /** Amount settled */
  settledAmount: number;
  
  /** Model's new earned balance */
  modelEarnedBalance: number;
  
  /** Operation timestamp */
  timestamp: Date;
}

/**
 * Request to refund escrow to user
 */
export interface EscrowRefundRequest {
  /** Escrow ID to refund */
  escrowId: string;
  
  /** User to refund */
  userId: string;
  
  /** Amount to refund (must match escrow amount) */
  amount: number;
  
  /** Queue item ID */
  queueItemId: string;
  
  /** Reason for refund */
  reason: TransactionReason;
  
  /** Queue authorization token */
  authorizationToken: string;
  
  /** Idempotency key */
  idempotencyKey: string;
  
  /** Request ID for tracing */
  requestId: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Response from escrow refund
 */
export interface EscrowRefundResponse {
  /** Transaction ID for refund */
  transactionId: string;
  
  /** Amount refunded */
  refundedAmount: number;
  
  /** User's new available balance */
  userAvailableBalance: number;
  
  /** Operation timestamp */
  timestamp: Date;
}

/**
 * Request for partial refund/settlement
 */
export interface EscrowPartialSettleRequest {
  /** Escrow ID to process */
  escrowId: string;
  
  /** User to refund partial amount */
  userId: string;
  
  /** Model to settle remaining amount */
  modelId: string;
  
  /** Amount to refund to user */
  refundAmount: number;
  
  /** Amount to settle to model */
  settleAmount: number;
  
  /** Queue item ID */
  queueItemId: string;
  
  /** Reason for partial settlement */
  reason: TransactionReason;
  
  /** Queue authorization token */
  authorizationToken: string;
  
  /** Idempotency key */
  idempotencyKey: string;
  
  /** Request ID for tracing */
  requestId: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Response from partial settlement
 */
export interface EscrowPartialSettleResponse {
  /** Transaction ID */
  transactionId: string;
  
  /** Amount refunded to user */
  refundedAmount: number;
  
  /** Amount settled to model */
  settledAmount: number;
  
  /** User's new available balance */
  userAvailableBalance: number;
  
  /** Model's new earned balance */
  modelEarnedBalance: number;
  
  /** Operation timestamp */
  timestamp: Date;
}

/**
 * Balance query response showing all states
 */
export interface BalanceResponse {
  /** User identifier */
  userId: string;
  
  /** Available balance */
  available: number;
  
  /** Escrow balance */
  escrow: number;
  
  /** Total balance (available + escrow) */
  total: number;
  
  /** Balance as of timestamp */
  asOf: Date;
}

/**
 * Escrow details query response
 */
export interface EscrowDetailsResponse {
  /** User identifier */
  userId: string;
  
  /** List of escrow items */
  escrowItems: EscrowItem[];
  
  /** Total amount in escrow */
  totalEscrow: number;
}

/**
 * Queue intake event emitted by features
 */
export interface QueueIntakeEvent {
  /** Queue item ID */
  queueItemId: string;
  
  /** User who initiated */
  userId: string;
  
  /** Feature type */
  featureType: string;
  
  /** Associated escrow ID */
  escrowId: string;
  
  /** Amount held in escrow */
  amount: number;
  
  /** Event timestamp */
  timestamp: Date;
  
  /** Additional context */
  metadata?: Record<string, any>;
}

/**
 * Financial event for messaging system
 */
export interface FinancialEvent {
  /** Event type */
  eventType: 'escrow_held' | 'escrow_settled' | 'escrow_refunded' | 'points_awarded' | 'points_redeemed';
  
  /** Message template ID */
  templateId: string;
  
  /** Template variables */
  variables: Record<string, any>;
  
  /** User or model to notify */
  recipientId: string;
  
  /** Recipient type */
  recipientType: 'user' | 'model';
  
  /** Event timestamp */
  timestamp: Date;
}

/**
 * Idempotency record for tracking processed requests
 */
export interface IdempotencyRecord {
  /** Idempotency key */
  key: string;
  
  /** Operation type */
  operationType: 'hold' | 'settle' | 'refund' | 'partial_settle';
  
  /** Request hash for validation */
  requestHash: string;
  
  /** Result of the operation (stored response) */
  result: EscrowHoldResponse | EscrowSettleResponse | EscrowRefundResponse | EscrowPartialSettleResponse;
  
  /** HTTP status code */
  statusCode: number;
  
  /** Created timestamp */
  createdAt: Date;
  
  /** Expiry timestamp (24+ hours) */
  expiresAt: Date;
}

/**
 * Wallet service configuration
 */
export interface WalletServiceConfig {
  /** Enable idempotency checking */
  enableIdempotency: boolean;
  
  /** Idempotency TTL in seconds */
  idempotencyTtl: number;
  
  /** Maximum retry attempts for optimistic lock conflicts */
  maxRetryAttempts: number;
  
  /** Retry backoff base in milliseconds */
  retryBackoffMs: number;
  
  /** Enable audit logging */
  enableAuditLogging: boolean;
  
  /** Minimum balance (can be negative for overdraft) */
  minimumBalance: number;
}
