/**
 * Idempotency Service Implementation
 * 
 * Provides idempotency checking and duplicate request prevention
 * for financial transactions across the ledger module.
 * 
 * @module api/src/modules/ledger/services
 */

import { validate as validateUuid } from 'uuid';
import {
  IIdempotencyService,
  IdempotencyCheckResult,
  StoreIdempotencyRequest,
  UuidValidationResult,
  IdempotencyConfig,
} from '../types/idempotency.types';
import { IdempotencyRecordModel } from '../../../../../src/db/models/idempotency.model';

/**
 * Default configuration for idempotency service
 */
const DEFAULT_CONFIG: IdempotencyConfig = {
  defaultTtlSeconds: 86400, // 24 hours
  storeFullResponse: true,
  maxResponseSize: 100000, // 100KB
  enableLogging: true,
};

/**
 * Idempotency Service
 * 
 * Handles idempotency key validation and duplicate request detection
 * to ensure financial transactions are processed exactly once.
 */
export class IdempotencyService implements IIdempotencyService {
  private config: IdempotencyConfig;

  constructor(config: Partial<IdempotencyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if an idempotency key has been used before
   * 
   * @param idempotencyKey - The unique idempotency key
   * @param operationType - The type of operation (e.g., 'transaction', 'settlement')
   * @returns Result indicating if this is a duplicate request
   */
  async checkIdempotency(
    idempotencyKey: string,
    operationType: string
  ): Promise<IdempotencyCheckResult> {
    // Validate UUID format
    const validation = this.validateUuid(idempotencyKey);
    if (!validation.isValid) {
      throw new Error(`Invalid idempotency key format: ${validation.errorMessage}`);
    }

    // Check if record exists
    const existing = await IdempotencyRecordModel.findOne({
      pointsIdempotencyKey: { $eq: idempotencyKey },
      eventScope: { $eq: operationType },
    }).lean().exec();

    if (!existing) {
      return {
        isDuplicate: false,
      };
    }

    // Parse stored status code from resultHash if available
    let statusCode = 200; // Default
    try {
      const hashData = JSON.parse(existing.resultHash);
      if (hashData.statusCode) {
        statusCode = hashData.statusCode;
      }
    } catch {
      // If parsing fails, use default
    }

    // Return stored result for duplicate request
    return {
      isDuplicate: true,
      storedResult: existing.storedResult,
      statusCode,
      originalTimestamp: existing.createdAt,
    };
  }

  /**
   * Store the result of an idempotent operation
   * 
   * @param request - Request containing idempotency key and result to store
   */
  async storeResult(request: StoreIdempotencyRequest): Promise<void> {
    const {
      idempotencyKey,
      operationType,
      result,
      statusCode,
      ttlSeconds = this.config.defaultTtlSeconds,
    } = request;

    // Validate UUID format
    const validation = this.validateUuid(idempotencyKey);
    if (!validation.isValid) {
      throw new Error(`Invalid idempotency key format: ${validation.errorMessage}`);
    }

    // Calculate expiration times
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    // retentionUntil set to longer period for compliance (7 years minimum per COPILOT_GOVERNANCE.md)
    const retentionUntil = new Date(Date.now() + (2555 * 24 * 60 * 60 * 1000)); // 7 years

    // Prepare result for storage
    let storedResult = result;
    if (this.config.storeFullResponse) {
      const resultStr = JSON.stringify(result);
      if (resultStr.length > this.config.maxResponseSize) {
        // Truncate if too large
        storedResult = {
          _truncated: true,
          _size: resultStr.length,
          summary: 'Response too large to store',
        };
      }
    }

    // Store idempotency record
    try {
      await IdempotencyRecordModel.create({
        pointsIdempotencyKey: idempotencyKey,
        eventScope: operationType,
        resultHash: JSON.stringify({ statusCode, timestamp: new Date() }),
        storedResult,
        expiresAt,
        retentionUntil,
      });

      if (this.config.enableLogging) {
        console.log(`[Idempotency] Stored result for key=${idempotencyKey}, type=${operationType}`);
      }
    } catch (error: any) {
      // Ignore duplicate key errors (race condition - another request stored first)
      if (error.code === 11000) {
        if (this.config.enableLogging) {
          console.log(`[Idempotency] Race condition detected for key=${idempotencyKey}, ignoring duplicate store`);
        }
        return;
      }
      throw error;
    }
  }

  /**
   * Validate that a string is a valid UUID (v4)
   * 
   * @param value - String to validate
   * @returns Validation result with error message if invalid
   */
  validateUuid(value: string): UuidValidationResult {
    if (!value) {
      return {
        isValid: false,
        errorMessage: 'UUID is required',
      };
    }

    if (typeof value !== 'string') {
      return {
        isValid: false,
        errorMessage: 'UUID must be a string',
      };
    }

    if (!validateUuid(value)) {
      return {
        isValid: false,
        errorMessage: 'UUID format is invalid',
      };
    }

    return {
      isValid: true,
      uuid: value,
    };
  }

  /**
   * Extract idempotency key from request headers or body
   * 
   * Checks for key in:
   * 1. Idempotency-Key header (preferred)
   * 2. X-Idempotency-Key header
   * 3. idempotencyKey in request body
   * 
   * @param headers - Request headers object
   * @param body - Request body object (optional)
   * @returns Idempotency key or null if not found
   */
  extractIdempotencyKey(headers: any, body?: any): string | null {
    // Check standard header
    if (headers['idempotency-key']) {
      return headers['idempotency-key'];
    }

    // Check alternative header
    if (headers['x-idempotency-key']) {
      return headers['x-idempotency-key'];
    }

    // Check body
    if (body && body.idempotencyKey) {
      return body.idempotencyKey;
    }

    return null;
  }
}

/**
 * Factory function to create idempotency service instance
 */
export function createIdempotencyService(
  config?: Partial<IdempotencyConfig>
): IIdempotencyService {
  return new IdempotencyService(config);
}
