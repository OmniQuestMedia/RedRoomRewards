/**
 * Member Contribution Service
 *
 * Answers one question from real history: **has this member's spend actually
 * paid for the points we have given them?**
 *
 * That question gates every multiplier uplift in the promotions layer, so the
 * way it fails matters more than the way it succeeds. It fails to `UNPROVEN`,
 * never to a flattering guess.
 *
 * ── Sources (both real, both already in the system) ─────────────────────────
 *   Purchase history  — CREDIT ledger entries on the member's `available`
 *     balance that carry an attributable spend amount in
 *     `metadata.spend_cents`. The promotions layer stamps this on every
 *     purchase it observes, and the WooCommerce / ingest earn paths carry it
 *     where the merchant sent it.
 *   Redemption history — DEBIT ledger entries: points the member has actually
 *     burned. Burns are tracked because they tell us how much of the issued
 *     liability has been realised versus how much is still outstanding.
 *
 * ── Why unattributed spend is not zero ──────────────────────────────────────
 * A credit with no `spend_cents` is a purchase whose value we cannot see, not a
 * purchase worth nothing. Treating it as zero would understate margin and
 * mis-band a good member; treating it as an average would invent evidence. So
 * we count it separately as `unattributed_credits` and, when it dominates, the
 * member is `UNPROVEN` — they keep the campaign's base multiplier and receive
 * no uplift. An uplift is only ever paid out of margin we can actually show.
 *
 * ── The margin arithmetic ───────────────────────────────────────────────────
 *   gross_margin_cents = attributed_spend_cents × contribution_margin_bps/10000
 *   points_cost_cents  = points_granted_lifetime × cents_per_point
 *   net_contribution   = gross_margin_cents − points_cost_cents
 *
 * `points_cost_cents` uses points *granted*, not points outstanding: the cost
 * of a loyalty programme is incurred when a point is issued, not when it is
 * redeemed. Redemption realises a cost that already existed. Costing only
 * outstanding points would make a member look more profitable simply for having
 * spent their points, which is precisely backwards.
 *
 * No breakage assumption is applied. Assuming breakage would let expected
 * forfeiture fund a real uplift, which is how loyalty programmes end up
 * structurally short.
 *
 * @module promotions/member-contribution.service
 */

import { Injectable, Logger } from '@nestjs/common';
import { LedgerEntryModel } from '../db/models/ledger-entry.model';
import { ValuationConfigModel } from '../db/models/valuation-config.model';
import { ContributionBand } from '../db/models/promotion-campaign.model';
import { TransactionType, TransactionReason } from '../wallets/types';

/**
 * Credit reasons that return a member's own points rather than issuing new
 * ones. They must not be counted as points cost — the cost was booked when the
 * points were first granted, and counting the return as well double-charges the
 * member's profile and pushes good members into NET_NEGATIVE.
 */
const NON_ISSUING_CREDIT_REASONS: string[] = [
  TransactionReason.PERFORMANCE_ABANDONED,
  TransactionReason.USER_DISCONNECTED,
  TransactionReason.MODEL_INITIATED_REFUND,
  TransactionReason.ROPE_DROP_TIMEOUT,
  TransactionReason.ADMIN_REFUND,
  TransactionReason.MERCHANT_ORDER_REDEMPTION_VOID,
  TransactionReason.PROMOTION_OFFER_REVERSAL,
];

/**
 * Issuances that generate **no additional spend by construction** — a bonus, a
 * signup gift, an operator credit. They are real points cost, so they count in
 * full toward `points_cost_cents`, but they must not be scored as *missing
 * evidence*: there is no purchase behind them to attribute, and treating them
 * as an attribution gap would push a member toward UNPROVEN precisely because
 * we rewarded them. Coverage is therefore measured only over purchase-shaped
 * credits.
 *
 * This is also the correct economics for the uplift decision. A bonus adds
 * points cost and zero margin, so a member only reaches NET_POSITIVE if their
 * real spend covers both their base points and every bonus they have received.
 *
 * Only *unambiguous* zero-spend reasons are listed. `PROMOTIONAL_AWARD` and
 * `ADMIN_CREDIT` are deliberately absent: they are the generic defaults on
 * `LedgerService.creditPoints`/`deductPoints`, so a real purchase earn can carry
 * them. Treating them as zero-spend would discard genuine spend evidence and
 * silently under-band good members. Left off this list, an ambiguous credit with
 * no spend metadata counts as an evidence gap instead — which lowers coverage
 * and holds the member at base multiplier. That is the safe direction to be
 * wrong in.
 *
 * Note this list is only consulted when the entry has **no** attributable spend.
 * An entry that carries `spend_cents` is always attributed, whatever its reason.
 */
