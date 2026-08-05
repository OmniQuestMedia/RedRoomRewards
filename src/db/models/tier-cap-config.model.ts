/**
 * TierCapConfig Model — the per-tier redemption **band** card.
 *
 * Tenant-scoped, admin-set redemption limits per RRR **Standing** tier
 * (Desire / Passion / Obsession / Reign — RRR's only membership ladder; see
 * docs/DOMAIN_GLOSSARY.md § Member Standing). One active card per tenant per
 * tier. Versioned via effective_at / superseded_at — never delete or update
 * rows; insert a new row and stamp superseded_at on the prior active row.
 *
 * Canon Amendment 2026-08 (CEO): redemption is a per-Standing-tier **band**
 *   `redemption_floor_pct` … `redemption_cap_pct` of the member's
 *   **merchandise-eligible** order value. Points may NOT be redeemed against
 *   taxes / shipping / handling / customs-import-excise charges, so the band is
 *   applied to the caller-supplied merchandise subtotal, never the gross order.
 *   Redemption is additionally subject to processed-points availability.
 *
 *   CEO-set band (seeded by migration; admin may re-version):
 *     DESIRE     5 % … 15 %
 *     PASSION    5 % … 25 %
 *     OBSESSION  5 % … 35 %
 *     REIGN      5 % … 45 %
 *
 *   This replaces the retired per-merchant `GUEST…PLATINUM` ladder (drift): the
 *   band is program-wide Standing-tier policy (tenant-scoped, no merchant_id).
 *
 * Collection: tier_cap_configs
 */

import mongoose, { Document, Schema } from 'mongoose';
import { RedRoomTier } from '../../interfaces/redroom-rewards';

export interface ITierCapConfig extends Document {
  config_id: string;
  tenant_id: string;
  effective_at: Date;
  superseded_at: Date | null;
  correlation_id: string;
  reason_code: string;
  created_by: string;
  tier: RedRoomTier;
  /** Minimum redemption as a % of the merchandise-eligible value (the 5 % floor). */
  redemption_floor_pct: number;
  /** Maximum redemption as a % of the merchandise-eligible value (the tier cap). */
  redemption_cap_pct: number;
  createdAt: Date;
  updatedAt: Date;
}

export const TierCapConfigSchema = new Schema<ITierCapConfig>(
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
    // Canon Amendment 2026-08: the 5 % redemption floor (minimum of the band).
    redemption_floor_pct: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    // Canon Amendment 2026-08: the per-tier redemption cap (maximum of the band).
    redemption_cap_pct: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
    collection: 'tier_cap_configs',
  },
);

// Compound index for active-card lookup (tenant, newest first)
TierCapConfigSchema.index({ tenant_id: 1, effective_at: -1 });

// Index for tier-specific active-card lookups
TierCapConfigSchema.index({ tenant_id: 1, tier: 1, superseded_at: 1 });

export const TierCapConfigModel = mongoose.model<ITierCapConfig>(
  'TierCapConfig',
  TierCapConfigSchema,
);
