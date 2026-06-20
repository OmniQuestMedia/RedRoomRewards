import mongoose, { Document, Schema } from 'mongoose';

export interface IAffiliateLink extends Document {
  affiliate_id: string;
  tenant_id: string;
  creator_id: string;
  platform: 'chatnow' | 'synthimate' | 'redroompleasures';
  external_creator_ref: string;
  bonus_points_pct: number;
  is_active: boolean;
  activated_at: Date;
  deactivated_at: Date | null;
  correlation_id: string;
  createdAt: Date;
  updatedAt: Date;
}

const AffiliateLinkSchema = new Schema<IAffiliateLink>(
  {
    affiliate_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tenant_id: {
      type: String,
      required: true,
      index: true,
    },
    creator_id: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ['chatnow', 'synthimate', 'redroompleasures'],
    },
    external_creator_ref: {
      type: String,
      required: true,
      maxlength: 256,
    },
    bonus_points_pct: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
      validate: {
        validator: (v: number) => Number.isInteger(v),
        message: 'bonus_points_pct must be an integer',
      },
    },
    is_active: {
      type: Boolean,
      required: true,
      default: true,
    },
    activated_at: {
      type: Date,
      required: true,
    },
    deactivated_at: {
      type: Date,
      default: null,
    },
    correlation_id: {
      type: String,
      required: true,
      maxlength: 128,
    },
  },
  {
    timestamps: true,
    collection: 'affiliate_links',
  },
);

AffiliateLinkSchema.index({ tenant_id: 1, creator_id: 1, platform: 1 }, { unique: true });
AffiliateLinkSchema.index({ tenant_id: 1, platform: 1, is_active: 1 });

export const AffiliateLinkModel = mongoose.model<IAffiliateLink>(
  'AffiliateLink',
  AffiliateLinkSchema,
);
