/**
 * EarnRateConfig Model
 *
 * Tenant-scoped, merchant-set earn rate configuration per event class.
 * Versioned via effective_at / superseded_at — never delete or update rows;
 * insert a new row and stamp superseded_at on the prior active row.
 *
 * The base earn rate is `base_points_per_unit × amount`. The earn **bonus** is
 * NOT set here — it is a per-Standing-tier `rrr_multiplier` on the tier benefits
 * card (see tier-benefit-config.model.ts). Applied in
 * PointAccrualService.calculateEarnRate as `base × (1 + rrr_multiplier)`.
 *
 * Canon Amendment 2026-08 (CEO):
 *   - The former per-config `inferno_multiplier` (retired Room-Heat "Inferno
 *     Bonus" lever) is REMOVED. There is no per-EarnRateConfig multiplier; the
 *     only earn multiplier is the per-Standing-tier `rrr_multiplier`.
 *   - The former `rrr_member_tier` field is REMOVED — RRR has no persisted
 *     member-tier ladder beyond Standing (drift sanitised out).
 * CEO Decision D3: diamond_concierge_zero_earn defaults to true.
 *   Diamond Concierge purchases earn 0 RRR points. Setting this to false
 *   requires an explicit config row with reason_code documenting CEO exception.
 *
 * Collection: earn_rate_configs
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IEarnRateConfig extends Document {
  config_id: string;
  tenant_id: string;
  merchant_id: string;
  effective_at: Date;
  superseded_at: Date | null;
  correlation_id: string;
  reason_code: string;
  created_by: string;
  merchant_tier: string;
  event_class: string;
  base_points_per_unit: number;
  diamond_concierge_zero_earn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const EarnRateConfigSchema = new Schema<IEarnRateConfig>(
  {
    config_id: {
      type: String,
      required: true,
      unique: true,
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
    merchant_id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    effective_at: {
      type: Date,
      required: true,
      index: true,
    },
    superseded_at: {
      type: Date,
      required: false,
      default: null,
    },
    correlation_id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    reason_code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    created_by: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    merchant_tier: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    event_class: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    base_points_per_unit: {
      type: Number,
      required: true,
      min: 0,
    },
    // CEO Decision D3: Diamond Concierge earns 0 RRR points. Default true.
    // Only set to false with an explicit config row whose reason_code documents
    // a CEO-authorized exception.
    diamond_concierge_zero_earn: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'earn_rate_configs',
  },
);

// Compound index for active-config lookup (tenant + merchant, newest first)
EarnRateConfigSchema.index({ tenant_id: 1, merchant_id: 1, effective_at: -1 });

// Additional index for tier + event lookups
EarnRateConfigSchema.index({ tenant_id: 1, merchant_id: 1, merchant_tier: 1, event_class: 1 });

export const EarnRateConfigModel = mongoose.model<IEarnRateConfig>(
  'EarnRateConfig',
  EarnRateConfigSchema,
);
