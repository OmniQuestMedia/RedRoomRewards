/**
 * Service Layer Type Definitions
 * 
 * Defines interfaces for service orchestration, queue integration,
 * and external system boundaries.
 * 
 * @see /docs/WALLET_ESCROW_ARCHITECTURE.md for architecture details
 */

import { 
  EscrowHoldRequest, 
  EscrowHoldResponse,
  EscrowSettleRequest,
  EscrowSettleResponse,
  EscrowRefundRequest,
  EscrowRefundResponse,
  EscrowPartialSettleRequest,
  EscrowPartialSettleResponse,
  QueueIntakeEvent,
  FinancialEvent,
  TransactionReason
} from '../wallets/types';

/**
 * Performance queue item status
 */
export enum QueueItemStatus {
  /** Item queued, awaiting performance */
  QUEUED = 'queued',
  
  /** Performance in progress */
  IN_PROGRESS = 'in_progress',
  
  /** Performance completed successfully */
  FINISHED = 'finished',
  
  /** Performance abandoned or cancelled */
  ABANDONED = 'abandoned',
  
  /** Partial performance delivered */
  PARTIAL = 'partial',
}

/**
 * Performance queue item
 */
export interface QueueItem {
  /** Queue item identifier */
  queueItemId: string;
  
  /** User who requested performance */
  userId: string;
  
  /** Model who will perform */
  modelId: string;
  
  /** Associated escrow ID */
  escrowId: string;
  
  /** Amount held in escrow */
  amount: number;
  
  /** Feature type that created this item */
  featureType: string;
  
  /** Current status */
  status: QueueItemStatus;
  
  /** Queue priority (higher = sooner) */
  priority: number;
  
  /** Item created timestamp */
  createdAt: Date;
  
  /** Performance started timestamp */
  startedAt?: Date;
  
  /** Performance completed timestamp */
  completedAt?: Date;
  
  /** Reason for current status */
  statusReason?: TransactionReason;
  
  /** Additional context */
  metadata?: Record<string, any>;
}

/**
 * Request to add item to performance queue
 */
export interface QueueIntakeRequest {
  /** User requesting performance */
  userId: string;
  
  /** Model to perform */
  modelId: string;
  
  /** Escrow ID holding funds */
  escrowId: string;
  
  /** Amount in escrow */
  amount: number;
  
  /** Feature initiating request */
  featureType: string;
  
  /** Priority level */
  priority?: number;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Queue settlement authorization
 * Only the queue can issue these to wallet service
 */
export interface QueueSettlementAuthorization {
  /** Queue item ID */
  queueItemId: string;
  
  /** Authorization token (signed JWT) */
  token: string;
  
  /** Escrow ID to settle */
  escrowId: string;
  
  /** Model to credit */
  modelId: string;
  
  /** Amount to settle */
  amount: number;
  
  /** Reason for settlement */
  reason: TransactionReason;
  
  /** Token issued at */
  issuedAt: Date;
  
  /** Token expires at */
  expiresAt: Date;
}

/**
 * Queue refund authorization
 * Only the queue can issue these to wallet service
 */
export interface QueueRefundAuthorization {
  /** Queue item ID */
  queueItemId: string;
  
  /** Authorization token (signed JWT) */
  token: string;
  
  /** Escrow ID to refund */
  escrowId: string;
  
  /** User to refund */
  userId: string;
  
  /** Amount to refund */
  amount: number;
  
  /** Reason for refund */
  reason: TransactionReason;
  
  /** Token issued at */
  issuedAt: Date;
  
  /** Token expires at */
  expiresAt: Date;
}

/**
 * Queue partial settlement authorization
 */
export interface QueuePartialSettlementAuthorization {
  /** Queue item ID */
  queueItemId: string;
  
  /** Authorization token (signed JWT) */
  token: string;
  
  /** Escrow ID to process */
  escrowId: string;
  
  /** User to refund partial */
  userId: string;
  
  /** Model to settle partial */
  modelId: string;
  
  /** Refund amount */
  refundAmount: number;
  
  /** Settle amount */
  settleAmount: number;
  
  /** Reason for partial settlement */
  reason: TransactionReason;
  
  /** Token issued at */
  issuedAt: Date;
  
  /** Token expires at */
  expiresAt: Date;
}

/**
 * Wallet service interface
 * Executes atomic ledger changes without business logic
 */
export interface IWalletService {
  /**
   * Hold funds in escrow (deduct from available)
   */
  holdInEscrow(request: EscrowHoldRequest): Promise<EscrowHoldResponse>;
  
  /**
   * Settle escrow to model earnings
   * Requires queue authorization
   */
  settleEscrow(
    request: EscrowSettleRequest,
    authorization: QueueSettlementAuthorization
  ): Promise<EscrowSettleResponse>;
  
  /**
   * Refund escrow to user available
   * Requires queue authorization
   */
  refundEscrow(
    request: EscrowRefundRequest,
    authorization: QueueRefundAuthorization
  ): Promise<EscrowRefundResponse>;
  
  /**
   * Partial refund and settlement
   * Requires queue authorization
   */
  partialSettleEscrow(
    request: EscrowPartialSettleRequest,
    authorization: QueuePartialSettlementAuthorization
  ): Promise<EscrowPartialSettleResponse>;
  
  /**
   * Get user wallet balance (all states)
   */
  getUserBalance(userId: string): Promise<{
    available: number;
    escrow: number;
    total: number;
  }>;
  
