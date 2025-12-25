/**
 * Points Contract Type Definitions
 * 
 * Defines composite idempotency contracts, validation schemas,
 * and reservation operations for the RRR points system.
 * 
 * Key Features:
 * - Composite idempotency: (pointsIdempotencyKey, eventScope)
 * - Legacy webhook idempotency by event_id (separate)
 * - Strict validation: additionalProperties:false
 */

/**
 * Event scope for composite idempotency
 * Ensures same idempotency key can be used across different event types
 */
export enum EventScope {
  RESERVE = 'reserve',
  COMMIT = 'commit',
  RELEASE = 'release',
  AWARD = 'award',
  DEDUCT = 'deduct',
  WEBHOOK = 'webhook',
}

/**
 * Composite idempotency key structure
 * Combines key + scope to enable key reuse across different operations
 */
export interface CompositeIdempotencyKey {
  /** The idempotency key provided by client */
  pointsIdempotencyKey: string;
  
  /** The event scope to differentiate operations */
  eventScope: EventScope;
}

/**
 * Idempotency record for tracking processed requests
 */
export interface IdempotencyRecord {
  /** Composite key (combined internally) */
  compositeKey: string;
  
  /** Original idempotency key */
  pointsIdempotencyKey: string;
  
  /** Event scope */
  eventScope: EventScope;
  
  /** Request hash for validation */
  requestHash: string;
  
  /** Stored response */
  result: any;
  
  /** HTTP status code */
  statusCode: number;
  
  /** Created timestamp */
  createdAt: Date;
  
  /** Expiry timestamp (24+ hours) */
  expiresAt: Date;
}

/**
 * Legacy webhook idempotency (separate from composite)
 * Used for backward compatibility with existing webhook integrations
 */
export interface WebhookIdempotencyRecord {
  /** Legacy event_id field */
  event_id: string;
  
  /** Event type */
  event_type: string;
  
  /** Stored payload */
  payload: any;
  
  /** Processed timestamp */
  processed_at: Date;
  
  /** Expiry timestamp (90 days per TTL) */
  expires_at: Date;
}

/**
 * Validation options with strict mode enforcement
 */
export interface ValidationOptions {
  /** Reject unknown fields (additionalProperties: false) */
  strictValidation: boolean;
  
  /** Required fields list */
  requiredFields: string[];
  
  /** Optional fields list */
  optionalFields?: string[];
  
  /** Custom validators */
  customValidators?: Record<string, (value: any) => boolean>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  
  /** Validation errors if any */
  errors: ValidationError[];
  
  /** Sanitized/validated data */
  data?: any;
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** Field name with error */
  field: string;
  
  /** Error message */
  message: string;
  
  /** Error code */
  code: 'MISSING_FIELD' | 'UNKNOWN_FIELD' | 'INVALID_TYPE' | 'INVALID_VALUE' | 'VALIDATION_FAILED';
  
  /** Actual value (for debugging) */
  value?: any;
}

/**
 * Base request interface with composite idempotency
 */
export interface BasePointsRequest {
  /** Composite idempotency key */
  pointsIdempotencyKey: string;
  
  /** Event scope */
  eventScope: EventScope;
  
  /** Request ID for tracing */
  requestId: string;
  
  /** Timestamp */
  timestamp: Date;
}

/**
 * Reservation request
 * Holds points for a specified duration (TTL)
 */
export interface ReservePointsRequest extends BasePointsRequest {
  eventScope: EventScope.RESERVE;
  
  /** User identifier */
  userId: string;
  
  /** Amount to reserve */
  amount: number;
  
  /** Reason for reservation */
  reason: string;
  
  /** TTL in seconds (default: 300 = 5 minutes) */
  ttlSeconds?: number;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Reservation response
 */
export interface ReservePointsResponse {
  /** Created reservation ID */
  reservationId: string;
  
  /** Transaction ID in ledger */
  transactionId: string;
  
  /** User's previous available balance */
  previousBalance: number;
  