const ZERO_SPEND_ISSUING_REASONS: string[] = [
  TransactionReason.USER_SIGNUP_BONUS,
  TransactionReason.REFERRAL_BONUS,
  TransactionReason.MODEL_GIFT,
  TransactionReason.PROMOTION_MULTIPLIER_BONUS,
  TransactionReason.PROMOTION_PROGRESS_BONUS,
];

/** Default contribution margin, in basis points, when no merchant override. */
const DEFAULT_CONTRIBUTION_MARGIN_BPS = Number(
  process.env.RRR_CONTRIBUTION_MARGIN_BPS ?? 3_500, // 35%
);

/** Default point valuation used only when no ValuationConfig row exists. */
const DEFAULT_CENTS_PER_POINT = Number(process.env.RRR_DEFAULT_CENTS_PER_POINT ?? 1);

/**
 * Minimum attributable evidence before a member can be banded at all. Below
 * either threshold the member is UNPROVEN regardless of how good the ratio
 * looks — a single large purchase is not a spending history.
 */
const MIN_ATTRIBUTED_PURCHASES = Number(process.env.RRR_MIN_ATTRIBUTED_PURCHASES ?? 3);
const MIN_ATTRIBUTED_SPEND_CENTS = Number(process.env.RRR_MIN_ATTRIBUTED_SPEND_CENTS ?? 5_000);

/**
 * Share of a member's issuing credits that must carry attributable spend before
 * the computed margin is considered representative. At 0.6, a member whose
 * points mostly arrived from unattributed sources stays UNPROVEN.
 */
const MIN_ATTRIBUTION_COVERAGE = Number(process.env.RRR_MIN_ATTRIBUTION_COVERAGE ?? 0.6);

/** Net-contribution ratio at or above which a member reaches HIGH_MARGIN. */
const HIGH_MARGIN_RATIO = Number(process.env.RRR_HIGH_MARGIN_RATIO ?? 2.0);

export interface MemberContributionProfile {
  member_id: string;
  tenant_id: string;

  /** Spend we can actually attribute, in cents. */
  attributed_spend_cents: number;
  /** How many credits carried an attributable spend amount. */
  attributed_purchase_count: number;
  /** Purchase-shaped credits with no attributable spend — evidence we lack. */
  unattributed_credit_count: number;
  /** Bonus/gift issuances: real cost, no purchase behind them, no evidence gap. */
  bonus_issuance_count: number;
  /** Fraction of purchase-shaped credits carrying spend attribution, 0..1. */
  attribution_coverage: number;

  /** Lifetime points issued to this member (excludes returns of their own). */
  points_granted_lifetime: number;
  /** Lifetime points this member has burned. */
  points_burned_lifetime: number;
  /** Points issued but not yet burned — the outstanding liability they hold. */
  points_outstanding: number;

  cents_per_point: number;
  contribution_margin_bps: number;

  gross_margin_cents: number;
  points_cost_cents: number;
  net_contribution_cents: number;
  /** net_contribution / points_cost. Null when points cost is zero. */
  net_contribution_ratio: number | null;

  band: ContributionBand;
  /** Plain-language justification, safe to log and to show an operator. */
  band_reason: string;
  computed_at: Date;
}

@Injectable()
export class MemberContributionService {
  private readonly logger = new Logger(MemberContributionService.name);

