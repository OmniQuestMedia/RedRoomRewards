/**
 * Promotion Engine Service
 *
 * Runtime for soft loyalty promotions. Three entry points, one discipline:
 *
 *   applyPurchaseBonus  — purchase multipliers and double-points campaigns
 *   recordProgress      — progress-to-bonus bars
 *   claimOffer          — timed redemption offers (the liability burn)
 *
 * Every one of them: checks eligibility (GateGuard + welfare + proven margin),
 * writes a durable record against a unique idempotency index, moves points
 * through LedgerService with a promotion-specific reason code, and updates the
 * campaign's running totals. Nothing here mutates a wallet balance directly —
 * `LedgerService.creditPoints` / `deductPoints` own that, per charter §3.1.2.
 *
 * ── Ordering (record first, then move points) ───────────────────────────────
 * The grant/claim row is inserted BEFORE the ledger movement, in RESERVED
 * status, and promoted to GRANTED/CLAIMED after. The unique
 * `{tenant_id, idempotency_key}` index on that insert — not a prior read — is
 * the concurrency gate. A read-then-write would let two simultaneous requests
 * for the same purchase both observe "not yet granted" and both credit.
 * If the ledger movement then fails, the RESERVED row is removed, so a retry
 * is clean.
 *
 * ── Caps are enforced against granted rows, not the campaign counter ────────
 * `points_granted_to_date` is a projection for reporting. Per-member caps and
 * the campaign budget are checked by aggregating actual grant rows, then
 * re-checked atomically via a conditional `$inc` on the campaign document, so
 * two concurrent grants cannot jointly exceed the budget.
 *
 * @module promotions/promotion-engine.service
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionReason } from '../wallets/types';
import { PromotionCampaignModel, IPromotionCampaign } from '../db/models/promotion-campaign.model';
import { PromotionGrantModel, PromotionGrantKind } from '../db/models/promotion-grant.model';
import { PromotionProgressModel } from '../db/models/promotion-progress.model';
import { PromotionOfferClaimModel } from '../db/models/promotion-offer-claim.model';
import { PromotionEligibilityService } from './promotion-eligibility.service';

/** Optimistic-lock retry budget for the progress accumulator. */
const MAX_PROGRESS_RETRIES = 3;

export interface ApplyPurchaseBonusInput {
  tenantId: string;
  memberId: string;
  /** Base points already earned for this purchase by the accrual path. */
  basePoints: number;
  /** Purchase value in cents — recorded so contribution margin is provable. */
  spendCents: number;
  merchantId: string;
  eventClass?: string;
  /** Opaque purchase reference. Never PII. */
  purchaseReference: string;
  idempotencyKey: string;
}

export interface CampaignBonusBreakdown {
  campaignId: string;
  campaignName: string;
  multiplierApplied: number;
  upliftApplied: boolean;
  bonusPoints: number;
  /** Bonus the campaign would have paid before caps were applied. */
  bonusPointsUncapped: number;
  capApplied: 'NONE' | 'PER_MEMBER' | 'CAMPAIGN_BUDGET';
}

export interface ApplyPurchaseBonusResult {
  memberId: string;
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
  /** Contribution band that decided the uplift, for operator transparency. */
  contributionBand: string | null;
  eligibilityReason: string;
  campaigns: CampaignBonusBreakdown[];
}

export interface ProgressBarView {
  campaignId: string;
  campaignName: string;
  description: string;
  metric: string;
  threshold: number;
  progressUnits: number;
  /** 0..1, clamped. What the bar renders. */
  progressRatio: number;
  unitsRemaining: number;
  bonusPoints: number;
  completions: number;
  repeatable: boolean;
  endsAt: Date | null;
}

export interface RecordProgressInput {
  tenantId: string;
  memberId: string;
  /** Units to add, in the campaign's metric. */
  units: number;
  spendCents?: number;
  merchantId?: string;
  sourceReference: string;
  idempotencyKey: string;
}

export interface OfferView {
  campaignId: string;
  name: string;
  description: string;
  pointsPrice: number;
  rewardType: string;
  rewardValue: Record<string, unknown>;
  endsAt: Date | null;
  remainingInventory: number | null;
  claimsRemainingForMember: number;
}

