/**
 * Promotion Liability Service
 *
 * Reports what the promotions layer actually did to the balance sheet. A
 * promotion is only "soft" in the way that matters if someone can show it paid
 * for itself, so this is not an optional reporting nicety — it is how the
 * multiplier ladder gets tuned.
 *
 * Two figures per campaign, from the campaign's own append-only rows:
 *
 *   liability_added_cents   = bonus points granted × cents_per_point
 *   liability_burned_cents  = points burned by its offers × cents_per_point
 *   net_liability_delta     = added − burned
 *
 * and, for granting campaigns, whether the spend it rode on covered that cost:
 *
 *   attributed_margin_cents = attributed spend on granted rows × margin bps
 *   net_contribution_cents  = attributed_margin_cents − liability_added_cents
 *
 * ── What this measures, and what it does not ────────────────────────────────
 * `attributed_spend_cents` on a grant is the spend of the purchase that
 * triggered it — it is **attributed, not incremental**. This report says
 * "campaigns rode on £X of spend and cost £Y of points". It does not claim the
 * spend would not have happened anyway. Proving incrementality needs a holdout
 * group, which this system does not run; presenting attribution as incremental
 * lift is the single most common way loyalty programmes talk themselves into a
 * losing campaign. The field names say `attributed` for that reason.
 *
 * @module promotions/promotion-liability.service
 */

import { Injectable } from '@nestjs/common';
import {
  PromotionCampaignModel,
  IPromotionCampaign,
  PromotionCampaignType,
} from '../db/models/promotion-campaign.model';
import { PromotionGrantModel } from '../db/models/promotion-grant.model';
import { ValuationConfigModel } from '../db/models/valuation-config.model';

const DEFAULT_CONTRIBUTION_MARGIN_BPS = Number(process.env.RRR_CONTRIBUTION_MARGIN_BPS ?? 3_500);
const DEFAULT_CENTS_PER_POINT = Number(process.env.RRR_DEFAULT_CENTS_PER_POINT ?? 1);

export interface CampaignLiabilityRow {
  campaign_id: string;
  name: string;
  campaign_type: PromotionCampaignType;
  status: string;
  starts_at: Date;
  ends_at: Date | null;

  points_granted: number;
  points_burned: number;
  /** Positive = this campaign added liability; negative = it retired liability. */
  net_points_delta: number;

  liability_added_cents: number;
  liability_burned_cents: number;
  net_liability_delta_cents: number;

  /** Spend attributed to grants from this campaign (not proven incremental). */
  attributed_spend_cents: number;
  attributed_margin_cents: number;
  /** attributed_margin − liability_added. Null for pure-burn campaigns. */
  net_contribution_cents: number | null;

  /** Budget consumption, 0..1, or null when the campaign is uncapped. */
  budget_utilisation: number | null;
  /** How many distinct members this campaign has granted to. */
  members_granted: number;
  /** How many grants were uplifted above the campaign's base multiplier. */
  uplifted_grants: number;
}

export interface LiabilityReport {
  tenant_id: string;
  generated_at: Date;
  cents_per_point: number;
  contribution_margin_bps: number;

  totals: {
    points_granted: number;
    points_burned: number;
    net_points_delta: number;
    liability_added_cents: number;
    liability_burned_cents: number;
    net_liability_delta_cents: number;
    attributed_spend_cents: number;
    attributed_margin_cents: number;
    net_contribution_cents: number;
  };

  campaigns: CampaignLiabilityRow[];
  /** Plain-language read of the totals, safe to surface to an operator. */
  summary: string;
}

