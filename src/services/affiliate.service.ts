import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AffiliateLinkModel, IAffiliateLink } from '../db/models/affiliate-link.model';

export interface RegisterAffiliateLinkInput {
  tenant_id: string;
  creator_id: string;
  platform: IAffiliateLink['platform'];
  external_creator_ref: string;
  bonus_points_pct?: number;
  correlation_id?: string;
}

export interface AffiliateAccrualResult {
  base_points: number;
  bonus_points: number;
  total_points: number;
  affiliate_id: string | null;
}

/** Minimal signal extracted from an AccountsZone `CreatorRegistered` event. */
export interface CreatorRegisteredSignal {
  tenant_id: string;
  creator_id: string;
  external_creator_ref: string;
  platform: IAffiliateLink['platform'];
  correlation_id?: string;
}

@Injectable()
export class AffiliateService {
  async registerLink(input: RegisterAffiliateLinkInput): Promise<IAffiliateLink> {
    const pct = input.bonus_points_pct ?? 0;
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      throw new BadRequestException('bonus_points_pct must be an integer between 0 and 100');
    }

    const record = new AffiliateLinkModel({
      affiliate_id: randomUUID(),
      tenant_id: input.tenant_id,
      creator_id: input.creator_id,
      platform: input.platform,
      external_creator_ref: input.external_creator_ref,
      bonus_points_pct: pct,
      is_active: true,
      activated_at: new Date(),
      deactivated_at: null,
      correlation_id: input.correlation_id ?? randomUUID(),
    });

    return record.save();
  }

  async resolveBonus(
    tenantId: string,
    creatorId: string,
    basePoints: number,
  ): Promise<AffiliateAccrualResult> {
    const link = await AffiliateLinkModel.findOne({
      tenant_id: { $eq: tenantId },
      creator_id: { $eq: creatorId },
      is_active: { $eq: true },
    }).exec();

    if (!link) {
      return {
        base_points: basePoints,
        bonus_points: 0,
        total_points: basePoints,
        affiliate_id: null,
      };
    }

    const bonus_points = Math.floor((basePoints * link.bonus_points_pct) / 100);

    return {
      base_points: basePoints,
      bonus_points,
      total_points: basePoints + bonus_points,
      affiliate_id: link.affiliate_id,
    };
  }

  /**
   * Idempotently ensure a RedRoomRewards affiliate link exists for a creator
   * whose account was just created on another Park. Called from the inbound
   * AccountsZone `CreatorRegistered` webhook. The link is toggled ON at
   * creation (`is_active: true`) so the creator is immediately credited for
   * referred members.
   *
   * NON-FINANCIAL by design: `bonus_points_pct` is left at 0 (no points/cash
   * economics). The actual bonus rate is a governed (FIZ / CEO) decision set in
   * a later pass; a 0% link still generates and attributes without any ledger
   * or wallet write.
   */
  async ensureLinkForCreator(signal: CreatorRegisteredSignal): Promise<IAffiliateLink> {
    const existing = await AffiliateLinkModel.findOne({
      tenant_id: { $eq: signal.tenant_id },
      creator_id: { $eq: signal.creator_id },
      platform: { $eq: signal.platform },
    }).exec();

    if (existing) {
      return existing;
    }

    return this.registerLink({
      tenant_id: signal.tenant_id,
      creator_id: signal.creator_id,
      platform: signal.platform,
      external_creator_ref: signal.external_creator_ref,
      bonus_points_pct: 0,
      correlation_id: signal.correlation_id,
    });
  }

  /** Visibility read: the creator's active affiliate link, or null. */
  async getLinkForCreator(tenantId: string, creatorId: string): Promise<IAffiliateLink | null> {
    return AffiliateLinkModel.findOne({
      tenant_id: { $eq: tenantId },
      creator_id: { $eq: creatorId },
      is_active: { $eq: true },
    }).exec();
  }

  async deactivateLink(affiliateId: string, tenantId: string): Promise<void> {
    const result = await AffiliateLinkModel.findOneAndUpdate(
      {
        affiliate_id: { $eq: affiliateId },
        tenant_id: { $eq: tenantId },
      },
      {
        is_active: false,
        deactivated_at: new Date(),
      },
    ).exec();

    if (!result) {
      throw new NotFoundException(`Affiliate link not found: ${affiliateId}`);
    }
  }
}
