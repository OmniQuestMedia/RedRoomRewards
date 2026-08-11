/**
 * PromotionCampaign Model
 *
 * Tenant-scoped configuration for a *soft* loyalty promotion. Three campaign
 * types are supported and the enum is deliberately closed:
 *
 *   PURCHASE_MULTIPLIER — bonus points on qualifying spend. A campaign of this
 *     type with a bounded window and `multiplier: 2` IS the "double points"
 *     campaign; there is no separate mechanism, because a second code path
 *     computing the same bonus is how two multipliers end up disagreeing.
 *   PROGRESS_BONUS      — accumulate progress toward a threshold; crossing it
 *     grants a fixed points bonus exactly once per cycle. This is what the
 *     member-facing progress bar renders.
 *   REDEMPTION_OFFER    — a timed offer that BURNS points for a discount or a
 *     free item. This is the liability-reducing half of the system.
 *
 * ── Why the enum is closed ──────────────────────────────────────────────────
 * CEO Decision D1 retired the slot machine and forbids its re-introduction.
 * The same reasoning bans any chance-based or artificial-scarcity mechanic:
 * a campaign type may not resolve its outcome randomly. Every campaign here is
 * deterministic — a member can compute, before acting, exactly what they get.
 * `assertSoftPromotionShape` in promotion-campaign.service.ts enforces this at
 * write time; adding a fourth type is a charter-level decision, not a patch.
 *
 * ── Economics are frozen once ACTIVE ────────────────────────────────────────
 * `status` is the only field that moves after activation. Multiplier, bonus
 * amount, threshold, offer price, caps and budget are immutable from the moment
 * the campaign starts accruing, because members have already acted on the
 * published terms and the granted points are already real liability. Edits to a
 * live campaign are made by ending it and opening a successor.
 *
 * Collection: promotion_campaigns
 */

import mongoose, { Document, Schema } from 'mongoose';

/** Closed set of soft-promotion mechanics. No chance-based type may be added. */
export type PromotionCampaignType = 'PURCHASE_MULTIPLIER' | 'PROGRESS_BONUS' | 'REDEMPTION_OFFER';

export const PROMOTION_CAMPAIGN_TYPES: readonly PromotionCampaignType[] = [
  'PURCHASE_MULTIPLIER',
  'PROGRESS_BONUS',
  'REDEMPTION_OFFER',
] as const;

/**
 * Campaign lifecycle.
 *   DRAFT   — editable, never grants or burns.
 *   ACTIVE  — economics frozen; in-window behaviour applies.
 *   PAUSED  — economics frozen; behaves as out-of-window (no grants, no burns).
 *   ENDED   — terminal. An ENDED campaign never reactivates.
 */
export type PromotionCampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';

export const PROMOTION_CAMPAIGN_STATUSES: readonly PromotionCampaignStatus[] = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'ENDED',
] as const;

/** What a PROGRESS_BONUS campaign counts toward its threshold. */
export type ProgressMetric = 'SPEND_UNITS' | 'POINTS_EARNED' | 'QUALIFYING_PURCHASES';

export const PROGRESS_METRICS: readonly ProgressMetric[] = [
  'SPEND_UNITS',
  'POINTS_EARNED',
  'QUALIFYING_PURCHASES',
] as const;

/** What a REDEMPTION_OFFER hands back in exchange for the burned points. */
export type OfferRewardType = 'DISCOUNT_CODE' | 'FREE_PRODUCT' | 'EXCLUSIVE_ACCESS';

export const OFFER_REWARD_TYPES: readonly OfferRewardType[] = [
  'DISCOUNT_CODE',
  'FREE_PRODUCT',
  'EXCLUSIVE_ACCESS',
] as const;

