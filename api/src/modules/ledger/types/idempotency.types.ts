/**
 * Idempotency Framework Type Definitions
 * 
 * Defines types for the idempotency framework that prevents duplicate
 * transaction processing and ensures financial integrity across ledger operations.
 * 
 * @module api/src/modules/ledger/types
 */

/**
 * Result of an idempotency check
 */
export interface IdempotencyCheckResult {
  /** Whether the idempotency key has been used before */
  isDuplicate: boolean;
  
  /** Stored result from previous request (if duplicate) */
  storedResult?: any;
  
  /** HTTP status code from previous request (if duplicate) */
  statusCode?: number;
  
  /** Timestamp of original request (if duplicate) */
  originalTimestamp?: Date;
}

/**
 * Request to store an idempotency result
 */
export interface StoreIdempotencyRequest {
  /** Unique idempotency key */
  idempotencyKey: string;
  
  /** Operation type/scope */
  operationType: string;
  
  /** Result data to store */
  result: any;
  
  /** HTTP status code */
  statusCode: number;
  
  /** TTL in seconds (how long to retain) */
  ttlSeconds?: number;
}

/**
 * Validation result for transaction UUIDs
 */
export interface UuidValidationResult {
  /** Whether the UUID is valid */
  isValid: boolean;
  
  /** Error message if invalid */
  errorMessage?: string;
  
  /** The validated UUID */
  uuid?: string;
}

/**
 * Transaction request with idempotency key
 */
export interface IdempotentTransactionRequest {
  /** Unique idempotency key (UUID format) */
  idempotencyKey: string;
  
  /** Optional request ID for tracing */
  requestId?: string;
  
  /** Transaction-specific data */
  [key: string]: any;
}

/**
 * Configuration for idempotency behavior
 */
export interface IdempotencyConfig {
  /** Default TTL for idempotency records in seconds (default: 86400 = 24 hours) */
  defaultTtlSeconds: number;
  
  /** Whether to store full response bodies */
  storeFullResponse: boolean;
  
  /** Maximum size of stored response in bytes */
  maxResponseSize: number;
  
  /** Whether to enable idempotency logging */
  enableLogging: boolean;
}

/**
 * Idempotency service interface
 */
export interface IIdempotencyService {
  /**
   * Check if an idempotency key has been used
   */
  checkIdempotency(
    idempotencyKey: string,
    operationType: string
  ): Promise<IdempotencyCheckResult>;
  
  /**
   * Store the result of an idempotent operation
   */
  storeResult(request: StoreIdempotencyRequest): Promise<void>;
  
  /**
   * Validate that a string is a valid UUID
   */
  validateUuid(value: string): UuidValidationResult;
  
  /**
   * Extract idempotency key from request
   */
  extractIdempotencyKey(headers: any, body?: any): string | null;
}

/**
 * Error thrown when duplicate request is detected
 */
export class DuplicateRequestError extends Error {
  constructor(
    message: string,
    public readonly storedResult: any,
    public readonly statusCode: number,
    public readonly originalTimestamp: Date
  ) {
    super(message);
    this.name = 'DuplicateRequestError';
    Object.setPrototypeOf(this, DuplicateRequestError.prototype);
  }
}

/**
 * Error thrown when idempotency key is invalid
 */
export class InvalidIdempotencyKeyError extends Error {
  constructor(
    message: string,
    public readonly providedKey: string
  ) {
    super(message);
    this.name = 'InvalidIdempotencyKeyError';
    Object.setPrototypeOf(this, InvalidIdempotencyKeyError.prototype);
  }
}
