/**
 * Account Link Model
 * 
 * Manages account linking between RRR and external systems (e.g., XXXChatNow)
 * Collection: account_links
 */

import mongoose, { Document, Schema } from 'mongoose';

export enum AccountLinkStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

export interface IAccountLink extends Document {
  linkId: string;
  userId: string;
  externalUserId: string;
  tokenHash: string;
  status: AccountLinkStatus;
  createdAt: Date;
  verifiedAt?: Date;
  expiresAt?: Date;
}

const AccountLinkSchema = new Schema<IAccountLink>(
  {
    linkId: {
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
    externalUserId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 256,
    },
    tokenHash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 512,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(AccountLinkStatus),
      default: AccountLinkStatus.PENDING,
    },
    verifiedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'account_links',
  }
);

// Indexes
AccountLinkSchema.index({ linkId: 1 }, { unique: true });
AccountLinkSchema.index({ externalUserId: 1 }, { unique: true });

// TTL index for auto-expiry (optional)
AccountLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AccountLinkModel = mongoose.model<IAccountLink>('AccountLink', AccountLinkSchema);
