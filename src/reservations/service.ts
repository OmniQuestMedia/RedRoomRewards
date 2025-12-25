/**
 * Reservation Service
 * 
 * Manages point reservations with operational monitoring
 */

import { ReservationModel, ReservationStatus, IReservation } from '../db/models/reservation.model';
import { MetricsLogger, MetricEventType } from '../metrics';
import {
  CreateReservationRequest,
  CommitReservationRequest,
  ReleaseReservationRequest,
  ReservationStats,
} from './types';

export class ReservationService {
  /**
   * Create a new reservation
   */
  async createReservation(request: CreateReservationRequest): Promise<IReservation> {
    const reservation = await ReservationModel.create({
      reservationId: request.reservationId,
      userId: request.userId,
      amount: request.amount,
      status: ReservationStatus.ACTIVE,
      expiresAt: request.expiresAt,
      sourceCorrelationId: request.sourceCorrelationId,
    });

    // Log reservation created metric
    MetricsLogger.incrementCounter(MetricEventType.RESERVATION_CREATED, {
      reservationId: request.reservationId,
      userId: request.userId,
      amount: request.amount,
    });

    return reservation;
  }

  /**
   * Commit a reservation (e.g., when transaction completes)
   */
  async commitReservation(request: CommitReservationRequest): Promise<IReservation | null> {
    const reservation = await ReservationModel.findOneAndUpdate(
      {
        reservationId: request.reservationId,
        status: ReservationStatus.ACTIVE,
      },
      {
        $set: {
          status: ReservationStatus.COMMITTED,
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    if (reservation) {
      // Log reservation committed metric
      MetricsLogger.incrementCounter(MetricEventType.RESERVATION_COMMITTED, {
        reservationId: request.reservationId,
        userId: reservation.userId,
        amount: reservation.amount,
      });
    }

    return reservation;
  }

  /**
   * Release a reservation (e.g., when transaction is cancelled)
   */
  async releaseReservation(request: ReleaseReservationRequest): Promise<IReservation | null> {
    const reservation = await ReservationModel.findOneAndUpdate(
      {
        reservationId: request.reservationId,
        status: ReservationStatus.ACTIVE,
      },
      {
        $set: {
          status: ReservationStatus.RELEASED,
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    if (reservation) {
      // Log reservation released metric
      MetricsLogger.incrementCounter(MetricEventType.RESERVATION_RELEASED, {
        reservationId: request.reservationId,
        userId: reservation.userId,
        amount: reservation.amount,
      });
    }

    return reservation;
  }

  /**
   * Mark expired reservations
   * This should be called by a scheduled job
   */
  async markExpiredReservations(): Promise<number> {
    const now = new Date();

    const result = await ReservationModel.updateMany(
      {
        status: ReservationStatus.ACTIVE,
        expiresAt: { $lte: now },
      },
      {
        $set: {
          status: ReservationStatus.EXPIRED,
          updatedAt: now,
        },
      }
    );

    const expiredCount = result.modifiedCount;

    if (expiredCount > 0) {
      // Log reservation expired metric
      MetricsLogger.incrementCounter(MetricEventType.RESERVATION_EXPIRED, {
        count: expiredCount,
      });
    }

    return expiredCount;
  }

  /**
   * Get reservation statistics
   */
  async getStats(): Promise<ReservationStats> {
    const [active, committed, released, expired] = await Promise.all([
      ReservationModel.countDocuments({ status: ReservationStatus.ACTIVE }),
      ReservationModel.countDocuments({ status: ReservationStatus.COMMITTED }),
      ReservationModel.countDocuments({ status: ReservationStatus.RELEASED }),
      ReservationModel.countDocuments({ status: ReservationStatus.EXPIRED }),
    ]);

    return {
      totalActive: active,
      totalCommitted: committed,
      totalReleased: released,
      totalExpired: expired,
    };
  }

  /**
   * Get reservation by ID
   */
  async getReservation(reservationId: string): Promise<IReservation | null> {
    return ReservationModel.findOne({ reservationId });
  }

  /**
   * Get user's active reservations
   */
  async getUserReservations(userId: string): Promise<IReservation[]> {
    return ReservationModel.find({
      userId,
      status: ReservationStatus.ACTIVE,
    }).sort({ createdAt: -1 });
  }
}
