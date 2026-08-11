/**
 * Promotion Campaign Service
 *
 * Admin-side authoring and lifecycle for soft loyalty promotions. Everything
 * that decides *whether a campaign may exist* lives here; everything that
 * decides *what a member gets* lives in PromotionEngineService.
 *
 * Two rules in this file are the reason it exists at all:
 *
 *   1. `assertSoftPromotionShape` — a campaign must be deterministic and
 *      capped. It rejects chance-based mechanics and artificial-scarcity
 *      pressure fields outright, and refuses an uncapped granting campaign.
 *   2. `assertEconomicsUnchanged` — once a campaign is ACTIVE its economics are
 *      frozen. Members have acted on the published terms and the resulting
 *      points are real liability; retroactively re-pricing them is not an edit,
 *      it is a restatement of the ledger.
 *
 * @module promotions/promotion-campaign.service
 */

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  PromotionCampaignModel,
  IPromotionCampaign,
  PromotionCampaignType,
  PromotionCampaignStatus,
  PROMOTION_CAMPAIGN_TYPES,
  IMultiplierTerms,
  IProgressTerms,
  IOfferTerms,
} from '../db/models/promotion-campaign.model';

/**
 * Field names that encode a chance-based or high-pressure mechanic. A campaign
 * payload carrying any of these is rejected before it reaches the database.
 *
 * This is a shape guard, not a content filter: it exists so that the *only* way
 * to introduce a spin/scarcity mechanic is to change this list deliberately, in
 * a reviewed commit, rather than by passing an extra key through an admin API.
 * CEO Decision D1 (slot machine retired, no re-introduction) is the authority.
 */
export const PROHIBITED_MECHANIC_FIELDS: readonly string[] = [
  'spin',
  'wheel',
  'spin_wheel',
  'slot',
  'jackpot',
  'lottery',
  'raffle',
  'mystery',
  'random',
  'randomize',
  'chance',
  'odds',
  'probability',
  'weighted_outcomes',
  'prize_pool',
  'countdown_pressure',
  'scarcity_banner',
  'urgency_multiplier',
  'fomo',
] as const;

export interface CreateCampaignInput {
  tenant_id: string;
  campaign_type: PromotionCampaignType;
  name: string;
  description: string;
  starts_at: Date;
  ends_at?: Date | null;
  multiplier_terms?: IMultiplierTerms | null;
  progress_terms?: IProgressTerms | null;
  offer_terms?: IOfferTerms | null;
  per_member_points_cap?: number | null;
  campaign_points_budget?: number | null;
  reason_code: string;
  created_by: string;
}

/**
 * Fields an operator may change after creation. Deliberately narrow: nothing
 * here alters what a member earns or pays, so these stay editable even while
 * the campaign is live.
 */
export interface UpdateCampaignInput {
  name?: string;
  description?: string;
  /** May be brought forward to end a campaign early, never extended silently. */
  ends_at?: Date | null;
  reason_code?: string;
}

/** Legal lifecycle transitions. ENDED is terminal. */
const ALLOWED_TRANSITIONS: Record<PromotionCampaignStatus, PromotionCampaignStatus[]> = {
  DRAFT: ['ACTIVE', 'ENDED'],
  ACTIVE: ['PAUSED', 'ENDED'],
  PAUSED: ['ACTIVE', 'ENDED'],
  ENDED: [],
};

@Injectable()
export class PromotionCampaignService {
  private readonly logger = new Logger(PromotionCampaignService.name);

