/**
 * Idempotency Service Tests
 * 
 * Comprehensive test suite for the idempotency service covering:
 * - UUID validation
 * - Duplicate detection
 * - Result storage
 * - Race condition handling
 * - Error scenarios
 */

import { IdempotencyService } from '../services/idempotency.service';
import { IdempotencyRecordModel } from '../../../../../../src/db/models/idempotency.model';
import { v4 as uuidv4 } from 'uuid';

// Mock the database model
jest.mock('../../../../../src/db/models/idempotency.model');

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    service = new IdempotencyService();
    jest.clearAllMocks();
  });

  describe('validateUuid', () => {
    it('should validate a correct UUID v4', () => {
      const uuid = uuidv4();
      const result = service.validateUuid(uuid);
      
      expect(result.isValid).toBe(true);
      expect(result.uuid).toBe(uuid);
      expect(result.errorMessage).toBeUndefined();
    });

    it('should reject an invalid UUID format', () => {
      const result = service.validateUuid('not-a-valid-uuid');
      
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('UUID format is invalid');
    });

    it('should reject an empty string', () => {
      const result = service.validateUuid('');
      
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('UUID is required');
    });

    it('should reject null or undefined', () => {
      const result = service.validateUuid(null as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('UUID is required');
    });

    it('should reject non-string values', () => {
      const result = service.validateUuid(12345 as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('UUID must be a string');
    });
  });

  describe('checkIdempotency', () => {
    it('should return isDuplicate=false for new request', async () => {
      const mockFindOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });
      (IdempotencyRecordModel.findOne as jest.Mock) = mockFindOne;

      const key = uuidv4();
      const result = await service.checkIdempotency(key, 'test_operation');

      expect(result.isDuplicate).toBe(false);
      expect(result.storedResult).toBeUndefined();
      expect(mockFindOne).toHaveBeenCalledWith({
        pointsIdempotencyKey: { $eq: key },
        eventScope: { $eq: 'test_operation' },
      });
    });

    it('should return isDuplicate=true with stored result for duplicate request', async () => {
      const key = uuidv4();
      const storedData = {
        transactionId: 'txn-123',
        amount: 100,
      };
      const mockRecord = {
        pointsIdempotencyKey: key,
        eventScope: 'test_operation',
        storedResult: storedData,
        createdAt: new Date('2026-01-04T08:00:00Z'),
      };

      const mockFindOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockRecord),
        }),
      });
      (IdempotencyRecordModel.findOne as jest.Mock) = mockFindOne;

      const result = await service.checkIdempotency(key, 'test_operation');

      expect(result.isDuplicate).toBe(true);
      expect(result.storedResult).toEqual(storedData);
      expect(result.statusCode).toBe(200);
      expect(result.originalTimestamp).toEqual(mockRecord.createdAt);
    });

    it('should throw error for invalid UUID format', async () => {
      await expect(
        service.checkIdempotency('invalid-uuid', 'test_operation')
      ).rejects.toThrow('Invalid idempotency key format');
    });
  });

  describe('storeResult', () => {
    it('should store idempotency result successfully', async () => {
      const key = uuidv4();
      const result = { transactionId: 'txn-456', amount: 200 };
      
      const mockCreate = jest.fn().mockResolvedValue({
        pointsIdempotencyKey: key,
        eventScope: 'test_operation',
        storedResult: result,
      });
      (IdempotencyRecordModel.create as jest.Mock) = mockCreate;

      await service.storeResult({
        idempotencyKey: key,
        operationType: 'test_operation',
        result,
        statusCode: 201,
        ttlSeconds: 3600,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          pointsIdempotencyKey: key,
          eventScope: 'test_operation',
          storedResult: result,
        })
      );
    });

    it('should handle race condition gracefully (duplicate key error)', async () => {
      const key = uuidv4();
      const error: any = new Error('Duplicate key');
      error.code = 11000;
      
      const mockCreate = jest.fn().mockRejectedValue(error);
      (IdempotencyRecordModel.create as jest.Mock) = mockCreate;

      // Should not throw error
      await expect(
        service.storeResult({
          idempotencyKey: key,
          operationType: 'test_operation',
          result: {},
          statusCode: 200,
        })
      ).resolves.not.toThrow();
    });
  });

  describe('extractIdempotencyKey', () => {
    it('should extract key from Idempotency-Key header', () => {
      const key = uuidv4();
      const headers = { 'idempotency-key': key };
      
      const result = service.extractIdempotencyKey(headers);
      
      expect(result).toBe(key);
    });

    it('should extract key from request body', () => {
      const key = uuidv4();
      const body = { idempotencyKey: key };
      
      const result = service.extractIdempotencyKey({}, body);
      
      expect(result).toBe(key);
    });

    it('should return null when no key is found', () => {
      const result = service.extractIdempotencyKey({}, {});
      
      expect(result).toBeNull();
    });
  });
});