  /**
   * Build a member's contribution profile from ledger history.
   *
   * Reads are tenant-scoped and contain no PII: the profile is keyed on the
   * opaque member id and every figure is an aggregate.
   */
  async getProfile(
    tenantId: string,
    memberId: string,
    merchantId?: string,
  ): Promise<MemberContributionProfile> {
    const centsPerPoint = await this.resolveCentsPerPoint(tenantId, merchantId);
    const marginBps = DEFAULT_CONTRIBUTION_MARGIN_BPS;

    const entries = await LedgerEntryModel.find({
      tenant_id: { $eq: tenantId },
      accountId: { $eq: memberId },
      accountType: { $eq: 'user' },
      balanceState: { $eq: 'available' },
    })
      .select('type amount reason metadata')
      .lean()
      .exec();

    let attributedSpendCents = 0;
    let attributedPurchaseCount = 0;
    let unattributedCreditCount = 0;
    let bonusIssuanceCount = 0;
    let pointsGranted = 0;
    let pointsBurned = 0;

    for (const entry of entries) {
      const reason = String(entry.reason);

      if (entry.type === TransactionType.CREDIT) {
        if (NON_ISSUING_CREDIT_REASONS.includes(reason)) {
          // A return of the member's own points. Neither an issuance nor spend.
          continue;
        }

        // Every issuance costs the programme, whatever produced it.
        pointsGranted += entry.amount;

        // Spend evidence wins over the reason code. A credit that carries an
        // attributable amount is attributed even if its reason is generic —
        // the metadata is the stronger signal.
        const spendCents = readSpendCents(entry.metadata);
        if (spendCents !== null) {
          attributedSpendCents += spendCents;
          attributedPurchaseCount += 1;
        } else if (ZERO_SPEND_ISSUING_REASONS.includes(reason)) {
          // Cost without spend, and without an evidence gap — see the constant.
          bonusIssuanceCount += 1;
        } else {
          unattributedCreditCount += 1;
        }
      } else {
        // Debits are stored with a negative amount; burns are their magnitude.
        pointsBurned += Math.abs(entry.amount);
      }
    }

    // Coverage is measured over purchase-shaped credits only. Bonus issuances
    // are excluded from the denominator because there is no purchase to attribute.
    const purchaseShapedCredits = attributedPurchaseCount + unattributedCreditCount;
    const attributionCoverage =
      purchaseShapedCredits === 0 ? 0 : attributedPurchaseCount / purchaseShapedCredits;

    const grossMarginCents = Math.round((attributedSpendCents * marginBps) / 10_000);
    const pointsCostCents = Math.round(pointsGranted * centsPerPoint);
    const netContributionCents = grossMarginCents - pointsCostCents;
    const netContributionRatio =
      pointsCostCents > 0 ? netContributionCents / pointsCostCents : null;

    const { band, band_reason } = this.classify({
      attributedPurchaseCount,
      attributedSpendCents,
      attributionCoverage,
      pointsCostCents,
      netContributionCents,
      netContributionRatio,
    });

    return {
      member_id: memberId,
      tenant_id: tenantId,
      attributed_spend_cents: attributedSpendCents,
      attributed_purchase_count: attributedPurchaseCount,
      unattributed_credit_count: unattributedCreditCount,
      bonus_issuance_count: bonusIssuanceCount,
      attribution_coverage: Number(attributionCoverage.toFixed(4)),
      points_granted_lifetime: pointsGranted,
      points_burned_lifetime: pointsBurned,
      points_outstanding: pointsGranted - pointsBurned,
      cents_per_point: centsPerPoint,
      contribution_margin_bps: marginBps,
      gross_margin_cents: grossMarginCents,
      points_cost_cents: pointsCostCents,
      net_contribution_cents: netContributionCents,
      net_contribution_ratio:
        netContributionRatio === null ? null : Number(netContributionRatio.toFixed(4)),
      band,
      band_reason,
      computed_at: new Date(),
    };
  }