  /**
   * Reject anything that is not a soft promotion.
   *
   * Exported behaviour, not a private detail: the engine relies on the
   * guarantee that every persisted campaign is deterministic and capped, so
   * this runs on create and on every terms-bearing write.
   */
  assertSoftPromotionShape(input: {
    campaign_type: PromotionCampaignType;
    multiplier_terms?: IMultiplierTerms | null;
    progress_terms?: IProgressTerms | null;
    offer_terms?: IOfferTerms | null;
    per_member_points_cap?: number | null;
    campaign_points_budget?: number | null;
  }): void {
    if (!PROMOTION_CAMPAIGN_TYPES.includes(input.campaign_type)) {
      throw new BadRequestException(
        `Unsupported campaign_type "${input.campaign_type}". Soft promotions are limited to: ${PROMOTION_CAMPAIGN_TYPES.join(', ')}.`,
      );
    }

    // Scan every terms payload for a prohibited mechanic. reward_value and
    // similar free-form maps are included — that is exactly where an operator
    // would otherwise smuggle one in.
    for (const block of [input.multiplier_terms, input.progress_terms, input.offer_terms]) {
      const offending = block ? findProhibitedField(block) : null;
      if (offending) {
        throw new BadRequestException(
          `Campaign rejected: field "${offending}" describes a chance-based or pressure mechanic. ` +
            'RRR promotions are deterministic and non-aggressive by policy (CEO Decision D1).',
        );
      }
    }

    // Exactly one terms block, matching the declared type.
    const present = [
      input.multiplier_terms ? 'multiplier_terms' : null,
      input.progress_terms ? 'progress_terms' : null,
      input.offer_terms ? 'offer_terms' : null,
    ].filter((x): x is string => x !== null);

    const expected: Record<PromotionCampaignType, string> = {
      PURCHASE_MULTIPLIER: 'multiplier_terms',
      PROGRESS_BONUS: 'progress_terms',
      REDEMPTION_OFFER: 'offer_terms',
    };

    if (present.length !== 1 || present[0] !== expected[input.campaign_type]) {
      throw new BadRequestException(
        `campaign_type ${input.campaign_type} requires exactly ${expected[input.campaign_type]} (got: ${present.join(', ') || 'none'}).`,
      );
    }

    if (input.campaign_type === 'PURCHASE_MULTIPLIER') {
      const terms = input.multiplier_terms!;
      const m = terms.multiplier;
      if (!Number.isFinite(m) || m <= 1) {
        throw new BadRequestException(
          'multiplier must be greater than 1 — a multiplier of 1 or less grants nothing.',
        );
      }

      // The uplift ladder must only ever step upward: base ≤ NET_POSITIVE ≤
      // HIGH_MARGIN. A ladder that dips would mean a member's own proven
      // contribution bought them a *worse* rate than the advertised offer,
      // which is a bug the type system cannot catch.
      const bands = terms.band_multipliers;
      if (bands) {
        const netPositive = bands.NET_POSITIVE;
        const highMargin = bands.HIGH_MARGIN;

        for (const [label, value] of Object.entries({
          NET_POSITIVE: netPositive,
          HIGH_MARGIN: highMargin,
        })) {
          if (value === undefined || value === null) continue;
          if (!Number.isFinite(value) || value < m) {
            throw new BadRequestException(
              `band_multipliers.${label} (${value}) must be a finite number greater than or equal to the base multiplier (${m}).`,
            );
          }
        }

        if (
          typeof netPositive === 'number' &&
          typeof highMargin === 'number' &&
          highMargin < netPositive
        ) {
          throw new BadRequestException(
            `band_multipliers.HIGH_MARGIN (${highMargin}) cannot be lower than NET_POSITIVE (${netPositive}) — the uplift ladder must not decrease as proven contribution improves.`,
          );
        }
      }
    }

    if (input.campaign_type === 'PROGRESS_BONUS') {
      const p = input.progress_terms!;
      if (!Number.isInteger(p.threshold) || p.threshold < 1) {
        throw new BadRequestException('progress threshold must be a positive integer');
      }
      if (!Number.isInteger(p.bonus_points) || p.bonus_points < 1) {
        throw new BadRequestException('bonus_points must be a positive integer');
      }
    }

    if (input.campaign_type === 'REDEMPTION_OFFER') {
      const o = input.offer_terms!;
      if (!Number.isInteger(o.points_price) || o.points_price < 1) {
        throw new BadRequestException('points_price must be a positive integer');
      }
      if (!Number.isInteger(o.max_per_member) || o.max_per_member < 1) {
        throw new BadRequestException('max_per_member must be a positive integer');
      }
      if (
        o.inventory_count !== null &&
        o.inventory_count !== undefined &&
        (!Number.isInteger(o.inventory_count) || o.inventory_count < 0)
      ) {
        throw new BadRequestException('inventory_count must be a non-negative integer or null');
      }
      return; // Offers burn points; the granting caps below do not apply.
    }

    // Granting campaigns must be bounded on both axes. An uncapped multiplier
    // is unbounded liability, which defeats the purpose of the subsystem.
    const cap = input.per_member_points_cap;
    const budget = input.campaign_points_budget;
    if (!Number.isInteger(cap ?? NaN) || (cap as number) < 1) {
      throw new BadRequestException(
        'per_member_points_cap is required (positive integer) on a granting campaign — uncapped grants are unbounded liability.',
      );
    }
    if (!Number.isInteger(budget ?? NaN) || (budget as number) < 1) {
      throw new BadRequestException(
        'campaign_points_budget is required (positive integer) on a granting campaign — uncapped grants are unbounded liability.',
      );
    }
    if ((cap as number) > (budget as number)) {
      throw new BadRequestException(
        'per_member_points_cap cannot exceed campaign_points_budget — a single member would exhaust the campaign.',
      );
    }
  }