  /**
   * Get model wallet balance
   */
  getModelBalance(modelId: string): Promise<{
    earned: number;
  }>;
}

/**
 * Queue service interface
 * Sole authority for settlement/refund decisions
 */
export interface IQueueService {
  /**
   * Add item to performance queue
   * Called by features after escrow hold
   */
  enqueue(request: QueueIntakeRequest): Promise<QueueItem>;
  
  /**
   * Mark performance as started
   */
  startPerformance(queueItemId: string): Promise<QueueItem>;
  
  /**
   * Mark performance as finished and settle
   */
  finishPerformance(queueItemId: string, modelId: string): Promise<{
    queueItem: QueueItem;
    settlement: EscrowSettleResponse;
  }>;
  
  /**
   * Abandon performance and refund
   */
  abandonPerformance(queueItemId: string, reason: TransactionReason): Promise<{
    queueItem: QueueItem;
    refund: EscrowRefundResponse;
  }>;
  
  /**
   * Partial completion with split settlement/refund
   */
  partialCompletion(
    queueItemId: string,
    refundAmount: number,
    settleAmount: number,
    reason: TransactionReason
  ): Promise<{
    queueItem: QueueItem;
    partialSettle: EscrowPartialSettleResponse;
  }>;
  
  /**
   * Get queue item status
   */
  getQueueItem(queueItemId: string): Promise<QueueItem | null>;
  
  /**
   * Get user's queued items
   */
  getUserQueueItems(userId: string): Promise<QueueItem[]>;
  
  /**
   * Get model's queued items
   */
  getModelQueueItems(modelId: string): Promise<QueueItem[]>;
}

/**
 * Base interface for feature action data
 */
export interface FeatureActionData {
  /** Amount involved in the action */
  amount: number;
  
  /** User initiating the action */
  userId: string;
  
  /** Model involved in the action (if applicable) */
  modelId?: string;
  
  /** Additional feature-specific data */
  [key: string]: any;
}

/**
 * Feature module interface
 * Modules request escrow and emit queue events, never settle directly
 */
export interface IFeatureModule {
  /** Feature identifier */
  featureType: string;
  
  /**
   * Process user action
   * Should: check balance, request escrow, emit queue event
   * Should NOT: settle or refund
   */
  processAction(
    userId: string,
    actionData: FeatureActionData
  ): Promise<{
    escrowHold: EscrowHoldResponse;
    queueIntake: QueueIntakeEvent;
  }>;
  
  /**
   * Validate action parameters
   */
  validateAction(actionData: FeatureActionData): Promise<boolean>;
}

/**
 * Messaging service interface
 * Consumes financial events and sends notifications
 */
export interface IMessagingService {
  /**
   * Send financial event notification
   */
  sendFinancialNotification(event: FinancialEvent): Promise<void>;
  
  /**
   * Format message from template
   */
  formatMessage(templateId: string, variables: Record<string, any>): Promise<string>;
}

/**
 * Service error types
 */
export class WalletServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'WalletServiceError';
  }
}

export class InsufficientBalanceError extends WalletServiceError {
  constructor(required: number, available: number) {
    super(
      `Insufficient balance. Required: ${required}, Available: ${available}`,
      'INSUFFICIENT_BALANCE',
      402,
      { required, available }
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class EscrowNotFoundError extends WalletServiceError {
  constructor(escrowId: string) {
    super(
      `Escrow not found: ${escrowId}`,
      'ESCROW_NOT_FOUND',
      404,
      { escrowId }
    );
    this.name = 'EscrowNotFoundError';
  }
}

export class EscrowAlreadyProcessedError extends WalletServiceError {
  constructor(escrowId: string, status: string) {
    super(
      `Escrow already processed: ${escrowId} (status: ${status})`,
      'ESCROW_ALREADY_PROCESSED',
      409,
      { escrowId, status }
    );
    this.name = 'EscrowAlreadyProcessedError';
  }
}

export class InvalidAuthorizationError extends WalletServiceError {
  constructor(message: string) {
    super(
      `Invalid authorization: ${message}`,
      'INVALID_AUTHORIZATION',
      403
    );
    this.name = 'InvalidAuthorizationError';
  }
}

export class OptimisticLockError extends WalletServiceError {
  constructor(resourceType: string, resourceId: string) {
    super(
      `Optimistic lock conflict on ${resourceType}: ${resourceId}`,
      'OPTIMISTIC_LOCK_CONFLICT',
      409,
      { resourceType, resourceId }
    );
    this.name = 'OptimisticLockError';
  }
}

export class IdempotencyConflictError extends WalletServiceError {
  constructor(key: string, existingResult: any) {
    super(
      `Request with idempotency key already processed: ${key}`,
      'IDEMPOTENCY_CONFLICT',
      200,
      { key, existingResult }
    );
    this.name = 'IdempotencyConflictError';
  }
}

/**
 * Service health check
 */
export interface ServiceHealth {
  /** Service name */
  service: string;
  
  /** Health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  
  /** Status message */
  message?: string;
  
  /** Last check timestamp */
  checkedAt: Date;
  
  /** Additional metrics */
  metrics?: Record<string, any>;
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  /** Wallet service config */
  wallet: {
    enableIdempotency: boolean;
    idempotencyTtlSeconds: number;
    maxRetryAttempts: number;
    retryBackoffMs: number;
  };
  
  /** Queue service config */
  queue: {
    defaultPriority: number;
    maxQueueSize: number;
    itemTimeoutSeconds: number;
  };
  
  /** Authorization config */
  authorization: {
    tokenSecret: string;
    tokenExpirySeconds: number;
    algorithm: 'HS256' | 'HS384' | 'HS512';
  };
}
