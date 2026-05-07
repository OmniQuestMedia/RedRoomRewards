import mongoose, { HydratedDocument, Model, Schema } from 'mongoose';

export type IdentityLinkStatus = 'active' | 'suspended';

export interface IIdentityLink {
  _id: mongoose.Types.ObjectId;
  loyalty_account_id: mongoose.Types.ObjectId;
  merchant_id: mongoose.Types.ObjectId;
  external_account_ref: string;
  created_at: Date;
  status: IdentityLinkStatus;
}

export type IdentityLinkDocument = HydratedDocument<IIdentityLink>;

const IdentityLinkSchema = new Schema<IIdentityLink>(
  {
    loyalty_account_id: {
      type: Schema.Types.ObjectId,
      ref: 'LoyaltyAccountB002',
      required: true,
      index: true,
    },
    merchant_id: {
      type: Schema.Types.ObjectId,
      ref: 'MerchantB001',
      required: true,
      index: true,
    },
    external_account_ref: {
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
    collection: 'identity_links',
    versionKey: false,
  },
);

IdentityLinkSchema.index({ merchant_id: 1, external_account_ref: 1 }, { unique: true });
IdentityLinkSchema.index({ merchant_id: 1, external_account_ref: 1 });

export const IdentityLinkModel: Model<IIdentityLink> = mongoose.model<IIdentityLink>(
  'IdentityLinkB002',
  IdentityLinkSchema,
);
export { IdentityLinkSchema };
