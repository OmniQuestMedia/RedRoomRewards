/**
 * Reservation Service Types
 */

export interface CreateReservationRequest {
  reservationId: string;
  userId: string;
  amount: number;
  expiresAt: Date;
  sourceCorrelationId?: string;
}

export interface CommitReservationRequest {
  reservationId: string;
}

export interface ReleaseReservationRequest {
  reservationId: string;
}

export interface ReservationStats {
  totalActive: number;
  totalCommitted: number;
  totalReleased: number;
  totalExpired: number;
}