export interface ClaimOfferResult {
  claimId: string;
  claimCode: string;
  campaignId: string;
  campaignName: string;
  pointsBurned: number;
  rewardType: string;
  rewardValue: Record<string, unknown>;
}

@Injectable()
export class PromotionEngineService {
  private readonly logger = new Logger(PromotionEngineService.name);

  constructor(
    private readonly ledger: LedgerService,
    private readonly eligibility: PromotionEligibilityService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Purchase multipliers / double points
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Grant multiplier bonuses for a purchase that has already accrued
   * `basePoints`. Returns the full breakdown even when nothing was granted, so
   * the caller can show a member exactly why.
   *
   * This never touches base accrual — the accrual path stays the single owner
   * of base points, and this layers a separately-reasoned bonus on top. That
   * separation is what keeps campaign cost measurable after the fact.
   */
  async applyPurchaseBonus(input: ApplyPurchaseBonusInput): Promise<ApplyPurchaseBonusResult> {
    if (!Number.isFinite(input.basePoints) || input.basePoints < 0) {
      throw new BadRequestException('basePoints must be a non-negative number');
    }
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException('idempotencyKey is required');
    }

    const campaigns = await this.findLiveCampaigns(input.tenantId, 'PURCHASE_MULTIPLIER');

    const applicable = campaigns.filter((c) => {
      const terms = c.multiplier_terms;
      if (!terms) return false;
      if (terms.merchant_id && terms.merchant_id !== input.merchantId) return false;
      if (terms.event_class && input.eventClass && terms.event_class !== input.eventClass) {
        return false;
      }
      return true;
    });

    const empty: ApplyPurchaseBonusResult = {
      memberId: input.memberId,
      basePoints: input.basePoints,
      bonusPoints: 0,
      totalPoints: input.basePoints,
      contributionBand: null,
      eligibilityReason: 'No live multiplier campaign applies to this purchase.',
      campaigns: [],
    };

    if (applicable.length === 0 || input.basePoints === 0) {
      return empty;
    }

    // Score eligibility once against the largest bonus any live campaign could
    // pay. Scoring per-campaign would let a member be welfare-cleared on each
    // small campaign individually while the aggregate crosses the threshold.
    const maxPotentialBonus = applicable.reduce((max, c) => {
      const terms = c.multiplier_terms!;
      const best = Math.max(
        terms.multiplier,
        terms.band_multipliers?.NET_POSITIVE ?? 0,
        terms.band_multipliers?.HIGH_MARGIN ?? 0,
      );
      return Math.max(max, Math.round(input.basePoints * (best - 1)));
    }, 0);

    const decision = await this.eligibility.evaluate({
      tenantId: input.tenantId,
      memberId: input.memberId,
      movement: 'GRANT',
      pointsAtStake: maxPotentialBonus,
      transactionRef: input.purchaseReference,
      merchantId: input.merchantId,
    });

    if (!decision.allowed) {
      return { ...empty, eligibilityReason: decision.explanation, contributionBand: decision.band };
    }

    const breakdowns: CampaignBonusBreakdown[] = [];
    let totalBonus = 0;

    for (const campaign of applicable) {
      const terms = campaign.multiplier_terms!;
      const { multiplier, upliftApplied } = this.eligibility.resolveMultiplier(
        terms,
        decision.band,
        decision.upliftPermitted,
      );

      const uncapped = Math.round(input.basePoints * (multiplier - 1));
      if (uncapped <= 0) {
        continue;
      }

      const granted = await this.grantBonus({
        campaign,
        memberId: input.memberId,
        tenantId: input.tenantId,
        kind: 'MULTIPLIER_BONUS',
        requestedPoints: uncapped,
        basePoints: input.basePoints,
        multiplier,
        sourceReference: input.purchaseReference,
        spendCents: input.spendCents,
        idempotencyKey: `promo-mult-${campaign.campaign_id}-${input.idempotencyKey}`,
        reasonCode: TransactionReason.PROMOTION_MULTIPLIER_BONUS,
      });

      breakdowns.push({
        campaignId: campaign.campaign_id,
        campaignName: campaign.name,
        multiplierApplied: multiplier,
        upliftApplied,
        bonusPoints: granted.points,
        bonusPointsUncapped: uncapped,
        capApplied: granted.capApplied,
      });
      totalBonus += granted.points;
    }

    return {
      memberId: input.memberId,
      basePoints: input.basePoints,
      bonusPoints: totalBonus,
      totalPoints: input.basePoints + totalBonus,
      contributionBand: decision.band,
      eligibilityReason: decision.explanation,
      campaigns: breakdowns,
    };
  }

