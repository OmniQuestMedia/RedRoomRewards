/**
 * SSO Session Model
 * 
 * Manages Single Sign-On sessions
 * Collection: sso_sessions
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface ISSOSession extends Document {
  sessionId: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
}

const SSOSessionSchema = new Schema<ISSOSession>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 256,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 512,
    },
    lastActivityAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'sso_sessions',
  }
);

// Indexes
SSOSessionSchema.index({ sessionId: 1 }, { unique: true });
SSOSessionSchema.index({ tokenHash: 1 }, { unique: true });

// TTL index for auto-expiry
SSOSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SSOSessionModel = mongoose.model<ISSOSession>('SSOSession', SSOSessionSchema);