/**
 * Contribution bands, derived from a member's real purchase + redemption
 * history by MemberContributionService. The ordering is significant: a band
 * ladder may only ever step upward.
 *
 *   UNPROVEN     — not enough attributable spend history to compute a margin.
 *                  Not the same as "bad": it is "unknown", and unknown never
 *                  earns an uplift.
 *   NET_NEGATIVE — proven history, but gross margin does not cover the cost of
 *                  the points already issued to this member.
 *   NET_POSITIVE — margin covers points cost with headroom.
 *   HIGH_MARGIN  — margin covers points cost several times over.
 */
export type ContributionBand = 'UNPROVEN' | 'NET_NEGATIVE' | 'NET_POSITIVE' | 'HIGH_MARGIN';

export const CONTRIBUTION_BANDS: readonly ContributionBand[] = [
  'UNPROVEN',
  'NET_NEGATIVE',
  'NET_POSITIVE',
  'HIGH_MARGIN',
] as const;

/**
 * Optional uplift ladder for a PURCHASE_MULTIPLIER campaign.
 *
 * Only the two *proven net-positive* bands appear here, and that is the whole
 * point: an uplift is something a member's own contribution history has already
 * paid for. UNPROVEN and NET_NEGATIVE members are not punished — they simply
 * receive the campaign's base `multiplier`, which is what was advertised.
 */
export interface IBandMultipliers {
  NET_POSITIVE?: number;
  HIGH_MARGIN?: number;
}

/** PURCHASE_MULTIPLIER terms. */
export interface IMultiplierTerms {
  /**
   * Base bonus multiplier applied to base earned points, available to every
   * eligible member. `2` means "double points": base 100 → 100 bonus → 200
   * total. Stored as the *total* multiplier, not the bonus fraction, because
   * that is the number the campaign is advertised with and the number an
   * operator will type. Bonus = round(base × (multiplier − 1)).
   */
  multiplier: number;
  /**
   * Margin-gated uplift. When present, a member whose contribution band is
   * listed receives the higher multiplier instead of the base. Each value must
   * be greater than or equal to `multiplier` and must not decrease as the band
   * improves — enforced in assertSoftPromotionShape.
   */
  band_multipliers: IBandMultipliers | null;
  /** Optional merchant restriction; null = every merchant in the tenant. */
  merchant_id: string | null;
  /** Optional event-class restriction (e.g. "PURCHASE"); null = all classes. */
  event_class: string | null;
}

/** PROGRESS_BONUS terms. */
export interface IProgressTerms {
  metric: ProgressMetric;
  /** Progress units required to earn the bonus. */
  threshold: number;
  /** Points granted on each threshold crossing. */
  bonus_points: number;
  /**
   * When true, progress resets to the remainder after a crossing and the bar
   * can be completed again within the window. When false the bar completes at
   * most once per member per campaign.
   */
  repeatable: boolean;
}

/** REDEMPTION_OFFER terms. */
export interface IOfferTerms {
  /** Points burned to claim the offer. */
  points_price: number;
  reward_type: OfferRewardType;
  /** Reward payload (discount pct, SKU, access grant id, …). No PII. */
  reward_value: Record<string, unknown>;
  /** Total claims available across all members; null = unlimited. */
  inventory_count: number | null;
  /** Max claims per member for the life of the campaign. */
  max_per_member: number;
}

export interface IPromotionCampaign extends Document {
  campaign_id: string;
  tenant_id: string;
  campaign_type: PromotionCampaignType;
  status: PromotionCampaignStatus;
  name: string;
  description: string;

  /** Window. A campaign only acts while ACTIVE *and* inside its window. */
  starts_at: Date;
  ends_at: Date | null;

  /** Exactly one terms block is populated, matching `campaign_type`. */
  multiplier_terms: IMultiplierTerms | null;
  progress_terms: IProgressTerms | null;
  offer_terms: IOfferTerms | null;

  /**
   * Liability guardrails. `per_member_points_cap` bounds what any one member can
   * be granted by this campaign; `campaign_points_budget` bounds the campaign's
   * total issuance. Both are required on granting campaigns — an uncapped
   * multiplier is an unbounded liability, which is the failure mode this whole
   * subsystem exists to prevent. Null on REDEMPTION_OFFER, which only burns.
   */
  per_member_points_cap: number | null;
  campaign_points_budget: number | null;

