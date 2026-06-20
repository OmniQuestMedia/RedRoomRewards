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
