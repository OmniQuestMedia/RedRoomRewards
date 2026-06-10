import mongoose, { Document, Schema } from 'mongoose';

export type BurnRedemptionStatus = 'PENDING' | 'FULFILLED' | 'EXPIRED' | 'REVERSED';

export interface IBurnRedemption extends Document {
  redemption_id: string;
  member_id: string;
  catalogue_item_id: string;
  tenant_id: string;
  points_spent: number;
  redemption_code: string;
  status: BurnRedemptionStatus;
  correlation_id: string;
  idempotency_key?: string;
  createdAt: Date;
}

const BurnRedemptionSchema = new Schema<IBurnRedemption>(
  {
    redemption_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    member_id: { type: String, required: true, trim: true, maxlength: 128, index: true },
    catalogue_item_id: { type: String, required: true, trim: true, maxlength: 128, index: true },
    tenant_id: { type: String, required: true, trim: true, maxlength: 128, index: true },
    points_spent: { type: Number, required: true, min: 1 },
    redemption_code: { type: String, required: true, unique: true, trim: true, maxlength: 128 },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'FULFILLED', 'EXPIRED', 'REVERSED'],
      default: 'PENDING',
    },
    correlation_id: { type: String, required: true, trim: true, maxlength: 128 },
    idempotency_key: { type: String, required: false, trim: true, maxlength: 256 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'burn_redemptions',
  },
);

// Unique compound index so concurrent retries with the same key are rejected at the DB layer
BurnRedemptionSchema.index(
  { tenant_id: 1, member_id: 1, idempotency_key: 1 },
  { unique: true, sparse: true },
);

export const BurnRedemptionModel = mongoose.model<IBurnRedemption>(
  'BurnRedemption',
  BurnRedemptionSchema,
);
