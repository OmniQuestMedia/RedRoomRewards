/**
 * Points Reservation Model
 * 
 * Manages reservation of points for pending transactions
 * Collection: points_reservations
 */

import mongoose, { Document, Schema } from 'mongoose';

export enum ReservationStatus {
  ACTIVE = 'ACTIVE',
  COMMITTED = 'COMMITTED',
  RELEASED = 'RELEASED',
  EXPIRED = 'EXPIRED',
}

export interface IReservation extends Document {
  reservationId: string;
  userId: string;
  amount: number;
  status: ReservationStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  sourceCorrelationId?: string;
}

const ReservationSchema = new Schema<IReservation>(
  {
    reservationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 128,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(ReservationStatus),
      default: ReservationStatus.ACTIVE,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    sourceCorrelationId: {
      type: String,
      trim: true,
      maxlength: 256,
    },
  },
  {
    timestamps: true,
    collection: 'points_reservations',
  }
);

// Indexes
ReservationSchema.index({ reservationId: 1 }, { unique: true });
ReservationSchema.index({ userId: 1, createdAt: -1 });
ReservationSchema.index({ status: 1, expiresAt: 1 });

// TTL index - auto-expire based on expiresAt
ReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ReservationModel = mongoose.model<IReservation>('Reservation', ReservationSchema);
