/**
 * Support Service Tests (WO-RRR-0108)
 * 
 * Unit tests for the support operations service
 */

import { SupportService, ReceiptLookupQuery } from './support.service';
import { IdempotencyRecordModel } from '../db/models';
import { UserRole } from './auth.service';

// Mock dependencies
jest.mock('../db/models');

describe('SupportService', () => {
  let service: SupportService;

  beforeEach(() => {
    service = new SupportService();
    jest.clearAllMocks();
  });

  describe('lookupReceipt', () => {
    const validQuery: ReceiptLookupQuery = {
      merchantId: 'merchant-123',
      idempotencyKey: 'idem-key-456',
    };

    it('should return not_found when receipt does not exist', async () => {
      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.lookupReceipt(validQuery);

      expect(result.status).toBe('not_found');
      expect(result.accepted).toBe(false);
      expect(result.replayed).toBe(false);
      expect(result.idempotencyKey).toBe(validQuery.idempotencyKey);
    });

    it('should return receipt with safe fields only', async () => {
      const mockRecord = {
        pointsIdempotencyKey: 'idem-key-456',
        eventScope: 'event_ingestion',
        resultHash: 'evt-123',
        createdAt: new Date('2026-01-13T10:00:00Z'),
        storedResult: {
          eventId: 'evt-123',
          correlationId: 'corr-789',
          queued: true,
          timestamp: new Date(),
        },
      };
      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(mockRecord);

      const result = await service.lookupReceipt(validQuery);

      expect(result.status).toBe('queued');
      expect(result.accepted).toBe(true);
      expect(result.correlationId).toBe('corr-789');
      expect(result.eventId).toBe('evt-123');
      expect(result.idempotencyKey).toBe('idem-key-456');
      expect(result.merchantId).toBe('merchant-123');
    });

    it('should NOT return request body, signatures, or secrets', async () => {
      const mockRecord = {
        pointsIdempotencyKey: 'idem-key-456',
        eventScope: 'event_ingestion',
        resultHash: 'evt-123',
        createdAt: new Date(),
        storedResult: {
          eventId: 'evt-123',
          correlationId: 'corr-789',
          queued: true,
          timestamp: new Date(),
          // These should NOT be returned
          requestBody: { sensitive: 'data' },
          signature: 'secret-signature',
          apiKey: 'secret-key',
        },
      };
      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(mockRecord);

      const result = await service.lookupReceipt(validQuery);

      // Verify response does not contain sensitive fields
      expect(result).not.toHaveProperty('requestBody');
      expect(result).not.toHaveProperty('signature');
      expect(result).not.toHaveProperty('apiKey');
    });

    it('should return processed status when queued is false', async () => {
      const mockRecord = {
        pointsIdempotencyKey: 'idem-key-456',
        eventScope: 'event_ingestion',
        resultHash: 'evt-123',
        createdAt: new Date(),
        storedResult: {
          eventId: 'evt-123',
          correlationId: 'corr-789',
          queued: false,
        },
      };
      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(mockRecord);

      const result = await service.lookupReceipt(validQuery);

      expect(result.status).toBe('processed');
    });

    it('should include error code when present', async () => {
      const mockRecord = {
        pointsIdempotencyKey: 'idem-key-456',
        eventScope: 'event_ingestion',
        resultHash: 'evt-123',
        createdAt: new Date(),
        storedResult: {
          eventId: 'evt-123',
          correlationId: 'corr-789',
          queued: false,
          errorCode: 'VALIDATION_ERROR',
        },
      };
      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(mockRecord);

      const result = await service.lookupReceipt(validQuery);

      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });

    it('should include postedTransactions when present', async () => {
      const mockRecord = {
        pointsIdempotencyKey: 'idem-key-456',
        eventScope: 'event_ingestion',
        resultHash: 'evt-123',
        createdAt: new Date(),
        storedResult: {
          eventId: 'evt-123',
          correlationId: 'corr-789',
          queued: false,
          postedTransactions: ['txn-1', 'txn-2'],
        },
      };
      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(mockRecord);

      const result = await service.lookupReceipt(validQuery);

      expect(result.postedTransactions).toEqual(['txn-1', 'txn-2']);
    });
  });

  describe('validateSupportAccess', () => {
    it('should allow ADMIN role', () => {
      expect(() => service.validateSupportAccess(UserRole.ADMIN)).not.toThrow();
    });

    it('should allow SYSTEM role', () => {
      expect(() => service.validateSupportAccess(UserRole.SYSTEM)).not.toThrow();
    });

    it('should reject USER role', () => {
      expect(() => service.validateSupportAccess(UserRole.USER)).toThrow(
        'Insufficient permissions for support operations'
      );
    });

    it('should reject MODEL role', () => {
      expect(() => service.validateSupportAccess(UserRole.MODEL)).toThrow(
        'Insufficient permissions for support operations'
      );
    });

    it('should reject QUEUE_SERVICE role', () => {
      expect(() => service.validateSupportAccess(UserRole.QUEUE_SERVICE)).toThrow(
        'Insufficient permissions for support operations'
      );
    });
  });
});