  /** Running total of points granted by this campaign (projection of grants). */
  points_granted_to_date: number;
  /** Running total of points burned against this campaign's offer. */
  points_burned_to_date: number;
  /** Running count of offer claims, used for inventory enforcement. */
  offer_claims_to_date: number;

  correlation_id: string;
  reason_code: string;
  created_by: string;
  /** Set when status moved to ACTIVE — the moment economics froze. */
  activated_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const BandMultipliersSchema = new Schema<IBandMultipliers>(
  {
    NET_POSITIVE: { type: Number, min: 1 },
    HIGH_MARGIN: { type: Number, min: 1 },
  },
  { _id: false },
);

const MultiplierTermsSchema = new Schema<IMultiplierTerms>(
  {
    multiplier: { type: Number, required: true, min: 1 },
    band_multipliers: { type: BandMultipliersSchema, default: null },
    merchant_id: { type: String, default: null, trim: true, maxlength: 128 },
    event_class: { type: String, default: null, trim: true, maxlength: 128 },
  },
  { _id: false },
);

const ProgressTermsSchema = new Schema<IProgressTerms>(
  {
    metric: { type: String, required: true, enum: PROGRESS_METRICS as unknown as string[] },
    threshold: { type: Number, required: true, min: 1 },
    bonus_points: { type: Number, required: true, min: 1 },
    repeatable: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const OfferTermsSchema = new Schema<IOfferTerms>(
  {
    points_price: { type: Number, required: true, min: 1 },
    reward_type: { type: String, required: true, enum: OFFER_REWARD_TYPES as unknown as string[] },
    reward_value: { type: Schema.Types.Mixed, required: true, default: {} },
    inventory_count: { type: Number, default: null, min: 0 },
    max_per_member: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false },
);

export const PromotionCampaignSchema = new Schema<IPromotionCampaign>(
  {
    campaign_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    tenant_id: { type: String, required: true, trim: true, maxlength: 128, index: true },
    campaign_type: {
      type: String,
      required: true,
      enum: PROMOTION_CAMPAIGN_TYPES as unknown as string[],
    },
    status: {
      type: String,
      required: true,
      enum: PROMOTION_CAMPAIGN_STATUSES as unknown as string[],
      default: 'DRAFT',
    },
    name: { type: String, required: true, trim: true, maxlength: 256 },
    description: { type: String, required: true, trim: true, maxlength: 2048 },

    starts_at: { type: Date, required: true, index: true },
    ends_at: { type: Date, default: null },

    multiplier_terms: { type: MultiplierTermsSchema, default: null },
    progress_terms: { type: ProgressTermsSchema, default: null },
    offer_terms: { type: OfferTermsSchema, default: null },

    per_member_points_cap: { type: Number, default: null, min: 1 },
    campaign_points_budget: { type: Number, default: null, min: 1 },

    points_granted_to_date: { type: Number, required: true, default: 0, min: 0 },
    points_burned_to_date: { type: Number, required: true, default: 0, min: 0 },
    offer_claims_to_date: { type: Number, required: true, default: 0, min: 0 },

    correlation_id: { type: String, required: true, trim: true, maxlength: 128, index: true },
    reason_code: { type: String, required: true, trim: true, maxlength: 128 },
    created_by: { type: String, required: true, trim: true, maxlength: 128 },
    activated_at: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'promotion_campaigns',
  },
);

// Active-campaign lookup: the hot path is "what is live for this tenant now".
PromotionCampaignSchema.index({ tenant_id: 1, campaign_type: 1, status: 1, starts_at: -1 });

export const PromotionCampaignModel = mongoose.model<IPromotionCampaign>(
  'PromotionCampaign',
  PromotionCampaignSchema,
);
