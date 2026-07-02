/**
 * Model Wallet Model
 *
 * Represents model wallet for earnings tracking.
 * Separate from user wallets for clear separation of concerns.
 * Collection: model_wallets
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IModelWallet extends Document {
  // Program-tenant isolation boundary. Required + composite-unique with modelId
  // (RRR-#2 Phase C).
  tenant_id: string;
  modelId: string;
  earnedBalance: number;
  currency: string;
  type: 'promotional' | 'earnings';
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const ModelWalletSchema = new Schema<IModelWallet>(
  {
    // Program isolation boundary. Required (RRR-#2 Phase C); uniqueness is on
    // the composite { tenant_id, modelId } index below.
    tenant_id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    modelId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    earnedBalance: {
      type: Number,
      required: true,
      default: 0,
      min: 0, // Schema-level constraint: no negative earned balance
    },
    currency: {
      type: String,
      required: true,
      default: 'points',
      trim: true,
      maxlength: 16,
    },
    type: {
      type: String,
      required: true,
      enum: ['promotional', 'earnings'],
      default: 'earnings',
    },
    version: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'model_wallets',
  },
);

// Composite unique index — one model wallet per (tenant, model). Replaces the
// old global unique { modelId } (RRR-#2 Phase C).
ModelWalletSchema.index({ tenant_id: 1, modelId: 1 }, { unique: true });

// Index for balance queries
ModelWalletSchema.index({ earnedBalance: 1 });

// Compound index for type queries
ModelWalletSchema.index({ type: 1, earnedBalance: 1 });

export const ModelWalletModel = mongoose.model<IModelWallet>('ModelWallet', ModelWalletSchema);
