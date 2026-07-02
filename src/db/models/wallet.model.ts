/**
 * Wallet Model
 *
 * Represents user wallet with available and escrow balances.
 * Uses optimistic locking (version field) to prevent race conditions.
 * Collection: wallets
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IWallet extends Document {
  // Program-tenant isolation boundary (RRR-#2 Phase A). Optional during the
  // expand phase; backfilled, then filtered (Phase B) and enforced (Phase C).
  tenant_id?: string;
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
    // Optional during Phase A (expand). Backfilled to the program tenant, then
    // made required with a composite unique index in Phase C.
    tenant_id: {
      type: String,
      required: false,
      trim: true,
      maxlength: 128,
      index: true,
    },
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
  },
);

// Unique index on userId
// Phase C will replace this with a composite unique index { tenant_id, userId }.
WalletSchema.index({ userId: 1 }, { unique: true });

// Program-tenant scoped lookup (non-unique in Phase A; composite unique in Phase C).
WalletSchema.index({ tenant_id: 1, userId: 1 });

// Index for balance queries
WalletSchema.index({ availableBalance: 1 });
WalletSchema.index({ escrowBalance: 1 });

export const WalletModel = mongoose.model<IWallet>('Wallet', WalletSchema);
