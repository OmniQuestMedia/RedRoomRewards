/**
 * Wallet Queue and Messaging Type Definitions
 *
 * Types for queue intake events, financial messaging, idempotency,
 * and wallet service configuration.
 */

import {
  EscrowHoldResponse,
  EscrowSettleResponse,
  EscrowRefundResponse,
  EscrowPartialSettleResponse,
} from './escrow.types';

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
  metadata?: Record<string, unknown>;
}

/**
 * Financial event for messaging system
 */
export interface FinancialEvent {
  /** Event type */
  eventType:
    'escrow_held' | 'escrow_settled' | 'escrow_refunded' | 'points_awarded' | 'points_redeemed';

  /** Message template ID */
  templateId: string;

  /** Template variables */
  variables: Record<string, unknown>;

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
  result:
    EscrowHoldResponse | EscrowSettleResponse | EscrowRefundResponse | EscrowPartialSettleResponse;

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
