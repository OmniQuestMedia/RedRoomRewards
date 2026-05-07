import mongoose, { HydratedDocument, Model, Schema } from 'mongoose';

export type MerchantTier = 'PLATINUM' | 'GOLD' | 'SILVER' | 'MEMBER' | 'GUEST';
export type MerchantPhase = 1 | 2;
export type MerchantStatus = 'active' | 'suspended';

export interface IMerchant {
  _id: mongoose.Types.ObjectId;
  tenant_id: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  merchant_tier: MerchantTier;
  phase: MerchantPhase;
  status: MerchantStatus;
}

export type MerchantDocument = HydratedDocument<IMerchant>;

export const MERCHANT_TIERS: ReadonlyArray<MerchantTier> = [
  'PLATINUM',
  'GOLD',
  'SILVER',
  'MEMBER',
  'GUEST',
] as const;

const MerchantSchema = new Schema<IMerchant>(
  {
    tenant_id: {
      type: Schema.Types.ObjectId,
      ref: 'TenantB001',
      required: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },
    merchant_tier: {
      type: String,
      required: true,
      enum: MERCHANT_TIERS,
    },
    phase: {
      type: Number,
      required: true,
      enum: [1, 2],
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'suspended'],
      default: 'active',
    },
  },
  {
    collection: 'merchants',
    versionKey: false,
  },
);

MerchantSchema.index({ tenant_id: 1, slug: 1 }, { unique: true });
MerchantSchema.index({ tenant_id: 1, slug: 1 });

export const MerchantModel: Model<IMerchant> = mongoose.model<IMerchant>(
  'MerchantB001',
  MerchantSchema,
);
export { MerchantSchema };
