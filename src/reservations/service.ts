/**
 * Reservation Service
 * 
 * Implements Reserve/Commit/Release pattern for point reservations
 * with TTL expiry, idempotent retries, and atomic operations.
 * 
 * Features:
 * - Reserve: Hold points with TTL (default 300s = 5 min)
 * - Commit: Finalize reservation and complete transaction
 * - Release: Cancel reservation and return points
 * - Automatic expiry handling
 * - Composite idempotency support
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ReservePointsRequest,
  ReservePointsResponse,
  CommitReservationRequest,
  CommitReservationResponse,
  ReleaseReservationRequest,
  ReleaseReservationResponse,
  Reservation,
  ReservationStatus,
  ReservationNotFoundError,
  ReservationExpiredError,
  ReservationAlreadyProcessedError,
  EventScope,
  CompositeIdempotencyKey,
} from './types';

/**
 * In-memory storage for reservations
 * In production, this would be a database
 */
class ReservationStore {
  private reservations = new Map<string, Reservation>();
  private idempotencyCache = new Map<string, any>();
  
  /**
   * Create composite key for idempotency
   */
  private makeCompositeKey(key: string, scope: EventScope): string {
    return `${scope}:${key}`;
  }
  
  /**
   * Check idempotency cache
   */
  checkIdempotency(key: string, scope: EventScope): any | null {
    const compositeKey = this.makeCompositeKey(key, scope);
    return this.idempotencyCache.get(compositeKey) || null;
  }
  
  /**
   * Store idempotency result
   */
  storeIdempotency(key: string, scope: EventScope, result: any): void {
    const compositeKey = this.makeCompositeKey(key, scope);
    this.idempotencyCache.set(compositeKey, {
      result,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });
  }
  
  /**
   * Save reservation
   */
  save(reservation: Reservation): void {
    this.reservations.set(reservation.reservationId, reservation);
  }
  
  /**
   * Get reservation by ID
   */
  get(reservationId: string): Reservation | null {
    return this.reservations.get(reservationId) || null;
  }
  
  /**
   * Get all active reservations for a user
   */
  getActiveByUser(userId: string): Reservation[] {
    return Array.from(this.reservations.values()).filter(
      (r) => r.userId === userId && r.status === ReservationStatus.ACTIVE
    );
  }
  
  /**
   * Get expired reservations
   */
  getExpired(): Reservation[] {
    const now = new Date();
    return Array.from(this.reservations.values()).filter(
      (r) => r.status === ReservationStatus.ACTIVE && r.expiresAt < now
    );
  }
  
  /**
   * Update reservation status
   */
  updateStatus(reservationId: string, status: ReservationStatus, processedAt: Date): void {
    const reservation = this.reservations.get(reservationId);
    if (reservation) {
      reservation.status = status;
      reservation.processedAt = processedAt;
      this.reservations.set(reservationId, reservation);
    }
  }
}

/**
 * Reservation Service Implementation
 */
export class ReservationService {
  private store = new ReservationStore();
  private readonly DEFAULT_TTL_SECONDS = 300; // 5 minutes
  private readonly MAX_TTL_SECONDS = 3600; // 1 hour
  
  /**
   * Reserve points (hold with TTL)
   * Idempotent: same key returns same result
   */
  async reserve(request: ReservePointsRequest): Promise<ReservePointsResponse> {
    // Check idempotency
    const cached = this.store.checkIdempotency(
      request.pointsIdempotencyKey,
      EventScope.RESERVE
    );
    if (cached) {
      return cached.result;
    }
    
    // Validate TTL
    const ttlSeconds = Math.min(
      request.ttlSeconds || this.DEFAULT_TTL_SECONDS,
      this.MAX_TTL_SECONDS
    );
    
    // Create reservation
    const reservationId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    
    const reservation: Reservation = {
      reservationId,
      userId: request.userId,
      amount: request.amount,
      status: ReservationStatus.ACTIVE,
      reason: request.reason,
      ttlSeconds,
      createdAt: now,
      expiresAt,
      transactionIds: [],
      pointsIdempotencyKey: request.pointsIdempotencyKey,
      metadata: request.metadata,
    };
    
    // In production: create ledger transaction for available→reserved
    const transactionId = uuidv4();
    reservation.transactionIds.push(transactionId);
    
    // Save reservation
    this.store.save(reservation);
    
    // Create response
    const response: ReservePointsResponse = {
      reservationId,
      transactionId,
      previousBalance: 1000, // Mock: would query from wallet service
      newAvailableBalance: 1000 - request.amount,
      reservedAmount: request.amount,
      expiresAt,
      timestamp: now,
    };
    
    // Store for idempotency
    this.store.storeIdempotency(
      request.pointsIdempotencyKey,
      EventScope.RESERVE,
      response
    );
    
    return response;
  }
  