  /**
   * Preview what a purchase would earn without granting anything. Same code
   * path minus the writes, so the number a member is shown before buying is the
   * number they actually get — a separate "estimate" implementation is how
   * those two drift apart.
   */
  async previewPurchaseBonus(
    input: Omit<ApplyPurchaseBonusInput, 'idempotencyKey'>,
  ): Promise<ApplyPurchaseBonusResult> {
    const campaigns = await this.findLiveCampaigns(input.tenantId, 'PURCHASE_MULTIPLIER');
    const applicable = campaigns.filter((c) => {
      const terms = c.multiplier_terms;
      if (!terms) return false;
      if (terms.merchant_id && terms.merchant_id !== input.merchantId) return false;
      if (terms.event_class && input.eventClass && terms.event_class !== input.eventClass) {
        return false;
      }
      return true;
    });

    if (applicable.length === 0 || input.basePoints <= 0) {
      return {
        memberId: input.memberId,
        basePoints: input.basePoints,
        bonusPoints: 0,
        totalPoints: input.basePoints,
        contributionBand: null,
        eligibilityReason: 'No live multiplier campaign applies to this purchase.',
        campaigns: [],
      };
    }

    const decision = await this.eligibility.evaluate({
      tenantId: input.tenantId,
      memberId: input.memberId,
      movement: 'GRANT',
      pointsAtStake: input.basePoints,
      transactionRef: input.purchaseReference,
      merchantId: input.merchantId,
    });

    const breakdowns: CampaignBonusBreakdown[] = [];
    let totalBonus = 0;

    if (decision.allowed) {
      for (const campaign of applicable) {
        const terms = campaign.multiplier_terms!;
        const { multiplier, upliftApplied } = this.eligibility.resolveMultiplier(
          terms,
          decision.band,
          decision.upliftPermitted,
        );
        const uncapped = Math.round(input.basePoints * (multiplier - 1));
        if (uncapped <= 0) continue;

        const headroom = await this.remainingHeadroom(campaign, input.memberId, input.tenantId);
        const bonus = Math.max(0, Math.min(uncapped, headroom.allowed));

        breakdowns.push({
          campaignId: campaign.campaign_id,
          campaignName: campaign.name,
          multiplierApplied: multiplier,
          upliftApplied,
          bonusPoints: bonus,
          bonusPointsUncapped: uncapped,
          capApplied: bonus < uncapped ? headroom.limitedBy : 'NONE',
        });
        totalBonus += bonus;
      }
    }

    return {
      memberId: input.memberId,
      basePoints: input.basePoints,
      bonusPoints: totalBonus,
      totalPoints: input.basePoints + totalBonus,
      contributionBand: decision.band,
      eligibilityReason: decision.explanation,
      campaigns: breakdowns,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Progress-to-bonus bars
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Add progress against every live PROGRESS_BONUS campaign and grant the bonus
   * on each threshold crossing.
   *
   * Progress accrues even when the member is not eligible for a grant — losing
   * a member's progress because of a transient welfare flag would be punitive
   * and unrecoverable. Only the *bonus* is gated; the bar keeps filling.
   */
  async recordProgress(input: RecordProgressInput): Promise<ProgressBarView[]> {
    if (!Number.isFinite(input.units) || input.units <= 0) {
      throw new BadRequestException('units must be a positive number');
    }

    const campaigns = await this.findLiveCampaigns(input.tenantId, 'PROGRESS_BONUS');
    const views: ProgressBarView[] = [];

    for (const campaign of campaigns) {
      const terms = campaign.progress_terms!;

      const progress = await this.bumpProgress(
        input.tenantId,
        campaign.campaign_id,
        input.memberId,
        input.units,
      );

      // Completions available: how many whole thresholds the accumulated
      // progress now covers, bounded by repeatability.
      let crossings = Math.floor(progress.progress_units / terms.threshold);
      if (!terms.repeatable) {
        crossings = Math.min(crossings, Math.max(0, 1 - progress.completions));
      }

      if (crossings > 0) {
        const decision = await this.eligibility.evaluate({
          tenantId: input.tenantId,
          memberId: input.memberId,
          movement: 'GRANT',
          pointsAtStake: terms.bonus_points * crossings,
          transactionRef: input.sourceReference,
          merchantId: input.merchantId,
        });

        if (decision.allowed) {
          for (let i = 0; i < crossings; i++) {
            const completionIndex = progress.completions + i;
            const granted = await this.grantBonus({
              campaign,
              memberId: input.memberId,
              tenantId: input.tenantId,
              kind: 'PROGRESS_BONUS',
              requestedPoints: terms.bonus_points,
              basePoints: null,
              multiplier: null,
              sourceReference: input.sourceReference,
              spendCents: input.spendCents,
              // Keyed on the completion index, not the request: the bar's Nth
              // completion is granted exactly once regardless of which
              // purchase happened to tip it over.
              idempotencyKey: `promo-prog-${campaign.campaign_id}-${input.memberId}-${completionIndex}`,
              reasonCode: TransactionReason.PROMOTION_PROGRESS_BONUS,
            });

            if (granted.points > 0) {
              await this.settleCompletion(
                input.tenantId,
                campaign.campaign_id,
                input.memberId,
                terms.threshold,
                granted.points,
              );
            }
          }
        } else {
          this.logger.log(
            { campaignId: campaign.campaign_id, reason: decision.reasonCode },
            'Progress bonus withheld by eligibility; progress retained',
          );
        }
      }

      const current = await this.readProgress(input.tenantId, campaign.campaign_id, input.memberId);
      views.push(toProgressBarView(campaign, current));
    }

    return views;
  }

  /** Member-facing progress bars for every live PROGRESS_BONUS campaign. */
  async getProgressBars(tenantId: string, memberId: string): Promise<ProgressBarView[]> {
    const campaigns = await this.findLiveCampaigns(tenantId, 'PROGRESS_BONUS');
    const views: ProgressBarView[] = [];

    for (const campaign of campaigns) {
      const progress = await this.readProgress(tenantId, campaign.campaign_id, memberId);
      views.push(toProgressBarView(campaign, progress));
    }
    return views;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Timed redemption offers (the burn side)
  // ───────────────────────────────────────────────────────────────────────────

  /** Live redemption offers, with this member's remaining claim allowance. */
  async listOffers(tenantId: string, memberId: string): Promise<OfferView[]> {
    const campaigns = await this.findLiveCampaigns(tenantId, 'REDEMPTION_OFFER');
    const views: OfferView[] = [];

    for (const campaign of campaigns) {
      const terms = campaign.offer_terms!;
      const claimed = await PromotionOfferClaimModel.countDocuments({
        tenant_id: { $eq: tenantId },
        campaign_id: { $eq: campaign.campaign_id },
        member_id: { $eq: memberId },
        status: { $ne: 'RESERVED' },
      }).exec();

      views.push({
        campaignId: campaign.campaign_id,
        name: campaign.name,
        description: campaign.description,
        pointsPrice: terms.points_price,
        rewardType: terms.reward_type,
        rewardValue: terms.reward_value,
        endsAt: campaign.ends_at,
        remainingInventory:
          terms.inventory_count === null
            ? null
            : Math.max(0, terms.inventory_count - campaign.offer_claims_to_date),
        claimsRemainingForMember: Math.max(0, terms.max_per_member - claimed),
      });
    }
    return views;
  }

  /**
   * Burn points against a timed redemption offer.
   *
   * This is the half of the system that reduces liability, so it is deliberately
   * the easiest path to succeed on: it is permitted at welfare SOFT_DECLINE and
   * requires no margin evidence. It still fails closed on age verification.
   */
  async claimOffer(
    tenantId: string,
    memberId: string,
    campaignId: string,
    idempotencyKey: string,
  ): Promise<ClaimOfferResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('idempotencyKey is required');
    }

    const campaign = await PromotionCampaignModel.findOne({
      tenant_id: { $eq: tenantId },
      campaign_id: { $eq: campaignId },
      campaign_type: { $eq: 'REDEMPTION_OFFER' },
    }).exec();

    if (!campaign) {
      throw new NotFoundException(`Redemption offer ${campaignId} not found`);
    }
    if (!isLive(campaign)) {
      throw new BadRequestException('This offer is not currently available');
    }

    const terms = campaign.offer_terms!;

    // Replay: an existing non-RESERVED claim under this key returns as-is.
    const existing = await PromotionOfferClaimModel.findOne({
      tenant_id: { $eq: tenantId },
      idempotency_key: { $eq: idempotencyKey },
    }).exec();

    if (existing) {
      if (existing.campaign_id !== campaignId) {
        throw new BadRequestException('Idempotency key already used for a different offer');
      }
      if (existing.status === 'RESERVED') {
        throw new ConflictException('Claim in progress — please retry shortly');
      }
      return toClaimResult(existing);
    }

    const claimedByMember = await PromotionOfferClaimModel.countDocuments({
      tenant_id: { $eq: tenantId },
      campaign_id: { $eq: campaignId },
      member_id: { $eq: memberId },
      status: { $ne: 'RESERVED' },
    }).exec();

    if (claimedByMember >= terms.max_per_member) {
      throw new BadRequestException(
        `You have already claimed this offer the maximum ${terms.max_per_member} time(s)`,
      );
    }

    const decision = await this.eligibility.evaluate({
      tenantId,
      memberId,
      movement: 'BURN',
      pointsAtStake: terms.points_price,
      transactionRef: `offer-${campaignId}`,
    });

    if (!decision.allowed) {
      throw new ForbiddenException(decision.explanation);
    }

    // Claim inventory atomically before taking any points. Ordering this after
    // the debit would leave a member paying for an offer that had just run out.
    if (terms.inventory_count !== null && terms.inventory_count !== undefined) {
      const reserved = await PromotionCampaignModel.findOneAndUpdate(
        {
          tenant_id: { $eq: tenantId },
          campaign_id: { $eq: campaignId },
          offer_claims_to_date: { $lt: terms.inventory_count },
        },
        { $inc: { offer_claims_to_date: 1 } },
        { new: true },
      ).exec();

      if (!reserved) {
        throw new BadRequestException('This offer is fully claimed');
      }
    } else {
      await PromotionCampaignModel.findOneAndUpdate(
        { tenant_id: { $eq: tenantId }, campaign_id: { $eq: campaignId } },
        { $inc: { offer_claims_to_date: 1 } },
      ).exec();
    }

    const claimId = randomUUID();
    const correlationId = randomUUID();
    const claimCode = buildClaimCode(tenantId);

    try {
      await PromotionOfferClaimModel.create({
        claim_id: claimId,
        tenant_id: tenantId,
        campaign_id: campaignId,
        member_id: memberId,
        campaign_name: campaign.name,
        points_burned: terms.points_price,
        reward_type: terms.reward_type,
        reward_value: terms.reward_value,
        claim_code: claimCode,
        status: 'RESERVED',
        idempotency_key: idempotencyKey,
        correlation_id: correlationId,
      });
    } catch (error: unknown) {
      await this.releaseOfferInventory(tenantId, campaignId);
      if ((error as { code?: number }).code === 11000) {
        const winner = await PromotionOfferClaimModel.findOne({
          tenant_id: { $eq: tenantId },
          idempotency_key: { $eq: idempotencyKey },
        }).exec();
        if (winner && winner.status !== 'RESERVED') {
          return toClaimResult(winner);
        }
        throw new ConflictException('Claim in progress — please retry shortly');
      }
      throw error;
    }

    try {
      await this.ledger.deductPoints(
        memberId,
        terms.points_price,
        `PROMO_OFFER:${campaignId}`,
        `Redemption offer: ${campaign.name}`,
        `promo-offer-${campaignId}-${idempotencyKey}`,
        undefined,
        TransactionReason.PROMOTION_OFFER_REDEMPTION,
      );
    } catch (error) {
      // Debit failed (almost always insufficient balance). Undo the reservation
      // completely so the member can retry and the inventory is not consumed.
      await PromotionOfferClaimModel.deleteOne({
        tenant_id: { $eq: tenantId },
        claim_id: { $eq: claimId },
      }).exec();
      await this.releaseOfferInventory(tenantId, campaignId);
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }

    await PromotionOfferClaimModel.findOneAndUpdate(
      { tenant_id: { $eq: tenantId }, claim_id: { $eq: claimId } },
      { $set: { status: 'CLAIMED' } },
    ).exec();

    await PromotionCampaignModel.findOneAndUpdate(
      { tenant_id: { $eq: tenantId }, campaign_id: { $eq: campaignId } },
      { $inc: { points_burned_to_date: terms.points_price } },
    ).exec();

    this.logger.log(
      { campaignId, claimId, pointsBurned: terms.points_price },
      'Redemption offer claimed — liability burned',
    );

    return {
      claimId,
      claimCode,
      campaignId,
      campaignName: campaign.name,
      pointsBurned: terms.points_price,
      rewardType: terms.reward_type,
      rewardValue: terms.reward_value,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  /** Campaigns that are ACTIVE and inside their window right now. */
  private async findLiveCampaigns(
    tenantId: string,
    type: IPromotionCampaign['campaign_type'],
  ): Promise<IPromotionCampaign[]> {
    const now = new Date();
    const rows = await PromotionCampaignModel.find({
      tenant_id: { $eq: tenantId },
      campaign_type: { $eq: type },
      status: { $eq: 'ACTIVE' },
      starts_at: { $lte: now },
      $or: [{ ends_at: null }, { ends_at: { $gte: now } }],
    })
      .sort({ starts_at: -1 })
      .exec();

    return rows;
  }

  /**
   * How many more points this campaign may grant this member, and which limit
   * binds first. Used for previews and as the pre-check before a grant.
   */
  private async remainingHeadroom(
    campaign: IPromotionCampaign,
    memberId: string,
    tenantId: string,
  ): Promise<{ allowed: number; limitedBy: 'PER_MEMBER' | 'CAMPAIGN_BUDGET' }> {
    const memberRows = await PromotionGrantModel.aggregate<{ total: number }>([
      {
        $match: {
          tenant_id: tenantId,
          campaign_id: campaign.campaign_id,
          member_id: memberId,
          status: 'GRANTED',
        },
      },
      { $group: { _id: null, total: { $sum: '$bonus_points' } } },
    ]);

    const memberGranted = memberRows.length > 0 ? memberRows[0].total : 0;
    const memberHeadroom =
      campaign.per_member_points_cap === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, campaign.per_member_points_cap - memberGranted);

    const budgetHeadroom =
      campaign.campaign_points_budget === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, campaign.campaign_points_budget - campaign.points_granted_to_date);

    return memberHeadroom <= budgetHeadroom
      ? { allowed: memberHeadroom, limitedBy: 'PER_MEMBER' }
      : { allowed: budgetHeadroom, limitedBy: 'CAMPAIGN_BUDGET' };
  }

  /**
   * Grant a capped bonus: reserve the grant row, reserve budget atomically,
   * credit the ledger, promote to GRANTED. Returns the points actually granted,
   * which may be less than requested (cap) or zero (no headroom / replay).
   */
  private async grantBonus(args: {
    campaign: IPromotionCampaign;
    tenantId: string;
    memberId: string;
    kind: PromotionGrantKind;
    requestedPoints: number;
    basePoints: number | null;
    multiplier: number | null;
    sourceReference: string;
    spendCents?: number;
    idempotencyKey: string;
    reasonCode: TransactionReason;
  }): Promise<{ points: number; capApplied: 'NONE' | 'PER_MEMBER' | 'CAMPAIGN_BUDGET' }> {
    const { campaign, tenantId, memberId } = args;

    // Replay check first: a completed grant under this key must not re-credit.
    const existing = await PromotionGrantModel.findOne({
      tenant_id: { $eq: tenantId },
      idempotency_key: { $eq: args.idempotencyKey },
    }).exec();

    if (existing) {
      if (existing.status === 'RESERVED') {
        throw new ConflictException('Bonus grant in progress — please retry shortly');
      }
      return { points: 0, capApplied: 'NONE' };
    }

    const headroom = await this.remainingHeadroom(campaign, memberId, tenantId);
    const points = Math.min(args.requestedPoints, headroom.allowed);
    const capApplied = points < args.requestedPoints ? headroom.limitedBy : 'NONE';

    if (points <= 0) {
      this.logger.log(
        { campaignId: campaign.campaign_id, limitedBy: headroom.limitedBy },
        'Bonus withheld — cap or budget exhausted',
      );
      return { points: 0, capApplied: headroom.limitedBy };
    }

    const grantId = randomUUID();
    const correlationId = randomUUID();

    try {
      await PromotionGrantModel.create({
        grant_id: grantId,
        tenant_id: tenantId,
        campaign_id: campaign.campaign_id,
        member_id: memberId,
        grant_kind: args.kind,
        bonus_points: points,
        base_points: args.basePoints,
        multiplier_applied: args.multiplier,
        source_reference: args.sourceReference,
        attributed_spend_cents: args.spendCents ?? null,
        status: 'RESERVED',
        idempotency_key: args.idempotencyKey,
        correlation_id: correlationId,
      });
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 11000) {
        // A concurrent request won the key. It owns the credit; we grant nothing.
        return { points: 0, capApplied: 'NONE' };
      }
      throw error;
    }

    // Reserve budget atomically. The conditional guard is what stops two
    // concurrent grants from jointly overshooting the campaign budget — the
    // headroom read above is advisory, this is authoritative.
    if (campaign.campaign_points_budget !== null) {
      const reserved = await PromotionCampaignModel.findOneAndUpdate(
        {
          tenant_id: { $eq: tenantId },
          campaign_id: { $eq: campaign.campaign_id },
          $expr: {
            $lte: [{ $add: ['$points_granted_to_date', points] }, '$campaign_points_budget'],
          },
        },
        { $inc: { points_granted_to_date: points } },
        { new: true },
      ).exec();

      if (!reserved) {
        await PromotionGrantModel.deleteOne({
          tenant_id: { $eq: tenantId },
          grant_id: { $eq: grantId },
        }).exec();
        return { points: 0, capApplied: 'CAMPAIGN_BUDGET' };
      }
    } else {
      await PromotionCampaignModel.findOneAndUpdate(
        { tenant_id: { $eq: tenantId }, campaign_id: { $eq: campaign.campaign_id } },
        { $inc: { points_granted_to_date: points } },
      ).exec();
    }

    try {
      await this.ledger.creditPoints(
        memberId,
        points,
        `PROMO:${campaign.campaign_id}`,
        `${campaign.name} (${args.kind})`,
        args.idempotencyKey,
        undefined,
        args.reasonCode,
      );
    } catch (error) {
      // Roll the reservation back so a retry is clean and the budget is not
      // silently consumed by a credit that never landed.
      await PromotionGrantModel.deleteOne({
        tenant_id: { $eq: tenantId },
        grant_id: { $eq: grantId },
      }).exec();
      await PromotionCampaignModel.findOneAndUpdate(
        { tenant_id: { $eq: tenantId }, campaign_id: { $eq: campaign.campaign_id } },
        { $inc: { points_granted_to_date: -points } },
      ).exec();
      throw error;
    }

    await PromotionGrantModel.findOneAndUpdate(
      { tenant_id: { $eq: tenantId }, grant_id: { $eq: grantId } },
      { $set: { status: 'GRANTED' } },
    ).exec();

    this.logger.log(
      {
        campaignId: campaign.campaign_id,
        grantId,
        points,
        kind: args.kind,
        multiplier: args.multiplier,
      },
      'Promotion bonus granted',
    );

    return { points, capApplied };
  }

