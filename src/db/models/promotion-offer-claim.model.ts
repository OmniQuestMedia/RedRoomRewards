/**
 * PromotionOfferClaim Model
 *
 * One row per member claim against a REDEMPTION_OFFER campaign — the burn side
 * of the promotions system, and the mechanism that actually retires points
 * liability rather than adding to it.
 *
 * Same single-winner pattern as PromotionGrant and BurnRedemption: the row is
 * inserted first against the unique `{tenant_id, idempotency_key}` index, and
 * only the insert winner proceeds to debit points. `status` is promoted
 * RESERVED → CLAIMED once the debit lands, so a RESERVED row is never mistaken
 * for a delivered reward.
 *
 * `claim_code` is the member-presentable token for the discount or free item.
 *
 * Collection: promotion_offer_claims
 */

import mongoose, { Document, Schema } from 'mongoose';
import { OfferRewardType, OFFER_REWARD_TYPES } from './promotion-campaign.model';

export type PromotionOfferClaimStatus = 'RESERVED' | 'CLAIMED' | 'FULFILLED';

export const PROMOTION_OFFER_CLAIM_STATUSES: readonly PromotionOfferClaimStatus[] = [
  'RESERVED',
  'CLAIMED',
  'FULFILLED',
] as const;

export interface IPromotionOfferClaim extends Document {
  claim_id: string;
  tenant_id: string;
  campaign_id: string;
  member_id: string;

  campaign_name: string;
  /** Points burned for this claim, snapshotted from the frozen offer terms. */
  points_burned: number;
  reward_type: OfferRewardType;
  reward_value: Record<string, unknown>;

  claim_code: string;
  status: PromotionOfferClaimStatus;
  idempotency_key: string;
  correlation_id: string;
  createdAt: Date;
  updatedAt: Date;
}

export const PromotionOfferClaimSchema = new Schema<IPromotionOfferClaim>(
  {
    claim_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    tenant_id: { type: String, required: true, trim: true, maxlength: 128, index: true },
    campaign_id: { type: String, required: true, trim: true, maxlength: 128, index: true },
    member_id: { type: String, required: true, trim: true, maxlength: 128, index: true },

    campaign_name: { type: String, required: true, trim: true, maxlength: 256 },
    points_burned: { type: Number, required: true, min: 1 },
    reward_type: {
      type: String,
      required: true,
      enum: OFFER_REWARD_TYPES as unknown as string[],
    },
    reward_value: { type: Schema.Types.Mixed, required: true, default: {} },

    claim_code: { type: String, required: true, trim: true, maxlength: 128, index: true },
    status: {
      type: String,
      required: true,
      enum: PROMOTION_OFFER_CLAIM_STATUSES as unknown as string[],
      default: 'RESERVED',
    },
    idempotency_key: { type: String, required: true, trim: true, maxlength: 256 },
    correlation_id: { type: String, required: true, trim: true, maxlength: 128, index: true },
  },
  {
    timestamps: true,
    collection: 'promotion_offer_claims',
  },
);

// The single-winner gate for concurrent claims of the same idempotency key.
PromotionOfferClaimSchema.index({ tenant_id: 1, idempotency_key: 1 }, { unique: true });

// Per-member claim-count enforcement (max_per_member).
PromotionOfferClaimSchema.index({ tenant_id: 1, campaign_id: 1, member_id: 1 });

export const PromotionOfferClaimModel = mongoose.model<IPromotionOfferClaim>(
  'PromotionOfferClaim',
  PromotionOfferClaimSchema,
);
