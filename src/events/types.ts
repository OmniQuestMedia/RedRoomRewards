/**
 * Event Types and Interfaces
 * 
 * Defines the event-driven architecture for real-time wallet and ledger updates.
 * All events are immutable and support idempotent processing.
 */

/**
 * Base event interface for all reward system events
 */
export interface BaseRewardEvent {
  /** Unique event identifier */
  eventId: string;
  
  /** Event type discriminator */
  eventType: string;
  
  /** Idempotency key for deduplication */
  idempotencyKey: string;
  
  /** When the event was created */
  timestamp: Date;
  
  /** Correlation ID for tracing related events */
  correlationId?: string;
  
  /** Source system or service that emitted the event */
  source: string;
  
  /** Event version for schema evolution */
  version: string;
}

/**
 * Event types for wallet and ledger operations
 */
export enum WalletEventType {
  /** Balance updated in wallet */
  BALANCE_UPDATED = 'wallet.balance_updated',
  
  /** Escrow hold created */
  ESCROW_HELD = 'wallet.escrow_held',
  
  /** Escrow settled to model */
  ESCROW_SETTLED = 'wallet.escrow_settled',
  
  /** Escrow refunded to user */
  ESCROW_REFUNDED = 'wallet.escrow_refunded',
  
  /** Partial escrow settlement */
  ESCROW_PARTIAL_SETTLED = 'wallet.escrow_partial_settled',
  
  /** Ledger entry created */
  LEDGER_ENTRY_CREATED = 'ledger.entry_created',
}

/**
 * Balance update event - emitted whenever a wallet balance changes
 */
export interface BalanceUpdatedEvent extends BaseRewardEvent {
  eventType: WalletEventType.BALANCE_UPDATED;
  
  /** Account that was updated */
  accountId: string;
  
  /** Type of account */
  accountType: 'user' | 'model';
  
  /** Balance state that changed */
  balanceState: 'available' | 'escrow' | 'earned';
  
  /** Balance before update */
  balanceBefore: number;
  
  /** Balance after update */
  balanceAfter: number;
  
  /** Change amount (can be negative) */
  changeAmount: number;
  
  /** Reason for the change */
  reason: string;
  
  /** Related transaction ID */
  transactionId: string;
  
  /** Related ledger entry ID */
  ledgerEntryId: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Escrow held event - emitted when funds are moved to escrow
 */
export interface EscrowHeldEvent extends BaseRewardEvent {
  eventType: WalletEventType.ESCROW_HELD;
  
  /** User who initiated the escrow */
  userId: string;
  
  /** Unique escrow identifier */
  escrowId: string;
  
  /** Amount held in escrow */
  amount: number;
  
  /** Reason for holding */
  reason: string;
  
  /** Related queue item ID */
  queueItemId: string;
  
  /** Feature type that initiated */
  featureType: string;
  
  /** Related transaction ID */
  transactionId: string;
  
  /** User's new available balance */
  userAvailableBalance: number;
  
  /** User's new escrow balance */
  userEscrowBalance: number;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Escrow settled event - emitted when escrow is settled to model
 */
export interface EscrowSettledEvent extends BaseRewardEvent {
  eventType: WalletEventType.ESCROW_SETTLED;
  
  /** Original user who held the escrow */
  userId: string;
  
  /** Model receiving the settlement */
  modelId: string;
  
  /** Escrow identifier */
  escrowId: string;
  
  /** Amount settled */
  amount: number;
  
  /** Reason for settlement */
  reason: string;
  
  /** Related queue item ID */
  queueItemId: string;
  
  /** Related transaction ID */
  transactionId: string;
  
  /** Model's new earned balance */
  modelEarnedBalance: number;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Escrow refunded event - emitted when escrow is refunded to user
 */
export interface EscrowRefundedEvent extends BaseRewardEvent {
  eventType: WalletEventType.ESCROW_REFUNDED;
  
  /** User receiving the refund */
  userId: string;
  
  /** Escrow identifier */
  escrowId: string;
  
  /** Amount refunded */
  amount: number;
  
  /** Reason for refund */
  reason: string;
  
  /** Related queue item ID */
  queueItemId: string;
  
  /** Related transaction ID */
  transactionId: string;
  
  /** User's new available balance */
  userAvailableBalance: number;
  
  /** User's new escrow balance */
  userEscrowBalance: number;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Partial escrow settlement event
 */
export interface EscrowPartialSettledEvent extends BaseRewardEvent {
  eventType: WalletEventType.ESCROW_PARTIAL_SETTLED;
  
  /** User who held the escrow */
  userId: string;
  
  /** Model receiving partial settlement */
  modelId: string;
  
  /** Escrow identifier */
  escrowId: string;
  
  /** Amount refunded to user */
  refundAmount: number;
  
  /** Amount settled to model */
  settleAmount: number;
  
  /** Reason for partial settlement */
  reason: string;
  
  /** Related queue item ID */
  queueItemId: string;
  
  /** Related transaction ID */
  transactionId: string;
  
  /** User's new available balance */
  userAvailableBalance: number;
  
  /** User's new escrow balance (after partial settlement) */
  userEscrowBalance: number;
  
  /** Model's new earned balance */
  modelEarnedBalance: number;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Ledger entry created event - emitted for every ledger entry
 */
export interface LedgerEntryCreatedEvent extends BaseRewardEvent {
  eventType: WalletEventType.LEDGER_ENTRY_CREATED;
  
  /** Ledger entry identifier */
  entryId: string;
  
  /** Transaction identifier */
  transactionId: string;
  
  /** Account affected */
  accountId: string;
  
  /** Account type */
  accountType: 'user' | 'model';
  
  /** Amount of change */
  amount: number;
  
  /** Transaction type */
  transactionType: 'credit' | 'debit';
  
  /** Balance state affected */
  balanceState: 'available' | 'escrow' | 'earned';
  
  /** State transition description */
  stateTransition: string;
  
  /** Reason for entry */
  reason: string;
  
  /** Balance before entry */
  balanceBefore: number;
  
  /** Balance after entry */
  balanceAfter: number;
  
  /** Related escrow ID */
  escrowId?: string;
  
  /** Related queue item ID */
  queueItemId?: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Union type of all reward events
 */
export type RewardEvent =
  | BalanceUpdatedEvent
  | EscrowHeldEvent
  | EscrowSettledEvent
  | EscrowRefundedEvent
  | EscrowPartialSettledEvent
  | LedgerEntryCreatedEvent;

/**
 * Event handler function signature
 */
export type EventHandler<T extends BaseRewardEvent = RewardEvent> = (
  event: T
) => Promise<void>;

/**
 * Event subscriber configuration
 */
export interface EventSubscription {
  /** Subscriber identifier */
  subscriberId: string;
  
  /** Event types to subscribe to */
  eventTypes: WalletEventType[];
  
  /** Handler function */
  handler: EventHandler;
  
  /** Priority (lower number = higher priority) */
  priority?: number;
}

/**
 * Event publishing result
 */
export interface EventPublishResult {
  /** Event ID that was published */
  eventId: string;
  
  /** Whether publish was successful */
  success: boolean;
  
  /** Number of handlers that processed the event */
  handlersNotified: number;
  
  /** Any errors that occurred */
  errors?: Array<{
    subscriberId: string;
    error: string;
  }>;
}