  /** Add progress units with optimistic-lock retry (charter §3.2.9). */
  private async bumpProgress(
    tenantId: string,
    campaignId: string,
    memberId: string,
    units: number,
    attempt = 0,
  ): Promise<{ progress_units: number; completions: number }> {
    const updated = await PromotionProgressModel.findOneAndUpdate(
      {
        tenant_id: { $eq: tenantId },
        campaign_id: { $eq: campaignId },
        member_id: { $eq: memberId },
      },
      {
        $inc: { progress_units: units, lifetime_units: units, version: 1 },
        $setOnInsert: {
          progress_id: randomUUID(),
          tenant_id: tenantId,
          campaign_id: campaignId,
          member_id: memberId,
          completions: 0,
          bonus_points_earned: 0,
          correlation_id: randomUUID(),
        },
      },
      { new: true, upsert: true },
    ).exec();

    if (!updated) {
      if (attempt >= MAX_PROGRESS_RETRIES) {
        throw new ConflictException('PROGRESS_CONTENTION: could not record progress, please retry');
      }
      return this.bumpProgress(tenantId, campaignId, memberId, units, attempt + 1);
    }

    return { progress_units: updated.progress_units, completions: updated.completions };
  }

  /**
   * Consume one threshold's worth of progress and record the completion. The
   * conditional `progress_units >= threshold` makes a double-settle impossible
   * even if two crossings are processed concurrently.
   */
  private async settleCompletion(
    tenantId: string,
    campaignId: string,
    memberId: string,
    threshold: number,
    bonusPoints: number,
  ): Promise<void> {
    await PromotionProgressModel.findOneAndUpdate(
      {
        tenant_id: { $eq: tenantId },
        campaign_id: { $eq: campaignId },
        member_id: { $eq: memberId },
        progress_units: { $gte: threshold },
      },
      {
        $inc: {
          progress_units: -threshold,
          completions: 1,
          bonus_points_earned: bonusPoints,
          version: 1,
        },
      },
    ).exec();
  }

