/**
 * Ack Delivery Model
 * 
 * Tracks acknowledgment deliveries to external endpoints
 * Collection: ack_deliveries
 */

import mongoose, { Document, Schema } from 'mongoose';

export enum AckDeliveryState {
  PENDING = 'PENDING',
  DELIVERING = 'DELIVERING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  FAILED_PERMANENT = 'FAILED_PERMANENT',
}

export interface IAckDelivery extends Document {
  ackId: string;
  targetEndpoint: string;
  eventId: string;
  state: AckDeliveryState;
  retries: number;
  nextAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt?: Date;
}

const AckDeliverySchema = new Schema<IAckDelivery>(
  {
    ackId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 256,
    },
    targetEndpoint: {
      type: String,
      required: true,
      trim: true,
      maxlength: 512,
    },
    eventId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },
    state: {
      type: String,
      required: true,
      enum: Object.values(AckDeliveryState),
      default: AckDeliveryState.PENDING,
    },
    retries: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    nextAttemptAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'ack_deliveries',
  }
);

// Indexes
AckDeliverySchema.index({ ackId: 1 }, { unique: true });
AckDeliverySchema.index({ state: 1, nextAttemptAt: 1 });
AckDeliverySchema.index({ eventId: 1 });

export const AckDeliveryModel = mongoose.model<IAckDelivery>('AckDelivery', AckDeliverySchema);
