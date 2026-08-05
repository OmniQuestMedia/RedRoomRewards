/**
 * TierBenefitConfig Model — the per-tier benefits "card".
 *
 * Tenant-scoped, admin-set benefits/bonuses configuration per RRR **Standing**
 * tier (Desire / Passion / Obsession / Reign — RRR's only membership ladder;
 * see docs/DOMAIN_GLOSSARY.md § Member Standing). One active card per tenant
 * per tier. Versioned via effective_at / superseded_at — never delete or update
 * rows; insert a new row and stamp superseded_at on the prior active row.
 *
 * Canon Amendment 2026-08 (CEO): the earn lever is a **per-Standing-tier**
 *   `rrr_multiplier` that lives on this card — NOT the retired per-EarnRateConfig
 *   `inferno_multiplier` (removed). It is a **bonus fraction**: a member earning
 *   1 base point earns `1 × (1 + rrr_multiplier)`. `rrr_multiplier = 0` ⇒ 0 %
 *   bonus ⇒ base points unchanged. Every tier defaults to 0 % (admin-configurable);
 *   raising a tier's `rrr_multiplier` grants that tier its bonus.
 *
 *   The four tier cards realise the CEO's named fields directly:
 *     DESIRE   card → rrr_multiplier  (rrr_multiplier_desire)
 *     PASSION  card → rrr_multiplier  (rrr_multiplier_passion)
 *     OBSESSION card → rrr_multiplier (rrr_multiplier_obsession)
 *     REIGN    card → rrr_multiplier  (rrr_multiplier_reign)
 *
 * `double_points_days_per_year` and `birthday_bonus_days` are the other per-tier
 * benefits established on the card.
 *
 * Collection: tier_benefit_configs
 */

import mongoose, { Document, Schema } from 'mongoose';
import { RedRoomTier } from '../../interfaces/redroom-rewards';

export interface ITierBenefitConfig extends Document {
  config_id: string;
  tenant_id: string;
  effective_at: Date;
  superseded_at: Date | null;
  correlation_id: string;
  reason_code: string;
  created_by: string;
  tier: RedRoomTier;
  /**
   * Per-tier earn bonus fraction. 0 = 0 % bonus (default). A member earning
   * `base` points earns `base × (1 + rrr_multiplier)`. Admin-configurable.
   */
  rrr_multiplier: number;
  double_points_days_per_year: number;
  birthday_bonus_days: number;
  createdAt: Date;
  updatedAt: Date;
}

export const TierBenefitConfigSchema = new Schema<ITierBenefitConfig>(
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
    tier: {
      type: String,
      required: true,
      enum: [RedRoomTier.DESIRE, RedRoomTier.PASSION, RedRoomTier.OBSESSION, RedRoomTier.REIGN],
    },
    // Canon Amendment 2026-08: per-tier earn bonus fraction. Default 0 % — an
    // admin must raise it explicitly to grant a tier its bonus. Non-negative.
    rrr_multiplier: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    double_points_days_per_year: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    birthday_bonus_days: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'tier_benefit_configs',
  },
);

// Compound index for active-card lookup (tenant, newest first)
TierBenefitConfigSchema.index({ tenant_id: 1, effective_at: -1 });

// Index for tier-specific active-card lookups
TierBenefitConfigSchema.index({ tenant_id: 1, tier: 1, superseded_at: 1 });

export const TierBenefitConfigModel = mongoose.model<ITierBenefitConfig>(
  'TierBenefitConfig',
  TierBenefitConfigSchema,
);