  private async readProgress(
    tenantId: string,
    campaignId: string,
    memberId: string,
  ): Promise<{ progress_units: number; completions: number; bonus_points_earned: number }> {
    const row = await PromotionProgressModel.findOne({
      tenant_id: { $eq: tenantId },
      campaign_id: { $eq: campaignId },
      member_id: { $eq: memberId },
    })
      .lean()
      .exec();

    return {
      progress_units: row?.progress_units ?? 0,
      completions: row?.completions ?? 0,
      bonus_points_earned: row?.bonus_points_earned ?? 0,
    };
  }

  /** Give back a reserved offer slot when the claim did not complete. */
  private async releaseOfferInventory(tenantId: string, campaignId: string): Promise<void> {
    await PromotionCampaignModel.findOneAndUpdate(
      {
        tenant_id: { $eq: tenantId },
        campaign_id: { $eq: campaignId },
        offer_claims_to_date: { $gt: 0 },
      },
      { $inc: { offer_claims_to_date: -1 } },
    ).exec();
  }
}

/** True when a campaign is ACTIVE and the current instant is inside its window. */
export function isLive(campaign: IPromotionCampaign, now: Date = new Date()): boolean {
  if (campaign.status !== 'ACTIVE') return false;
  if (campaign.starts_at > now) return false;
  if (campaign.ends_at && campaign.ends_at < now) return false;
  return true;
}

