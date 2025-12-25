/**
 * Contract Validator Tests
 * 
 * Tests strict validation with additionalProperties: false
 * and unknown field rejection
 */

import { ContractValidator } from '../../src/contracts/points/validator';
import { EventScope } from '../../src/contracts/points/types';

describe('ContractValidator', () => {
  describe('Strict Validation (additionalProperties: false)', () => {
    it('should reject unknown fields in reserve request', () => {
      const invalidData = {
        pointsIdempotencyKey: 'key-123',
        eventScope: 'reserve',
        requestId: 'req-123',
        timestamp: new Date(),
        userId: 'user-123',
        amount: 100,
        reason: 'test',
        unknownField: 'should be rejected', // Unknown field
      };
      
      const result = ContractValidator.validateReserveRequest(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('UNKNOWN_FIELD');
      expect(result.errors[0].field).toBe('unknownField');
    });
    
    it('should reject multiple unknown fields', () => {
      const invalidData = {
        pointsIdempotencyKey: 'key-123',
        eventScope: 'reserve',
        requestId: 'req-123',
        timestamp: new Date(),
        userId: 'user-123',
        amount: 100,
        reason: 'test',
        unknownField1: 'value1',
        unknownField2: 'value2',
      };
      
      const result = ContractValidator.validateReserveRequest(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      const unknownErrors = result.errors.filter(e => e.code === 'UNKNOWN_FIELD');
      expect(unknownErrors.length).toBe(2);
    });
    
    it('should accept valid reserve request with no unknown fields', () => {
      const validData = {
        pointsIdempotencyKey: 'key-123',
        eventScope: 'reserve',
        requestId: 'req-123',
        timestamp: new Date(),
        userId: 'user-123',
        amount: 100,
        reason: 'test',
      };
      
      const result = ContractValidator.validateReserveRequest(validData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should accept valid reserve request with optional fields', () => {
      const validData = {
        pointsIdempotencyKey: 'key-123',
        eventScope: 'reserve',
        requestId: 'req-123',
        timestamp: new Date(),
        userId: 'user-123',
        amount: 100,
        reason: 'test',
        ttlSeconds: 300,
        metadata: { key: 'value' },
      };
      
      const result = ContractValidator.validateReserveRequest(validData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
  
  describe('Required Field Validation', () => {
    it('should reject missing required fields', () => {
      const invalidData = {
        pointsIdempotencyKey: 'key-123',
        eventScope: 'reserve',
        // Missing: requestId, timestamp, userId, amount, reason
      };
      
      const result = ContractValidator.validateReserveRequest(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const missingErrors = result.errors.filter(e => e.code === 'MISSING_FIELD');
      expect(missingErrors.length).toBeGreaterThanOrEqual(4);
    });
  });
  
  describe('Type Validation', () => {
    it('should reject invalid types', () => {
      const invalidData = {
        pointsIdempotencyKey: 'key-123',
        eventScope: 'reserve',
        requestId: 'req-123',
        timestamp: new Date(),
        userId: 'user-123',
        amount: 'not-a-number', // Invalid type
        reason: 'test',
      };
      
      const result = ContractValidator.validateReserveRequest(invalidData);
      
      expect(result.valid).toBe(false);
      const amountError = result.errors.find(e => e.field === 'amount');
      expect(amountError).toBeDefined();
      expect(amountError?.code).toBe('VALIDATION_FAILED');
    });
    
    it('should reject negative amounts', () => {
      const invalidData = {
        pointsIdempotencyKey: 'key-123',
        eventScope: 'reserve',
        requestId: 'req-123',
        timestamp: new Date(),
        userId: 'user-123',
        amount: -100, // Invalid: negative
        reason: 'test',
      };
      
      const result = ContractValidator.validateReserveRequest(invalidData);
      
      expect(result.valid).toBe(false);
      const amountError = result.errors.find(e => e.field === 'amount');
      expect(amountError).toBeDefined();
    });
  });
  
  describe('Commit Request Validation', () => {
    it('should reject unknown fields in commit request', () => {
      const invalidData = {
        pointsIdempotencyKey: 'key-123',
        eventScope: 'commit',
        requestId: 'req-123',
        timestamp: new Date(),
        reservationId: 'res-123',
        userId: 'user-123',
        reason: 'test',
        extraField: 'rejected',
      };
      
      const result = ContractValidator.validateCommitRequest(invalidData);
      
      expect(result.valid).toBe(false);
      const unknownError = result.errors.find(e => e.code === 'UNKNOWN_FIELD');
      expect(unknownError).toBeDefined();
    });
    
    it('should accept valid commit request', () => {
      const validData = {
        pointsIdempotencyKey: 'key-123',
        eventScope: 'commit',
        requestId: 'req-123',
        timestamp: new Date(),
        reservationId: 'res-123',
        userId: 'user-123',
        reason: 'test',
      };
      
      const result = ContractValidator.validateCommitRequest(validData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
  
  describe('Release Request Validation', () => {
    it('should reject unknown fields in release request', () => {
      const invalidData = {
        pointsIdempotencyKey: 'key-123',
        eventScope: 'release',
        requestId: 'req-123',
        timestamp: new Date(),
        reservationId: 'res-123',
        userId: 'user-123',
        reason: 'test',
        invalidField: 'value',
      };
      
      const result = ContractValidator.validateReleaseRequest(invalidData);
      
      expect(result.valid).toBe(false);
      const unknownError = result.errors.find(e => e.code === 'UNKNOWN_FIELD');
      expect(unknownError).toBeDefined();
    });
    
    it('should accept valid release request', () => {
      const validData = {
        pointsIdempotencyKey: 'key-123',
        eventScope: 'release',
        requestId: 'req-123',
        timestamp: new Date(),
        reservationId: 'res-123',
        userId: 'user-123',
        reason: 'test',
      };
      
      const result = ContractValidator.validateReleaseRequest(validData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
