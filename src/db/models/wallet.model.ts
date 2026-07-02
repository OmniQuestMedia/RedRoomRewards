/**
 * Wallet Model
 *
 * Represents user wallet with available and escrow balances.
 * Uses optimistic locking (version field) to prevent race conditions.
 * Collection: wallets
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IWallet extends Document {
  // Program-tenant isolation boundary. Required + composite-unique with userId
  // (RRR-#2 Phase C) — one balance per (tenant, user).
  tenant_id: string;
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
    // Program isolation boundary. Required (RRR-#2 Phase C); uniqueness is
    // enforced on the composite { tenant_id, userId } index below.
    tenant_id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    userId: {
      type: String,
      required: true,
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
  },
);

// Composite unique index — one wallet per (tenant, user). Replaces the old
// global unique { userId } (RRR-#2 Phase C): a userId is unique WITHIN a program
// tenant, so different program tenants may reuse the same userId string.
WalletSchema.index({ tenant_id: 1, userId: 1 }, { unique: true });

// Index for balance queries
WalletSchema.index({ availableBalance: 1 });
WalletSchema.index({ escrowBalance: 1 });

export const WalletModel = mongoose.model<IWallet>('Wallet', WalletSchema);
