/**
 * Ingest Event Model
 * 
 * Manages incoming events for processing by the ingest worker
 * Collection: ingest_events
 */

import mongoose, { Document, Schema } from 'mongoose';

export enum IngestEventStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  REJECTED = 'REJECTED',
  DLQ = 'DLQ',
}

export interface IIngestEvent extends Document {
  eventId: string;
  eventType?: string;
  receivedAt: Date;
  updatedAt: Date;
  status: IngestEventStatus;
  attempts: number;
  lastErrorCode?: string;
  lastErrorAt?: Date;
  payloadSnapshot?: Record<string, any>;
  replayable: boolean;
  nextAttemptAt?: Date;
}

const IngestEventSchema = new Schema<IIngestEvent>(
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
    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(IngestEventStatus),
      default: IngestEventStatus.QUEUED,
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lastErrorCode: {
      type: String,
      trim: true,
      maxlength: 128,
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
      default: true,
    },
    nextAttemptAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'ingest_events',
  }
);

// Indexes
IngestEventSchema.index({ eventId: 1 }, { unique: true });
IngestEventSchema.index({ status: 1, receivedAt: 1 });
IngestEventSchema.index({ receivedAt: 1 });
IngestEventSchema.index({ eventType: 1, receivedAt: 1 });
IngestEventSchema.index({ status: 1, nextAttemptAt: 1 });

export const IngestEventModel = mongoose.model<IIngestEvent>('IngestEvent', IngestEventSchema);
