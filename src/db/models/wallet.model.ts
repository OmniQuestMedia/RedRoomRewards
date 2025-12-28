/**
 * Wallet Model
 * 
 * Represents user wallet with available and escrow balances.
 * Uses optimistic locking (version field) to prevent race conditions.
 * Collection: wallets
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IWallet extends Document {
  userId: string;
  availableBalance: number;
  escrowBalance: number;
  currency: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const WalletSchema = new Schema<IWallet>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    availableBalance: {
      type: Number,
      required: true,
      default: 0,
      min: 0, // Schema-level constraint: no negative balances
    },
    escrowBalance: {
      type: Number,
      required: true,
      default: 0,
      min: 0, // Schema-level constraint: no negative escrow
    },
    currency: {
      type: String,
      required: true,
      default: 'points',
      trim: true,
      maxlength: 16,
    },
    version: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'wallets',
  }
);

// Unique index on userId
WalletSchema.index({ userId: 1 }, { unique: true });

// Index for balance queries
WalletSchema.index({ availableBalance: 1 });
WalletSchema.index({ escrowBalance: 1 });

export const WalletModel = mongoose.model<IWallet>('Wallet', WalletSchema);
