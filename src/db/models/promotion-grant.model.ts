/**
 * PromotionGrant Model
 *
 * Append-only record of every bonus a promotion campaign granted to a member.
 * One row per granted bonus; rows are never updated or deleted (charter §3.1.1
 * / §3.2.10 — the same append-only discipline the ledger and PointLot carry).
 *
 * The grant row is written BEFORE the ledger credit and carries the unique
 * `{tenant_id, idempotency_key}` index. That index — not an application-level
 * "have we granted this yet?" read — is what makes a bonus exactly-once under
 * concurrency: two simultaneous requests for the same purchase both try to
 * insert, one wins, the loser returns the winner's row without crediting.
 *
 * `status` is the one mutable field, promoted RESERVED → GRANTED once the
 * ledger credit lands, mirroring the RESERVED → PENDING promotion in
 * BurnCatalogueService.redeemItem. A row stuck in RESERVED means the process
 * died mid-grant; it is a reconciliation signal, not a granted bonus.
 *
 * Collection: promotion_grants
 */

import mongoose, { Document, Schema } from 'mongoose';

export type PromotionGrantKind = 'MULTIPLIER_BONUS' | 'PROGRESS_BONUS';

export const PROMOTION_GRANT_KINDS: readonly PromotionGrantKind[] = [
  'MULTIPLIER_BONUS',
  'PROGRESS_BONUS',
] as const;

export type PromotionGrantStatus = 'RESERVED' | 'GRANTED';

export interface IPromotionGrant extends Document {
  grant_id: string;
  tenant_id: string;
  campaign_id: string;
  member_id: string;
  grant_kind: PromotionGrantKind;

  /** Bonus points credited. Always positive — grants never debit. */
  bonus_points: number;

  /**
   * Base points the bonus was computed from (MULTIPLIER_BONUS only). Retained
   * so a grant can be re-derived and audited without replaying the purchase.
   */
  base_points: number | null;
  /** Multiplier in force at grant time, snapshotted against later config edits. */
  multiplier_applied: number | null;

  /** Opaque reference to the originating purchase/event. Never PII. */
  source_reference: string | null;

  /**
   * Spend, in cents, of the purchase that triggered this grant. Persisted so a
   * campaign's contribution margin can be computed from the campaign's own rows
   * rather than by re-deriving which purchases a campaign influenced — a
   * derivation that becomes impossible once campaigns overlap in time.
   * Null when the grant had no purchase behind it (a progress bar completed by
   * non-spend activity).
   */
  attributed_spend_cents: number | null;

  status: PromotionGrantStatus;
  idempotency_key: string;
  correlation_id: string;
  createdAt: Date;
  updatedAt: Date;
}

export const PromotionGrantSchema = new Schema<IPromotionGrant>(
  {
    grant_id: {
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
    grant_kind: {
      type: String,
      required: true,
      enum: PROMOTION_GRANT_KINDS as unknown as string[],
    },
    bonus_points: { type: Number, required: true, min: 1 },
    base_points: { type: Number, default: null, min: 0 },
    multiplier_applied: { type: Number, default: null, min: 0 },
    source_reference: { type: String, default: null, trim: true, maxlength: 256 },
    attributed_spend_cents: { type: Number, default: null, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ['RESERVED', 'GRANTED'],
      default: 'RESERVED',
    },
    idempotency_key: { type: String, required: true, trim: true, maxlength: 256 },
    correlation_id: { type: String, required: true, trim: true, maxlength: 128, index: true },
  },
  {
    timestamps: true,
    collection: 'promotion_grants',
  },
);

// The exactly-once gate. Concurrent grants for the same purchase collide here.
PromotionGrantSchema.index({ tenant_id: 1, idempotency_key: 1 }, { unique: true });

// Per-member cap enforcement: sum bonus_points for one member on one campaign.
PromotionGrantSchema.index({ tenant_id: 1, campaign_id: 1, member_id: 1 });

export const PromotionGrantModel = mongoose.model<IPromotionGrant>(
  'PromotionGrant',
  PromotionGrantSchema,
);