  /**
   * Map the evidence onto a band. Every path that lacks evidence returns
   * UNPROVEN, and UNPROVEN never receives an uplift — so an unreachable
   * valuation config or a member with no history degrades to "base multiplier",
   * which is exactly the advertised offer and costs the programme nothing extra.
   */
  private classify(input: {
    attributedPurchaseCount: number;
    attributedSpendCents: number;
    attributionCoverage: number;
    pointsCostCents: number;
    netContributionCents: number;
    netContributionRatio: number | null;
  }): { band: ContributionBand; band_reason: string } {
    if (input.attributedPurchaseCount < MIN_ATTRIBUTED_PURCHASES) {
      return {
        band: 'UNPROVEN',
        band_reason: `Only ${input.attributedPurchaseCount} attributable purchase(s); ${MIN_ATTRIBUTED_PURCHASES} required to establish a history.`,
      };
    }

    if (input.attributedSpendCents < MIN_ATTRIBUTED_SPEND_CENTS) {
      return {
        band: 'UNPROVEN',
        band_reason: `Attributable spend ${input.attributedSpendCents}c is below the ${MIN_ATTRIBUTED_SPEND_CENTS}c evidence floor.`,
      };
    }

    if (input.attributionCoverage < MIN_ATTRIBUTION_COVERAGE) {
      return {
        band: 'UNPROVEN',
        band_reason: `Only ${(input.attributionCoverage * 100).toFixed(0)}% of issued points have attributable spend; ${(MIN_ATTRIBUTION_COVERAGE * 100).toFixed(0)}% required. Margin cannot be shown.`,
      };
    }

    if (input.pointsCostCents === 0) {
      // Spend history exists but no points were ever issued: nothing has been
      // paid for yet, so there is no proven uplift to grant.
      return {
        band: 'UNPROVEN',
        band_reason: 'No points issued yet — no points cost against which to prove contribution.',
      };
    }

    if (input.netContributionCents <= 0) {
      return {
        band: 'NET_NEGATIVE',
        band_reason: `Gross margin does not cover points cost (net ${input.netContributionCents}c). Base multiplier only.`,
      };
    }

    const ratio = input.netContributionRatio ?? 0;
    if (ratio >= HIGH_MARGIN_RATIO) {
      return {
        band: 'HIGH_MARGIN',
        band_reason: `Net contribution is ${ratio.toFixed(2)}× points cost (threshold ${HIGH_MARGIN_RATIO}×).`,
      };
    }

    return {
      band: 'NET_POSITIVE',
      band_reason: `Net contribution ${input.netContributionCents}c covers points cost at ${ratio.toFixed(2)}×.`,
    };
  }

  /**
   * Resolve cents-per-point from the active ValuationConfig. Falls back to the
   * configured default when no row exists — and a *higher* assumed cost is the
   * safe direction to fail, because it makes members look less profitable and
   * therefore harder to uplift.
   */
  private async resolveCentsPerPoint(tenantId: string, merchantId?: string): Promise<number> {
    const query: Record<string, unknown> = {
      tenant_id: { $eq: tenantId },
      point_type: { $eq: 'purchase' },
      superseded_at: null,
    };
    if (merchantId) {
      query.merchant_id = { $eq: merchantId };
    }

    const config = await ValuationConfigModel.findOne(query).sort({ effective_at: -1 }).exec();

    if (!config) {
      this.logger.debug(
        { tenantId, merchantId },
        'No active ValuationConfig; using default cents_per_point',
      );
      return DEFAULT_CENTS_PER_POINT;
    }
    return config.cents_per_point;
  }
}

/**
 * Pull an attributable spend amount out of ledger metadata.
 *
 * Accepts the canonical `spend_cents` plus the two shapes the existing earn
 * paths already emit, so historical entries are usable without a backfill.
 * Anything non-finite or negative is treated as absent rather than coerced —
 * a malformed value is missing evidence, not zero spend.
 */
export function readSpendCents(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const meta = metadata as Record<string, unknown>;

  const centsCandidates = ['spend_cents', 'spendCents', 'order_total_cents'];
  for (const key of centsCandidates) {
    const value = meta[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }
  }

  // Major-unit shapes emitted by the WooCommerce / ingest earn paths.
  const majorCandidates = ['spend_amount', 'spendAmount', 'order_total'];
  for (const key of majorCandidates) {
    const value = meta[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.round(value * 100);
    }
  }

  return null;
}