function toProgressBarView(
  campaign: IPromotionCampaign,
  progress: { progress_units: number; completions: number },
): ProgressBarView {
  const terms = campaign.progress_terms!;
  const ratio = terms.threshold > 0 ? progress.progress_units / terms.threshold : 0;

  return {
    campaignId: campaign.campaign_id,
    campaignName: campaign.name,
    description: campaign.description,
    metric: terms.metric,
    threshold: terms.threshold,
    progressUnits: progress.progress_units,
    progressRatio: Math.max(0, Math.min(1, ratio)),
    unitsRemaining: Math.max(0, terms.threshold - progress.progress_units),
    bonusPoints: terms.bonus_points,
    completions: progress.completions,
    repeatable: terms.repeatable,
    endsAt: campaign.ends_at,
  };
}

function toClaimResult(claim: {
  claim_id: string;
  claim_code: string;
  campaign_id: string;
  campaign_name: string;
  points_burned: number;
  reward_type: string;
  reward_value: Record<string, unknown>;
}): ClaimOfferResult {
  return {
    claimId: claim.claim_id,
    claimCode: claim.claim_code,
    campaignId: claim.campaign_id,
    campaignName: claim.campaign_name,
    pointsBurned: claim.points_burned,
    rewardType: claim.reward_type,
    rewardValue: claim.reward_value,
  };
}

function buildClaimCode(tenantId: string): string {
  const prefix =
    tenantId
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4) || 'RRR';
  return `RRR-${prefix}-${randomUUID().replace(/-/g, '').toUpperCase().slice(0, 12)}`;
}