@Injectable()
export class PromotionLiabilityService {
  /**
   * Build the liability + contribution report for a tenant.
   *
   * @param tenantId Tenant to report on
   * @param options.includeEnded Include ENDED campaigns (default true — a
   *   finished campaign's cost does not stop being real when it ends)
   */
  async getReport(
    tenantId: string,
    options: { includeEnded?: boolean } = {},
  ): Promise<LiabilityReport> {
    const includeEnded = options.includeEnded ?? true;
    const centsPerPoint = await this.resolveCentsPerPoint(tenantId);
    const marginBps = DEFAULT_CONTRIBUTION_MARGIN_BPS;

    const query: Record<string, unknown> = { tenant_id: { $eq: tenantId } };
    if (!includeEnded) {
      query.status = { $ne: 'ENDED' };
    }

    const campaigns = (await PromotionCampaignModel.find(query)
      .sort({ starts_at: -1 })
      .lean()
      .exec()) as unknown as IPromotionCampaign[];

    const rows: CampaignLiabilityRow[] = [];

    for (const campaign of campaigns) {
      const stats = await this.grantStats(tenantId, campaign.campaign_id);

      const pointsGranted = stats.points;
      const pointsBurned = campaign.points_burned_to_date;

      const liabilityAdded = Math.round(pointsGranted * centsPerPoint);
      const liabilityBurned = Math.round(pointsBurned * centsPerPoint);
      const attributedMargin = Math.round((stats.spendCents * marginBps) / 10_000);

      rows.push({
        campaign_id: campaign.campaign_id,
        name: campaign.name,
        campaign_type: campaign.campaign_type,
        status: campaign.status,
        starts_at: campaign.starts_at,
        ends_at: campaign.ends_at,

        points_granted: pointsGranted,
        points_burned: pointsBurned,
        net_points_delta: pointsGranted - pointsBurned,

        liability_added_cents: liabilityAdded,
        liability_burned_cents: liabilityBurned,
        net_liability_delta_cents: liabilityAdded - liabilityBurned,

        attributed_spend_cents: stats.spendCents,
        attributed_margin_cents: attributedMargin,
        net_contribution_cents:
          campaign.campaign_type === 'REDEMPTION_OFFER' ? null : attributedMargin - liabilityAdded,

        budget_utilisation:
          campaign.campaign_points_budget === null || campaign.campaign_points_budget === 0
            ? null
            : Number((pointsGranted / campaign.campaign_points_budget).toFixed(4)),
        members_granted: stats.memberCount,
        uplifted_grants: stats.upliftedGrants,
      });
    }

    const totals = rows.reduce(
      (acc, r) => ({
        points_granted: acc.points_granted + r.points_granted,
        points_burned: acc.points_burned + r.points_burned,
        net_points_delta: acc.net_points_delta + r.net_points_delta,
        liability_added_cents: acc.liability_added_cents + r.liability_added_cents,
        liability_burned_cents: acc.liability_burned_cents + r.liability_burned_cents,
        net_liability_delta_cents: acc.net_liability_delta_cents + r.net_liability_delta_cents,
        attributed_spend_cents: acc.attributed_spend_cents + r.attributed_spend_cents,
        attributed_margin_cents: acc.attributed_margin_cents + r.attributed_margin_cents,
        net_contribution_cents: acc.net_contribution_cents + (r.net_contribution_cents ?? 0),
      }),
      {
        points_granted: 0,
        points_burned: 0,
        net_points_delta: 0,
        liability_added_cents: 0,
        liability_burned_cents: 0,
        net_liability_delta_cents: 0,
        attributed_spend_cents: 0,
        attributed_margin_cents: 0,
        net_contribution_cents: 0,
      },
    );

    return {
      tenant_id: tenantId,
      generated_at: new Date(),
      cents_per_point: centsPerPoint,
      contribution_margin_bps: marginBps,
      totals,
      campaigns: rows,
      summary: buildSummary(totals),
    };
  }

  /**
   * Aggregate GRANTED rows for a campaign. RESERVED rows are excluded: they
   * represent a grant that did not complete, and counting them would overstate
   * liability by exactly the amount that never reached a member.
   */
  private async grantStats(
    tenantId: string,
    campaignId: string,
  ): Promise<{ points: number; spendCents: number; memberCount: number; upliftedGrants: number }> {
    const rows = await PromotionGrantModel.aggregate<{
      _id: null;
      points: number;
      spendCents: number;
      members: string[];
    }>([
      {
        $match: {
          tenant_id: tenantId,
          campaign_id: campaignId,
          status: 'GRANTED',
        },
      },
      {
        $group: {
          _id: null,
          points: { $sum: '$bonus_points' },
          spendCents: { $sum: { $ifNull: ['$attributed_spend_cents', 0] } },
          members: { $addToSet: '$member_id' },
        },
      },
    ]);

    const agg = rows[0];
    if (!agg) {
      return { points: 0, spendCents: 0, memberCount: 0, upliftedGrants: 0 };
    }

    // An "uplifted" grant is one whose applied multiplier exceeded the
    // campaign's base — the count of times proven contribution actually paid out.
    const campaign = await PromotionCampaignModel.findOne({
      tenant_id: { $eq: tenantId },
      campaign_id: { $eq: campaignId },
    })
      .select('multiplier_terms')
      .lean()
      .exec();

    const baseMultiplier = (campaign as unknown as IPromotionCampaign | null)?.multiplier_terms
      ?.multiplier;

    const upliftedGrants =
      typeof baseMultiplier === 'number'
        ? await PromotionGrantModel.countDocuments({
            tenant_id: { $eq: tenantId },
            campaign_id: { $eq: campaignId },
            status: { $eq: 'GRANTED' },
            multiplier_applied: { $gt: baseMultiplier },
          }).exec()
        : 0;

    return {
      points: agg.points,
      spendCents: agg.spendCents,
      memberCount: agg.members.length,
      upliftedGrants,
    };
  }

  private async resolveCentsPerPoint(tenantId: string): Promise<number> {
    const config = await ValuationConfigModel.findOne({
      tenant_id: { $eq: tenantId },
      point_type: { $eq: 'purchase' },
      superseded_at: null,
    })
      .sort({ effective_at: -1 })
      .exec();

    return config?.cents_per_point ?? DEFAULT_CENTS_PER_POINT;
  }
}

function buildSummary(totals: LiabilityReport['totals']): string {
  const net = totals.net_liability_delta_cents;
  const direction =
    net > 0
      ? `added ${net}c of net point liability`
      : net < 0
        ? `retired ${Math.abs(net)}c of net point liability`
        : 'left net point liability unchanged';

  const contribution =
    totals.net_contribution_cents >= 0
      ? `Attributed margin covers points cost with ${totals.net_contribution_cents}c to spare`
      : `Attributed margin falls ${Math.abs(totals.net_contribution_cents)}c short of points cost`;

  return (
    `Promotions ${direction} (${totals.points_granted} pts granted, ${totals.points_burned} pts burned). ` +
    `${contribution}. Attributed spend is not proven incremental — treat as coverage, not lift.`
  );
}
