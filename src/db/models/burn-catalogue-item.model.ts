import mongoose, { Document, Schema } from 'mongoose';

export type RedemptionType = 'DISCOUNT_CODE' | 'FREE_PRODUCT' | 'EXCLUSIVE_ACCESS';

export interface IBurnCatalogueItem extends Document {
  item_id: string;
  tenant_id: string;
  title: string;
  description: string;
  image_url?: string;
  points_cost: number;
  inventory_count: number | null;
  is_active: boolean;
  valid_from?: Date | null;
  valid_until?: Date | null;
  redemption_type: RedemptionType;
  redemption_value: Record<string, unknown>;
  correlation_id: string;
  createdAt: Date;
  updatedAt: Date;
}

const BurnCatalogueItemSchema = new Schema<IBurnCatalogueItem>(
  {
    item_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    tenant_id: { type: String, required: true, trim: true, maxlength: 128, index: true },
    title: { type: String, required: true, trim: true, maxlength: 256 },
    description: { type: String, required: true, trim: true, maxlength: 2048 },
    image_url: { type: String, trim: true, maxlength: 512 },
    points_cost: { type: Number, required: true, min: 1 },
    inventory_count: { type: Number, default: null },
    is_active: { type: Boolean, required: true, default: true },
    valid_from: { type: Date, default: null },
    valid_until: { type: Date, default: null },
    redemption_type: {
      type: String,
      required: true,
      enum: ['DISCOUNT_CODE', 'FREE_PRODUCT', 'EXCLUSIVE_ACCESS'],
    },
    redemption_value: { type: Schema.Types.Mixed, required: true, default: {} },
    correlation_id: { type: String, required: true, trim: true, maxlength: 128 },
  },
  {
    timestamps: true,
    collection: 'burn_catalogue_items',
  },
);

BurnCatalogueItemSchema.index({ tenant_id: 1, is_active: 1 });

export const BurnCatalogueItemModel = mongoose.model<IBurnCatalogueItem>(
  'BurnCatalogueItem',
  BurnCatalogueItemSchema,
);