  /**
   * Commit reservation (finalize)
   * Idempotent: same key returns same result
   */
  async commit(request: CommitReservationRequest): Promise<CommitReservationResponse> {
    // Check idempotency
    const cached = this.store.checkIdempotency(
      request.pointsIdempotencyKey,
      EventScope.COMMIT
    );
    if (cached) {
      return cached.result;
    }
    
    // Get reservation
    const reservation = this.store.get(request.reservationId);
    if (!reservation) {
      throw new ReservationNotFoundError(request.reservationId);
    }
    
    // Check user matches
    if (reservation.userId !== request.userId) {
      throw new ReservationAlreadyProcessedError(
        request.reservationId,
        reservation.status
      );
    }
    
    // Check not already processed
    if (reservation.status !== ReservationStatus.ACTIVE) {
      throw new ReservationAlreadyProcessedError(
        request.reservationId,
        reservation.status
      );
    }
    
    // Check not expired
    if (reservation.expiresAt < new Date()) {
      // Mark as expired
      this.store.updateStatus(
        request.reservationId,
        ReservationStatus.EXPIRED,
        new Date()
      );
      throw new ReservationExpiredError(request.reservationId, reservation.expiresAt);
    }
    
    // In production: create ledger transaction for reserved→settled
    const transactionId = uuidv4();
    reservation.transactionIds.push(transactionId);
    
    // Update status
    const now = new Date();
    this.store.updateStatus(request.reservationId, ReservationStatus.COMMITTED, now);
    
    // Create response
    const response: CommitReservationResponse = {
      reservationId: request.reservationId,
      transactionId,
      committedAmount: reservation.amount,
      recipientBalance: request.recipientId ? 500 : undefined, // Mock
      timestamp: now,
    };
    
    // Store for idempotency
    this.store.storeIdempotency(
      request.pointsIdempotencyKey,
      EventScope.COMMIT,
      response
    );
    
    return response;
  }
  
  /**
   * Release reservation (cancel)
   * Idempotent: same key returns same result
   */
  async release(request: ReleaseReservationRequest): Promise<ReleaseReservationResponse> {
    // Check idempotency
    const cached = this.store.checkIdempotency(
      request.pointsIdempotencyKey,
      EventScope.RELEASE
    );
    if (cached) {
      return cached.result;
    }
    
    // Get reservation
    const reservation = this.store.get(request.reservationId);
    if (!reservation) {
      throw new ReservationNotFoundError(request.reservationId);
    }
    
    // Check user matches
    if (reservation.userId !== request.userId) {
      throw new ReservationAlreadyProcessedError(
        request.reservationId,
        reservation.status
      );
    }
    
    // Check not already processed (allow release of expired)
    if (
      reservation.status !== ReservationStatus.ACTIVE &&
      reservation.status !== ReservationStatus.EXPIRED
    ) {
      throw new ReservationAlreadyProcessedError(
        request.reservationId,
        reservation.status
      );
    }
    
    // In production: create ledger transaction for reserved→available
    const transactionId = uuidv4();
    reservation.transactionIds.push(transactionId);
    
    // Update status
    const now = new Date();
    this.store.updateStatus(request.reservationId, ReservationStatus.RELEASED, now);
    
    // Create response
    const response: ReleaseReservationResponse = {
      reservationId: request.reservationId,
      transactionId,
      releasedAmount: reservation.amount,
      newAvailableBalance: 1000, // Mock: would query from wallet service
      timestamp: now,
    };
    
    // Store for idempotency
    this.store.storeIdempotency(
      request.pointsIdempotencyKey,
      EventScope.RELEASE,
      response
    );
    
    return response;
  }
  
  /**
   * Get reservation by ID
   */
  async getReservation(reservationId: string): Promise<Reservation | null> {
    return this.store.get(reservationId);
  }
  
  /**
   * Get active reservations for user
   */
  async getUserReservations(userId: string): Promise<Reservation[]> {
    return this.store.getActiveByUser(userId);
  }
  
  /**
   * Process expired reservations (background job)
   * Should be called periodically (e.g., every minute)
   */
  async processExpiredReservations(): Promise<number> {
    const expired = this.store.getExpired();
    const now = new Date();
    
    for (const reservation of expired) {
      // Mark as expired
      this.store.updateStatus(
        reservation.reservationId,
        ReservationStatus.EXPIRED,
        now
      );
      
      // In production: create ledger transaction for reserved→available (auto-release)
    }
    
    return expired.length;
  }
}
