/**
 * Acknowledgment Module Types
 * 
 * Defines types for delivery acknowledgments with retry support
 */

/**
 * Delivery state for acknowledgments
 */
export enum DeliveryState {
  /** Pending delivery */
  PENDING = 'pending',
  
  /** Delivery in progress */
  DELIVERING = 'delivering',
  
  /** Successfully delivered */
  DELIVERED = 'delivered',
  
  /** Delivery failed (will retry) */
  FAILED = 'failed',
  
  /** Delivery permanently failed */
  FAILED_PERMANENT = 'failed_permanent',
}

/**
 * Acknowledgment record
 */
export interface Acknowledgment {
  /** Ack ID */
  ackId: string;
  
  /** Target endpoint or recipient */
  target: string;
  
  /** Event or message being acknowledged */
  eventId: string;
  
  /** Payload to deliver */
  payload: any;
  
  /** Current delivery state */
  state: DeliveryState;
  
  /** Retry count */
  retryCount: number;
  
  /** Max retries allowed */
  maxRetries: number;
  
  /** Created at */
  createdAt: Date;
  
  /** Last attempt at */
  lastAttemptAt?: Date;
  
  /** Delivered at */
  deliveredAt?: Date;
  
  /** Next retry at */
  nextRetryAt?: Date;
  
  /** Error message if failed */
  errorMessage?: string;
  
  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Delivery result
 */
export interface DeliveryResult {
  /** Ack ID */
  ackId: string;
  
  /** Success status */
  success: boolean;
  
  /** Error if failed */
  error?: string;
  
  /** Response from target */
  response?: any;
  
  /** Delivery timestamp */
  timestamp: Date;
}

/**
 * Ack statistics
 */
export interface AckStatistics {
  /** Total acks created */
  totalCreated: number;
  
  /** Successfully delivered */
  totalDelivered: number;
  
  /** Currently pending */
  totalPending: number;
  
  /** Currently delivering */
  totalDelivering: number;
  
  /** Failed (retrying) */
  totalFailed: number;
  
  /** Failed permanently */
  totalFailedPermanent: number;
  
  /** Average retry count */
  avgRetryCount: number;
  
  /** Statistics generated at */
  generatedAt: Date;
}