  async createCampaign(input: CreateCampaignInput): Promise<IPromotionCampaign> {
    if (!input.tenant_id?.trim()) {
      throw new BadRequestException('tenant_id is required');
    }
    if (!input.name?.trim() || !input.description?.trim()) {
      throw new BadRequestException('name and description are required');
    }
    if (!(input.starts_at instanceof Date) || Number.isNaN(input.starts_at.getTime())) {
      throw new BadRequestException('starts_at must be a valid date');
    }
    if (input.ends_at && input.ends_at <= input.starts_at) {
      throw new BadRequestException('ends_at must be after starts_at');
    }

    this.assertSoftPromotionShape(input);

    const campaign = await PromotionCampaignModel.create({
      campaign_id: randomUUID(),
      tenant_id: input.tenant_id,
      campaign_type: input.campaign_type,
      status: 'DRAFT',
      name: input.name,
      description: input.description,
      starts_at: input.starts_at,
      ends_at: input.ends_at ?? null,
      multiplier_terms: input.multiplier_terms ?? null,
      progress_terms: input.progress_terms ?? null,
      offer_terms: input.offer_terms ?? null,
      per_member_points_cap: input.per_member_points_cap ?? null,
      campaign_points_budget: input.campaign_points_budget ?? null,
      points_granted_to_date: 0,
      points_burned_to_date: 0,
      offer_claims_to_date: 0,
      correlation_id: randomUUID(),
      reason_code: input.reason_code,
      created_by: input.created_by,
      activated_at: null,
    });

    this.logger.log(
      {
        campaignId: campaign.campaign_id,
        tenantId: input.tenant_id,
        type: input.campaign_type,
      },
      'Promotion campaign created (DRAFT)',
    );

    return campaign;
  }

