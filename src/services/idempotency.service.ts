/**
 * Idempotency Service
 *
 * Provides idempotency key checking and recording for financial operations.
 * Prevents duplicate processing of credit/deduct requests with the same key.
 *
 * Storage: idempotency_records collection (see src/db/models/idempotency.model.ts)
 * Retention: 90 days (TTL index on createdAt)
 */

import * as crypto from 'crypto';
import { IdempotencyRecordModel } from '../db/models/idempotency.model';

/**
 * Canonical operation names for the idempotency cache. Every caller
 * must use one of these constants — guards against typo-driven cache
 * misses that would let a duplicate request through.
 *
 * B-010 extends the original credit/deduct surface to cover the rest
 * of the FIZ mutation graph: redemption, expiration, and escrow
 * hold/release.
 */
export const IDEMPOTENCY_OPERATIONS = {
  WALLET_CREDIT: 'wallet_credit',
  WALLET_DEDUCT: 'wallet_deduct',
  POINT_REDEMPTION: 'point_redemption',
  POINT_EXPIRATION: 'point_expiration',
  ESCROW_HOLD: 'escrow_hold',
  ESCROW_RELEASE: 'escrow_release',
  ESCROW_SETTLE: 'escrow_settle',
  ESCROW_REFUND: 'escrow_refund',
  MERCHANT_REDEMPTION: 'merchant_redemption',
  ADMIN_EARN: 'admin_earn',
} as const;

export type IdempotencyOperation =
  (typeof IDEMPOTENCY_OPERATIONS)[keyof typeof IDEMPOTENCY_OPERATIONS];

/**
 * Interface for idempotency service
 */
export interface IIdempotencyService {
  /**
   * Check whether a key has already been processed.
   * @param key - The idempotency key from the request
   * @param tenantId - Tenant/user scope discriminator
   * @param operation - Operation name (e.g. 'wallet_credit', 'wallet_deduct')
   * @returns The previously stored result, or null on cache miss
   */
  checkKey(
    key: string,
    tenantId: string,
    operation: string,
  ): Promise<Record<string, unknown> | null>;

  /**
   * Record a completed operation so future duplicate requests return the cached result.
   * @param key - The idempotency key from the request
   * @param tenantId - Tenant/user scope discriminator
   * @param operation - Operation name
   * @param result - The response to cache
   */
  recordKey(
    key: string,
    tenantId: string,
    operation: string,
    result: Record<string, unknown>,
  ): Promise<void>;
}

/**
 * Builds the eventScope string from tenantId and operation.
 * Used as the composite scope for the unique index.
 */
function buildScope(tenantId: string, operation: string): string {
  return `${tenantId}:${operation}`;
}

/**
 * Compute a deterministic hash of the result for the resultHash field.
 * Uses sorted key serialization to ensure consistent output regardless of
 * property insertion order.
 */
function hashResult(result: Record<string, unknown>): string {
  const stable = JSON.stringify(result, (_key, value: unknown) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const sorted = Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce(
          (acc, k) => {
            acc[k] = (value as Record<string, unknown>)[k];
            return acc;
          },
          {} as Record<string, unknown>,
        );
      return sorted;
    }
    return value;
  });
  return crypto.createHash('sha256').update(stable).digest('hex');
}

/**
 * IdempotencyService implementation backed by MongoDB idempotency_records collection.
 */
export class IdempotencyService implements IIdempotencyService {
  async checkKey(
    key: string,
    tenantId: string,
    operation: string,
  ): Promise<Record<string, unknown> | null> {
    const scope = buildScope(tenantId, operation);
    const record = await IdempotencyRecordModel.findOne({
      pointsIdempotencyKey: key,
      eventScope: scope,
    }).lean();

    if (!record) {
      return null;
    }

    return (record.storedResult as Record<string, unknown>) ?? null;
  }

  async recordKey(
    key: string,
    tenantId: string,
    operation: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    const scope = buildScope(tenantId, operation);
    const resultHash = hashResult(result);

    await IdempotencyRecordModel.create({
      pointsIdempotencyKey: key,
      eventScope: scope,
      resultHash,
      storedResult: result,
    });
  }
}
