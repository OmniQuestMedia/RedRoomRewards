/**
 * PromotionProgress Model
 *
 * Per-member, per-campaign accumulator behind a progress-to-bonus bar.
 *
 * This is a *projection*, not a source of truth: the authoritative record of
 * what was granted is the append-only PromotionGrant + LedgerEntry pair. If this
 * counter is ever lost it can be rebuilt from the contributing events. It exists
 * so the member portal can render a bar without aggregating the whole ledger on
 * every page load.
 *
 * `progress_units` is monotonically increasing within a cycle and is reduced
 * only by a threshold crossing (which subtracts one threshold's worth and
 * increments `completions`). It is never edited to a chosen value.
 *
 * `version` supports the same optimistic-locking retry discipline used on
 * WalletModel (charter §3.2.9): concurrent purchases must not lose progress by
 * clobbering each other's read-modify-write.
 *
 * Collection: promotion_progress
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IPromotionProgress extends Document {
  progress_id: string;
  tenant_id: string;
  campaign_id: string;
  member_id: string;

  /** Progress accumulated toward the current threshold crossing. */
  progress_units: number;
  /** Lifetime progress contributed on this campaign, never reduced. */
  lifetime_units: number;
  /** How many times this member has completed the bar on this campaign. */
  completions: number;
  /** Total bonus points this campaign has granted this member. */
  bonus_points_earned: number;

  version: number;
  correlation_id: string;
  createdAt: Date;
  updatedAt: Date;
}

export const PromotionProgressSchema = new Schema<IPromotionProgress>(
  {
    progress_id: {
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

    progress_units: { type: Number, required: true, default: 0, min: 0 },
    lifetime_units: { type: Number, required: true, default: 0, min: 0 },
    completions: { type: Number, required: true, default: 0, min: 0 },
    bonus_points_earned: { type: Number, required: true, default: 0, min: 0 },

    version: { type: Number, required: true, default: 0, min: 0 },
    correlation_id: { type: String, required: true, trim: true, maxlength: 128 },
  },
  {
    timestamps: true,
    collection: 'promotion_progress',
  },
);

// One accumulator per member per campaign.
PromotionProgressSchema.index({ tenant_id: 1, campaign_id: 1, member_id: 1 }, { unique: true });

export const PromotionProgressModel = mongoose.model<IPromotionProgress>(
  'PromotionProgress',
  PromotionProgressSchema,
);
