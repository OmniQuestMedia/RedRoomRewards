/**
 * LoyaltyAccount Model
 *
 * Tenant-scoped loyalty account — the canonical RRR identity for a
 * member as they engage across one or more merchants under a tenant.
 * Each account holds a tier classification (member-level, distinct
 * from `merchant_tier` per CEO Decision B2 dual-tier model).
 *
 * Unique constraint: (tenant_id, account_id) — composite uniqueness
 * keeps account_id values portable across tenants without leaking.
 *
 * Collection: loyalty_accounts
 */

import mongoose, { Document, Schema } from 'mongoose';

export type LoyaltyAccountStatus = 'active' | 'suspended' | 'closed';

// Canon Amendment 2026-08: RRR is standing-only. The former RRR-native
// `RrrMemberTier` (`GUEST…PLATINUM`) ladder on the loyalty account was drift —
// there is no RRR-native member tier. Earned progression is Standing
// (DESIRE/PASSION/OBSESSION/REIGN, see RedRoomTier). External ChatNow.Zone /
// SynthiMatesAi member tiers may only *trigger* RRR multipliers/rewards; they
// are not stored on the RRR account. The type, its constant, and the
// `rrr_member_tier` field are removed here.

export interface ILoyaltyAccount extends Document {
  account_id: string;
  tenant_id: string;
  user_id: string;
  status: LoyaltyAccountStatus;
  enrolled_at: Date;
  closed_at?: Date | null;
  default_currency: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const LoyaltyAccountSchema = new Schema<ILoyaltyAccount>(
  {
    account_id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    tenant_id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    user_id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'suspended', 'closed'],
      default: 'active',
      index: true,
    },
    enrolled_at: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    closed_at: {
      type: Date,
      required: false,
      default: null,
    },
    default_currency: {
      type: String,
      required: true,
      trim: true,
      maxlength: 16,
      default: 'points',
    },
    notes: {
      type: String,
      required: false,
      trim: true,
      maxlength: 2048,
    },
  },
  {
    timestamps: true,
    collection: 'loyalty_accounts',
  },
);

// Composite uniqueness — (tenant_id, account_id) and (tenant_id, user_id).
LoyaltyAccountSchema.index({ tenant_id: 1, account_id: 1 }, { unique: true });
LoyaltyAccountSchema.index({ tenant_id: 1, user_id: 1 }, { unique: true });
LoyaltyAccountSchema.index({ tenant_id: 1, status: 1 });

export const LoyaltyAccountModel = mongoose.model<ILoyaltyAccount>(
  'LoyaltyAccount',
  LoyaltyAccountSchema,
);
