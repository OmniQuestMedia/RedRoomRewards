import mongoose, { HydratedDocument, Model, Schema } from 'mongoose';

export type TenantStatus = 'active' | 'suspended';

export interface ITenant {
  _id: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  created_at: Date;
  status: TenantStatus;
}

export type TenantDocument = HydratedDocument<ITenant>;

const TenantSchema = new Schema<ITenant>(
  {
    slug: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },
    created_at: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'suspended'],
      default: 'active',
    },
  },
  {
    collection: 'tenants',
    versionKey: false,
  },
);

TenantSchema.index({ slug: 1 }, { unique: true });

export const TenantModel: Model<ITenant> = mongoose.model<ITenant>('TenantB001', TenantSchema);
export { TenantSchema };
