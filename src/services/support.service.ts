/**
 * Support Operations Service
 * 
 * Provides read-only diagnostic endpoints for admin/support staff.
 * All operations require admin/support authorization.
 * 
 * @module services/support
 * @see WO-RRR-0108 for observability requirements
 */

import { IdempotencyRecordModel } from '../db/models';
import { UserRole } from './auth.service';

/**
 * Receipt lookup query params
 */
export interface ReceiptLookupQuery {
  merchantId?: string;
  idempotencyKey: string;
}

/**
 * Receipt response (read-only, redacted)
 * Contains ONLY safe fields - no request body, signatures, secrets, or PII
 */
export interface ReceiptResponse {
  correlationId?: string;
  merchantId?: string;
  eventId?: string;
  idempotencyKey: string;
  processedAt?: Date;
  status: 'queued' | 'processed' | 'not_found';
  accepted: boolean;
  replayed: boolean;
  postedTransactions?: string[];
  errorCode?: string;
}

/**
 * Support Service Configuration
 */
export interface SupportServiceConfig {
  /** Allowed roles for support endpoints */
  allowedRoles: UserRole[];
}

const DEFAULT_CONFIG: SupportServiceConfig = {
  allowedRoles: [UserRole.ADMIN, UserRole.SYSTEM],
};

/**
 * Support Service Implementation
 * 
 * Provides read-only operations for support and diagnostics.
 * All operations require proper authorization.
 */
export class SupportService {
  private config: SupportServiceConfig;

  constructor(config: Partial<SupportServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Look up event receipt by idempotency key
   * 
   * Returns redacted receipt information for support diagnostics.
   * Does NOT return request bodies, signatures, secrets, or PII.
   * 
   * @param query - Receipt lookup query
   * @returns Promise<ReceiptResponse>
   */
  async lookupReceipt(query: ReceiptLookupQuery): Promise<ReceiptResponse> {
    // Query idempotency records for event_ingestion scope
    const record = await IdempotencyRecordModel.findOne({
      pointsIdempotencyKey: query.idempotencyKey,
      eventScope: 'event_ingestion',
    });

    if (!record) {
      return {
        idempotencyKey: query.idempotencyKey,
        merchantId: query.merchantId,
        status: 'not_found',
        accepted: false,
        replayed: false,
      };
    }

    // Extract safe fields from stored result
    const storedResult = record.storedResult || {};
    const correlationId = storedResult.correlationId as string | undefined;
    const eventId = storedResult.eventId as string | undefined;
    const queued = storedResult.queued as boolean | undefined;
    const errorCode = storedResult.errorCode as string | undefined;
    const postedTransactions = storedResult.postedTransactions as string[] | undefined;

    // Determine if this was a replayed request (record exists = replayed on subsequent calls)
    const replayed = record.createdAt ? true : false;

    return {
      correlationId,
      merchantId: query.merchantId,
      eventId,
      idempotencyKey: query.idempotencyKey,
      processedAt: record.createdAt,
      status: queued ? 'queued' : 'processed',
      accepted: queued === true || queued === undefined,
      replayed,
      postedTransactions,
      errorCode,
    };
  }

  /**
   * Validate that user has required role for support operations
   * 
   * @param userRole - User's role
   * @throws Error if user doesn't have required permissions
   */
  validateSupportAccess(userRole: UserRole): void {
    if (!this.config.allowedRoles.includes(userRole) && userRole !== UserRole.ADMIN) {
      throw new Error('Insufficient permissions for support operations');
    }
  }
}

/**
 * Factory function to create support service instance
 */
export function createSupportService(config?: Partial<SupportServiceConfig>): SupportService {
  return new SupportService(config);
}
