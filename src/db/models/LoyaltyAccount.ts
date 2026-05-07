import mongoose, { HydratedDocument, Model, Schema } from 'mongoose';

export type RrrMemberTier = 'PLATINUM' | 'GOLD' | 'SILVER' | 'MEMBER' | 'GUEST';
export type LoyaltyAccountStatus = 'active' | 'suspended';

export interface ILoyaltyAccount {
  _id: mongoose.Types.ObjectId;
  tenant_id: mongoose.Types.ObjectId;
  external_user_id: string;
  rrr_member_tier: RrrMemberTier | null;
  created_at: Date;
  status: LoyaltyAccountStatus;
}

export type LoyaltyAccountDocument = HydratedDocument<ILoyaltyAccount>;

export const RRR_MEMBER_TIERS: ReadonlyArray<RrrMemberTier> = [
  'PLATINUM',
  'GOLD',
  'SILVER',
  'MEMBER',
  'GUEST',
] as const;

const LoyaltyAccountSchema = new Schema<ILoyaltyAccount>(
  {
    tenant_id: {
      type: Schema.Types.ObjectId,
      ref: 'TenantB001',
      required: true,
      index: true,
    },
    external_user_id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },
    rrr_member_tier: {
      type: String,
      required: false,
      enum: [...RRR_MEMBER_TIERS, null],
      default: null,
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
    collection: 'loyalty_accounts',
    versionKey: false,
  },
);

LoyaltyAccountSchema.index({ tenant_id: 1, external_user_id: 1 }, { unique: true });
LoyaltyAccountSchema.index({ tenant_id: 1, external_user_id: 1 });

export const LoyaltyAccountModel: Model<ILoyaltyAccount> = mongoose.model<ILoyaltyAccount>(
  'LoyaltyAccountB002',
  LoyaltyAccountSchema,
);
export { LoyaltyAccountSchema };
