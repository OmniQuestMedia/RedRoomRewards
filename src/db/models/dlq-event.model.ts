/**
 * DLQ (Dead Letter Queue) Event Model
 * 
 * Stores events that failed processing and moved to DLQ
 * Collection: dlq_events
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IDLQEvent extends Document {
  eventId: string;
  eventType?: string;
  originalReceivedAt: Date;
  movedToDLQAt: Date;
  updatedAt: Date;
  attempts: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastErrorAt?: Date;
  payloadSnapshot?: Record<string, any>;
  replayable: boolean;
}

const DLQEventSchema = new Schema<IDLQEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 256,
    },
    eventType: {
      type: String,
      trim: true,
      maxlength: 128,
    },
    originalReceivedAt: {
      type: Date,
      required: true,
    },
    movedToDLQAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    attempts: {
      type: Number,
      required: true,
      min: 0,
    },
    lastErrorCode: {
      type: String,
      trim: true,
      maxlength: 128,
    },
    lastErrorMessage: {
      type: String,
      trim: true,
      maxlength: 1024,
    },
    lastErrorAt: {
      type: Date,
    },
    payloadSnapshot: {
      type: Schema.Types.Mixed,
    },
    replayable: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'dlq_events',
  }
);

// Indexes
DLQEventSchema.index({ eventId: 1 }, { unique: true });
DLQEventSchema.index({ movedToDLQAt: 1 });
DLQEventSchema.index({ eventType: 1, movedToDLQAt: 1 });
DLQEventSchema.index({ replayable: 1, movedToDLQAt: 1 });

export const DLQEventModel = mongoose.model<IDLQEvent>('DLQEvent', DLQEventSchema);