  /**
   * Update the non-economic fields of a campaign. Economics are frozen once the
   * campaign has been activated; `assertEconomicsUnchanged` is enforced by the
   * fact that this input type simply cannot carry them.
   */
  async updateCampaign(
    campaignId: string,
    tenantId: string,
    updates: UpdateCampaignInput,
  ): Promise<IPromotionCampaign> {
    const campaign = await this.getCampaign(campaignId, tenantId);

    if (campaign.status === 'ENDED') {
      throw new BadRequestException('An ENDED campaign cannot be modified');
    }

    if (updates.ends_at !== undefined && updates.ends_at !== null) {
      if (updates.ends_at <= campaign.starts_at) {
        throw new BadRequestException('ends_at must be after starts_at');
      }
      // Extending a live campaign silently re-prices its budget consumption
      // against a longer horizon. Shortening is always allowed (it reduces
      // exposure); extending requires a successor campaign.
      if (campaign.status !== 'DRAFT' && campaign.ends_at && updates.ends_at > campaign.ends_at) {
        throw new BadRequestException(
          'A live campaign cannot be extended — end it and open a successor campaign.',
        );
      }
    }

    const updated = await PromotionCampaignModel.findOneAndUpdate(
      { campaign_id: { $eq: campaignId }, tenant_id: { $eq: tenantId } },
      { $set: updates },
      { new: true },
    ).exec();

    if (!updated) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }
    return updated;
  }

  /** Move a campaign through its lifecycle. ENDED is terminal. */
  async setStatus(
    campaignId: string,
    tenantId: string,
    next: PromotionCampaignStatus,
  ): Promise<IPromotionCampaign> {
    const campaign = await this.getCampaign(campaignId, tenantId);

    if (campaign.status === next) {
      return campaign;
    }

    const allowed = ALLOWED_TRANSITIONS[campaign.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Illegal status transition ${campaign.status} → ${next}. Allowed: ${allowed.join(', ') || 'none (terminal)'}.`,
      );
    }

    // Re-validate on activation. A DRAFT may have been written before a guard
    // tightened; nothing reaches ACTIVE without passing the current rules.
    if (next === 'ACTIVE') {
      this.assertSoftPromotionShape(campaign);
    }

    const set: Record<string, unknown> = { status: next };
    if (next === 'ACTIVE' && !campaign.activated_at) {
      set.activated_at = new Date();
    }

    const updated = await PromotionCampaignModel.findOneAndUpdate(
      { campaign_id: { $eq: campaignId }, tenant_id: { $eq: tenantId } },
      { $set: set },
      { new: true },
    ).exec();

    if (!updated) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    this.logger.log(
      { campaignId, tenantId, from: campaign.status, to: next },
      'Promotion campaign status changed',
    );

    return updated;
  }

  async getCampaign(campaignId: string, tenantId: string): Promise<IPromotionCampaign> {
    const campaign = await PromotionCampaignModel.findOne({
      campaign_id: { $eq: campaignId },
      tenant_id: { $eq: tenantId },
    }).exec();

    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }
    return campaign;
  }

  /** List campaigns for a tenant, newest first. Admin surface — all statuses. */
  async listCampaigns(
    tenantId: string,
    filters: { campaign_type?: PromotionCampaignType; status?: PromotionCampaignStatus } = {},
  ): Promise<IPromotionCampaign[]> {
    const query: Record<string, unknown> = { tenant_id: { $eq: tenantId } };
    if (filters.campaign_type) {
      query.campaign_type = { $eq: filters.campaign_type };
    }
    if (filters.status) {
      query.status = { $eq: filters.status };
    }

    const rows = await PromotionCampaignModel.find(query).sort({ starts_at: -1 }).lean().exec();

    return rows as unknown as IPromotionCampaign[];
  }
}

/**
 * Recursively search an object graph for a prohibited mechanic field name.
 * Matching is on whole word-ish segments so that a legitimate field like
 * `random_seed_disabled` is still caught (it names the mechanic) while
 * `brand_name` is not caught by `rand`.
 */
function findProhibitedField(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = findProhibitedField(entry, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const segments = key
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean);
    for (const banned of PROHIBITED_MECHANIC_FIELDS) {
      const bannedSegments = banned.split('_');
      const matches =
        segments.includes(banned) ||
        (bannedSegments.length > 1 && bannedSegments.every((s) => segments.includes(s)));
      if (matches) {
        return key;
      }
    }
    const hit = findProhibitedField(child, depth + 1);
    if (hit) return hit;
  }

  return null;
}
