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
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'burn_redemptions',
  },
);

// Append-only: disable update and remove to prevent mutation
BurnRedemptionSchema.pre('findOneAndUpdate', function () {
  throw new Error('BurnRedemption records are append-only — use status transitions instead');
});

export const BurnRedemptionModel = mongoose.model<IBurnRedemption>(
  'BurnRedemption',
  BurnRedemptionSchema,
);
