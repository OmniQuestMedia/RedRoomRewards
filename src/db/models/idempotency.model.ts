/**
 * Idempotency Records Model
 * 
 * Stores idempotency keys to prevent duplicate processing
 * Collection: idempotency_records
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IIdempotencyRecord extends Document {
  pointsIdempotencyKey: string;
  eventScope: string;
  createdAt: Date;
  resultHash: string;
  storedResult?: Record<string, any>;
  retentionUntil?: Date;
  expiresAt?: Date;
}

const IdempotencyRecordSchema = new Schema<IIdempotencyRecord>(
  {
    pointsIdempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },
    eventScope: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    resultHash: {
      type: String,
      required: true,
      maxlength: 512,
    },
    storedResult: {
      type: Schema.Types.Mixed,
      required: false,
    },
    retentionUntil: {
      type: Date,
      required: false,
    },
    expiresAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
    collection: 'idempotency_records',
  }
);

// Composite unique index on idempotency key + scope
IdempotencyRecordSchema.index(
  { pointsIdempotencyKey: 1, eventScope: 1 },
  { unique: true }
);

// TTL index with 90 days default retention
// expireAfterSeconds: 7776000 = 90 days
IdempotencyRecordSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000 }
);

export const IdempotencyRecordModel = mongoose.model<IIdempotencyRecord>(
  'IdempotencyRecord',
  IdempotencyRecordSchema
);