  /** User's new available balance */
  newAvailableBalance: number;
  
  /** Amount reserved */
  reservedAmount: number;
  
  /** Reservation expires at */
  expiresAt: Date;
  
  /** Operation timestamp */
  timestamp: Date;
}

/**
 * Commit reservation request
 * Finalizes the reservation and completes the transaction
 */
export interface CommitReservationRequest extends BasePointsRequest {
  eventScope: EventScope.COMMIT;
  
  /** Reservation ID to commit */
  reservationId: string;
  
  /** User identifier (must match reservation) */
  userId: string;
  
  /** Optional: recipient for settled points */
  recipientId?: string;
  
  /** Reason for commit */
  reason: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Commit reservation response
 */
export interface CommitReservationResponse {
  /** Reservation ID that was committed */
  reservationId: string;
  
  /** Transaction ID in ledger */
  transactionId: string;
  
  /** Amount committed */
  committedAmount: number;
  
  /** Recipient balance (if applicable) */
  recipientBalance?: number;
  
  /** Operation timestamp */
  timestamp: Date;
}

/**
 * Release reservation request
 * Cancels the reservation and returns points to available balance
 */
export interface ReleaseReservationRequest extends BasePointsRequest {
  eventScope: EventScope.RELEASE;
  
  /** Reservation ID to release */
  reservationId: string;
  
  /** User identifier (must match reservation) */
  userId: string;
  
  /** Reason for release */
  reason: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Release reservation response
 */
export interface ReleaseReservationResponse {
  /** Reservation ID that was released */
  reservationId: string;
  
  /** Transaction ID in ledger */
  transactionId: string;
  
  /** Amount released back to available */
  releasedAmount: number;
  
  /** User's new available balance */
  newAvailableBalance: number;
  
  /** Operation timestamp */
  timestamp: Date;
}

/**
 * Reservation status
 */
export enum ReservationStatus {
  /** Reservation is active and holding points */
  ACTIVE = 'active',
  
  /** Reservation has been committed */
  COMMITTED = 'committed',
  
  /** Reservation has been released */
  RELEASED = 'released',
  
  /** Reservation has expired (TTL reached) */
  EXPIRED = 'expired',
}

/**
 * Reservation record for tracking
 */
export interface Reservation {
  /** Unique reservation identifier */
  reservationId: string;
  
  /** User identifier */
  userId: string;
  
  /** Amount reserved */
  amount: number;
  
  /** Current status */
  status: ReservationStatus;
  
  /** Reason for reservation */
  reason: string;
  
  /** TTL in seconds */
  ttlSeconds: number;
  
  /** Created at */
  createdAt: Date;
  
  /** Expires at */
  expiresAt: Date;
  
  /** Processed at (commit/release/expiry) */
  processedAt?: Date;
  
  /** Related transaction IDs */
  transactionIds: string[];
  
  /** Idempotency key used */
  pointsIdempotencyKey: string;
  
  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Contract validation error
 */
export class ContractValidationError extends Error {
  constructor(
    message: string,
    public errors: ValidationError[],
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

/**
 * Reservation error types
 */
export class ReservationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ReservationError';
  }
}

export class ReservationNotFoundError extends ReservationError {
  constructor(reservationId: string) {
    super(
      `Reservation not found: ${reservationId}`,
      'RESERVATION_NOT_FOUND',
      404,
      { reservationId }
    );
  }
}

export class ReservationExpiredError extends ReservationError {
  constructor(reservationId: string, expiresAt: Date) {
    super(
      `Reservation expired: ${reservationId}`,
      'RESERVATION_EXPIRED',
      410,
      { reservationId, expiresAt }
    );
  }
}

export class ReservationAlreadyProcessedError extends ReservationError {
  constructor(reservationId: string, status: ReservationStatus) {
    super(
      `Reservation already processed: ${reservationId} (status: ${status})`,
      'RESERVATION_ALREADY_PROCESSED',
      409,
      { reservationId, status }
    );
  }
}
