/**
 * Reservation Service Tests
 * 
 * Tests composite idempotency, Reserve/Commit/Release operations,
 * and TTL expiry functionality
 */

import { ReservationService } from '../../src/reservations/service';
import {
  EventScope,
  ReservationStatus,
  ReservationNotFoundError,
  ReservationExpiredError,
  ReservationAlreadyProcessedError,
} from '../../src/reservations/types';

describe('ReservationService', () => {
  let service: ReservationService;
  
  beforeEach(() => {
    service = new ReservationService();
  });
  
  describe('Composite Idempotency', () => {
    it('should return same result for duplicate reserve requests', async () => {
      const request = {
        pointsIdempotencyKey: 'idem-key-1',
        eventScope: EventScope.RESERVE,
        requestId: 'req-1',
        timestamp: new Date(),
        userId: 'user-1',
        amount: 100,
        reason: 'test',
      };
      
      // First request
      const result1 = await service.reserve(request);
      
      // Duplicate request (same idempotency key)
      const result2 = await service.reserve(request);
      
      // Should return same result
      expect(result2.reservationId).toBe(result1.reservationId);
      expect(result2.transactionId).toBe(result1.transactionId);
      expect(result2.reservedAmount).toBe(result1.reservedAmount);
    });
    
    it('should allow same key for different event scopes', async () => {
      const reserveRequest = {
        pointsIdempotencyKey: 'shared-key',
        eventScope: EventScope.RESERVE,
        requestId: 'req-1',
        timestamp: new Date(),
        userId: 'user-1',
        amount: 100,
        reason: 'test',
      };
      
      // Reserve with key
      const reserveResult = await service.reserve(reserveRequest);
      
      // Commit with same key but different scope
      const commitRequest = {
        pointsIdempotencyKey: 'shared-key', // Same key
        eventScope: EventScope.COMMIT,
        requestId: 'req-2',
        timestamp: new Date(),
        reservationId: reserveResult.reservationId,
        userId: 'user-1',
        reason: 'test-commit',
      };
      
      const commitResult = await service.commit(commitRequest);
      
      // Should succeed (different scope allows key reuse)
      expect(commitResult.reservationId).toBe(reserveResult.reservationId);
      expect(commitResult.committedAmount).toBe(100);
    });
    
    it('should return cached commit result on retry', async () => {
      // First create a reservation
      const reserveRequest = {
        pointsIdempotencyKey: 'reserve-key-1',
        eventScope: EventScope.RESERVE,
        requestId: 'req-1',
        timestamp: new Date(),
        userId: 'user-1',
        amount: 100,
        reason: 'test',
      };
      const reserveResult = await service.reserve(reserveRequest);
      
      // Commit it
      const commitRequest = {
        pointsIdempotencyKey: 'commit-key-1',
        eventScope: EventScope.COMMIT,
        requestId: 'req-2',
        timestamp: new Date(),
        reservationId: reserveResult.reservationId,
        userId: 'user-1',
        reason: 'test-commit',
      };
      
      const result1 = await service.commit(commitRequest);
      
      // Retry commit with same idempotency key
      const result2 = await service.commit(commitRequest);
      
      // Should return cached result
      expect(result2.transactionId).toBe(result1.transactionId);
      expect(result2.committedAmount).toBe(result1.committedAmount);
    });
  });
  
  describe('Reserve Operation', () => {
    it('should create a reservation with default TTL', async () => {
      const request = {
        pointsIdempotencyKey: 'key-1',
        eventScope: EventScope.RESERVE,
        requestId: 'req-1',
        timestamp: new Date(),
        userId: 'user-1',
        amount: 100,
        reason: 'test',
      };
      
      const result = await service.reserve(request);
      
      expect(result.reservationId).toBeDefined();
      expect(result.transactionId).toBeDefined();
      expect(result.reservedAmount).toBe(100);
      expect(result.expiresAt).toBeInstanceOf(Date);
      
      // Check TTL (should be ~5 minutes from now)
      const ttlMs = result.expiresAt.getTime() - result.timestamp.getTime();
      expect(ttlMs).toBeGreaterThan(290000); // At least 290 seconds
      expect(ttlMs).toBeLessThan(310000); // At most 310 seconds
    });
    
    it('should respect custom TTL', async () => {
      const request = {
        pointsIdempotencyKey: 'key-2',
        eventScope: EventScope.RESERVE,
        requestId: 'req-2',
        timestamp: new Date(),
        userId: 'user-1',
        amount: 100,
        reason: 'test',
        ttlSeconds: 600, // 10 minutes
      };
      
      const result = await service.reserve(request);
      
      const ttlMs = result.expiresAt.getTime() - result.timestamp.getTime();
      expect(ttlMs).toBeGreaterThan(590000); // At least 590 seconds
      expect(ttlMs).toBeLessThan(610000); // At most 610 seconds
    });
    
    it('should cap TTL at maximum', async () => {
      const request = {
        pointsIdempotencyKey: 'key-3',
        eventScope: EventScope.RESERVE,
        requestId: 'req-3',
        timestamp: new Date(),
        userId: 'user-1',
        amount: 100,
        reason: 'test',
        ttlSeconds: 7200, // 2 hours (should be capped at 1 hour)
      };
      
      const result = await service.reserve(request);
      
      const ttlMs = result.expiresAt.getTime() - result.timestamp.getTime();
      expect(ttlMs).toBeLessThanOrEqual(3600000); // Max 1 hour
    });
  });
  
  describe('Commit Operation', () => {
    it('should commit an active reservation', async () => {
      // Create reservation
      const reserveResult = await service.reserve({
        pointsIdempotencyKey: 'key-4',
        eventScope: EventScope.RESERVE,
        requestId: 'req-4',
        timestamp: new Date(),
        userId: 'user-1',
        amount: 100,
        reason: 'test',
      });
      
      // Commit it
      const commitResult = await service.commit({
        pointsIdempotencyKey: 'key-5',
        eventScope: EventScope.COMMIT,
        requestId: 'req-5',
        timestamp: new Date(),
        reservationId: reserveResult.reservationId,
        userId: 'user-1',
        reason: 'test-commit',
      });
      
      expect(commitResult.reservationId).toBe(reserveResult.reservationId);
      expect(commitResult.committedAmount).toBe(100);
      
      // Check reservation is marked as committed
      const reservation = await service.getReservation(reserveResult.reservationId);
      expect(reservation?.status).toBe(ReservationStatus.COMMITTED);
    });
    
    it('should reject commit of non-existent reservation', async () => {
      await expect(
        service.commit({
          pointsIdempotencyKey: 'key-6',
          eventScope: EventScope.COMMIT,
          requestId: 'req-6',
          timestamp: new Date(),
          reservationId: 'non-existent',
          userId: 'user-1',
          reason: 'test',
        })
      ).rejects.toThrow(ReservationNotFoundError);
    });
    
    it('should reject commit of already committed reservation', async () => {
      // Create and commit
      const reserveResult = await service.reserve({
        pointsIdempotencyKey: 'key-7',
        eventScope: EventScope.RESERVE,
        requestId: 'req-7',
        timestamp: new Date(),
        userId: 'user-1',
        amount: 100,
        reason: 'test',
      });
      
      await service.commit({
        pointsIdempotencyKey: 'key-8',
        eventScope: EventScope.COMMIT,
        requestId: 'req-8',
        timestamp: new Date(),
        reservationId: reserveResult.reservationId,
        userId: 'user-1',
        reason: 'test-commit',
      });
      
      // Try to commit again with different key
      await expect(
        service.commit({
          pointsIdempotencyKey: 'key-9', // Different key
          eventScope: EventScope.COMMIT,
          requestId: 'req-9',
          timestamp: new Date(),
          reservationId: reserveResult.reservationId,
          userId: 'user-1',
          reason: 'test-commit-2',
        })
      ).rejects.toThrow(ReservationAlreadyProcessedError);
    });
  });
  
  describe('Release Operation', () => {
    it('should release an active reservation', async () => {
      // Create reservation
      const reserveResult = await service.reserve({
        pointsIdempotencyKey: 'key-10',
        eventScope: EventScope.RESERVE,
        requestId: 'req-10',
        timestamp: new Date(),
        userId: 'user-1',
        amount: 100,
        reason: 'test',
      });
      
      // Release it
      const releaseResult = await service.release({
        pointsIdempotencyKey: 'key-11',
        eventScope: EventScope.RELEASE,
        requestId: 'req-11',
        timestamp: new Date(),
        reservationId: reserveResult.reservationId,
        userId: 'user-1',
        reason: 'test-release',
      });
      
      expect(releaseResult.reservationId).toBe(reserveResult.reservationId);
      expect(releaseResult.releasedAmount).toBe(100);
      
      // Check reservation is marked as released
      const reservation = await service.getReservation(reserveResult.reservationId);
      expect(reservation?.status).toBe(ReservationStatus.RELEASED);
    });
  });
  
  describe('TTL Expiry', () => {
    it('should process expired reservations', async () => {
      // Create reservation with very short TTL
      const reserveResult = await service.reserve({
        pointsIdempotencyKey: 'key-12',
        eventScope: EventScope.RESERVE,
        requestId: 'req-12',
        timestamp: new Date(),
        userId: 'user-1',
        amount: 100,
        reason: 'test',
        ttlSeconds: 1, // 1 second
      });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Process expired reservations
      const expiredCount = await service.processExpiredReservations();
      
      expect(expiredCount).toBeGreaterThan(0);
      
      // Check reservation is marked as expired
      const reservation = await service.getReservation(reserveResult.reservationId);
      expect(reservation?.status).toBe(ReservationStatus.EXPIRED);
    });
    
    it('should reject commit of expired reservation', async () => {
      // Create reservation with very short TTL
      const reserveResult = await service.reserve({
        pointsIdempotencyKey: 'key-13',
        eventScope: EventScope.RESERVE,
        requestId: 'req-13',
        timestamp: new Date(),
        userId: 'user-1',
        amount: 100,
        reason: 'test',
        ttlSeconds: 1,
      });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Try to commit expired reservation
      await expect(
        service.commit({
          pointsIdempotencyKey: 'key-14',
          eventScope: EventScope.COMMIT,
          requestId: 'req-14',
          timestamp: new Date(),
          reservationId: reserveResult.reservationId,
          userId: 'user-1',
          reason: 'test-commit',
        })
      ).rejects.toThrow(ReservationExpiredError);
    });
  });
});
