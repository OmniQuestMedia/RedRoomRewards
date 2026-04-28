/**
 * IdempotencyService — unit tests (B-010)
 *
 * Verifies the cache key/value contract that protects every FIZ
 * mutation: wallet credit, wallet deduct, point redemption, point
 * expiration, and the four escrow operations (hold / release / settle
 * / refund). Covers cache miss, cache hit, replay returning identical
 * stored result, and operation isolation (same key under different
 * operation names is a miss).
 */

import {
  IdempotencyService,
  IDEMPOTENCY_OPERATIONS,
  IdempotencyOperation,
} from './idempotency.service';
import { IdempotencyRecordModel } from '../db/models/idempotency.model';

jest.mock('../db/models/idempotency.model');

describe('IdempotencyService (B-010)', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    service = new IdempotencyService();
    jest.clearAllMocks();
  });

  describe('canonical operations', () => {
    it('exposes the documented operation constants', () => {
      expect(IDEMPOTENCY_OPERATIONS).toEqual({
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
      });
    });
  });

  describe('checkKey', () => {
    it('returns null on cache miss', async () => {
      (IdempotencyRecordModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await service.checkKey('idem-1', 'tenant-1', 'wallet_credit');
      expect(result).toBeNull();
    });

    it('returns the stored result on cache hit', async () => {
      const storedResult = { newBalance: 250, transactionId: 'txn-abc' };
      (IdempotencyRecordModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({ storedResult }),
      });

      const result = await service.checkKey('idem-2', 'tenant-1', 'wallet_credit');
      expect(result).toEqual(storedResult);
    });

    it('isolates by tenant — same key under a different tenant is a miss', async () => {
      const findOne = IdempotencyRecordModel.findOne as jest.Mock;
      findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      await service.checkKey('idem-shared', 'tenant-A', 'wallet_credit');
      await service.checkKey('idem-shared', 'tenant-B', 'wallet_credit');

      expect(findOne.mock.calls[0][0].eventScope).toBe('tenant-A:wallet_credit');
      expect(findOne.mock.calls[1][0].eventScope).toBe('tenant-B:wallet_credit');
    });

    it('isolates by operation — same key under a different operation is a miss', async () => {
      const findOne = IdempotencyRecordModel.findOne as jest.Mock;
      findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      await service.checkKey('idem-shared', 'tenant-1', IDEMPOTENCY_OPERATIONS.WALLET_CREDIT);
      await service.checkKey('idem-shared', 'tenant-1', IDEMPOTENCY_OPERATIONS.WALLET_DEDUCT);
      await service.checkKey('idem-shared', 'tenant-1', IDEMPOTENCY_OPERATIONS.POINT_REDEMPTION);
      await service.checkKey('idem-shared', 'tenant-1', IDEMPOTENCY_OPERATIONS.POINT_EXPIRATION);
      await service.checkKey('idem-shared', 'tenant-1', IDEMPOTENCY_OPERATIONS.ESCROW_HOLD);
      await service.checkKey('idem-shared', 'tenant-1', IDEMPOTENCY_OPERATIONS.ESCROW_RELEASE);

      const scopes = findOne.mock.calls.map((c) => c[0].eventScope);
      expect(new Set(scopes).size).toBe(6); // every call had a unique scope
    });
  });

  describe('recordKey', () => {
    it('persists the key + scope + result + sha256 hash', async () => {
      const create = IdempotencyRecordModel.create as jest.Mock;
      create.mockResolvedValue(undefined);

      const result = { newBalance: 100, transactionId: 'txn-1' };
      await service.recordKey('idem-1', 'tenant-1', 'wallet_credit', result);

      expect(create).toHaveBeenCalledTimes(1);
      const arg = create.mock.calls[0][0];
      expect(arg.pointsIdempotencyKey).toBe('idem-1');
      expect(arg.eventScope).toBe('tenant-1:wallet_credit');
      expect(arg.storedResult).toEqual(result);
      expect(typeof arg.resultHash).toBe('string');
      expect(arg.resultHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    });

    it('produces a stable hash regardless of key insertion order', async () => {
      const create = IdempotencyRecordModel.create as jest.Mock;
      create.mockResolvedValue(undefined);

      await service.recordKey('idem-A', 'tenant-1', 'wallet_credit', {
        a: 1,
        b: 2,
        c: 3,
      });
      await service.recordKey('idem-A', 'tenant-1', 'wallet_credit', {
        c: 3,
        a: 1,
        b: 2,
      });

      const hash1 = create.mock.calls[0][0].resultHash;
      const hash2 = create.mock.calls[1][0].resultHash;
      expect(hash1).toBe(hash2);
    });
  });

  describe('replay semantics', () => {
    it('record then check returns the same shape', async () => {
      const stored: { storedResult?: Record<string, unknown> } = {};
      (IdempotencyRecordModel.create as jest.Mock).mockImplementation(async (doc) => {
        stored.storedResult = doc.storedResult as Record<string, unknown>;
        return undefined;
      });
      (IdempotencyRecordModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockImplementation(async () => stored),
      });

      const result = { newBalance: 555 };
      await service.recordKey('idem-replay', 'tenant-1', 'point_redemption', result);
      const replayed = await service.checkKey('idem-replay', 'tenant-1', 'point_redemption');

      expect(replayed).toEqual(result);
    });
  });

  describe('extended operation surface (B-010)', () => {
    const allOperations: IdempotencyOperation[] = [
      IDEMPOTENCY_OPERATIONS.WALLET_CREDIT,
      IDEMPOTENCY_OPERATIONS.WALLET_DEDUCT,
      IDEMPOTENCY_OPERATIONS.POINT_REDEMPTION,
      IDEMPOTENCY_OPERATIONS.POINT_EXPIRATION,
      IDEMPOTENCY_OPERATIONS.ESCROW_HOLD,
      IDEMPOTENCY_OPERATIONS.ESCROW_RELEASE,
      IDEMPOTENCY_OPERATIONS.ESCROW_SETTLE,
      IDEMPOTENCY_OPERATIONS.ESCROW_REFUND,
    ];

    it.each(allOperations)('records and replays %s', async (operation) => {
      const stored: { storedResult?: Record<string, unknown> } = {};
      (IdempotencyRecordModel.create as jest.Mock).mockImplementation(async (doc) => {
        stored.storedResult = doc.storedResult as Record<string, unknown>;
      });
      (IdempotencyRecordModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockImplementation(async () => stored),
      });

      const result = { op: operation, ok: true };
      await service.recordKey(`idem-${operation}`, 'tenant-1', operation, result);
      const replayed = await service.checkKey(`idem-${operation}`, 'tenant-1', operation);

      expect(replayed).toEqual(result);
    });
  });
});
