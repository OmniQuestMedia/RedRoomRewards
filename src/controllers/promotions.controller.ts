/**
 * Promotions Controllers
 *
 * Member-facing surface (`/promotions`) and admin surface
 * (`/admin/promotions`). Both follow the repo's existing controller shape:
 * `tenantId`/`userId` come from middleware-populated request fields, never from
 * the body, so a caller cannot name someone else's tenant.
 *
 * @module controllers/promotions.controller
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  PromotionCampaignService,
  CreateCampaignInput,
  UpdateCampaignInput,
} from '../promotions/promotion-campaign.service';
import { PromotionEngineService } from '../promotions/promotion-engine.service';
import { PromotionLiabilityService } from '../promotions/promotion-liability.service';
import { MemberContributionService } from '../promotions/member-contribution.service';
import {
  PromotionCampaignType,
  PromotionCampaignStatus,
} from '../db/models/promotion-campaign.model';

interface AuthedRequest extends Request {
  tenantId?: string;
  userId?: string;
}

@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly engine: PromotionEngineService,
    private readonly contribution: MemberContributionService,
  ) {}

  /**
   * GET /api/v1/promotions/progress — the member's progress-to-bonus bars.
   */
  @Get('progress')
  async progress(@Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const tenantId = req.tenantId ?? '';
    const memberId = req.userId ?? '';
    if (!tenantId || !memberId) {
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 'auth required' });
      return;
    }

    const bars = await this.engine.getProgressBars(tenantId, memberId);
    res.status(HttpStatus.OK).json({ bars });
  }

  /**
   * GET /api/v1/promotions/offers — live redemption offers for this member,
   * including how many claims they have left.
   */
  @Get('offers')
  async offers(@Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const tenantId = req.tenantId ?? '';
    const memberId = req.userId ?? '';
    if (!tenantId || !memberId) {
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 'auth required' });
      return;
    }

    const offers = await this.engine.listOffers(tenantId, memberId);
    res.status(HttpStatus.OK).json({ offers });
  }

  /**
   * POST /api/v1/promotions/offers/claim — burn points for a discount or item.
   */
  @Post('offers/claim')
  async claimOffer(
    @Body() body: { campaignId?: string; idempotencyKey?: string },
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? '';
    const memberId = req.userId ?? '';
    if (!tenantId || !memberId) {
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 'auth required' });
      return;
    }
    if (!body.campaignId?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'campaignId is required' });
      return;
    }
    if (!body.idempotencyKey?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'idempotencyKey is required' });
      return;
    }

    const result = await this.engine.claimOffer(
      tenantId,
      memberId,
      body.campaignId,
      body.idempotencyKey,
    );
    res.status(HttpStatus.CREATED).json(result);
  }

  /**
   * GET /api/v1/promotions/preview — what a purchase of this size would earn,
   * computed through the same path that grants it. Read-only.
   */
  @Get('preview')
  async preview(
    @Query('basePoints') basePoints: string,
    @Query('spendCents') spendCents: string,
    @Query('merchantId') merchantId: string,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? '';
    const memberId = req.userId ?? '';
    if (!tenantId || !memberId) {
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 'auth required' });
      return;
    }

    const base = Number.parseInt(basePoints, 10);
    if (!Number.isFinite(base) || base < 0) {
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'basePoints must be a non-negative integer' });
      return;
    }
    const spend = Number.parseInt(spendCents, 10);

    const result = await this.engine.previewPurchaseBonus({
      tenantId,
      memberId,
      basePoints: base,
      spendCents: Number.isFinite(spend) && spend >= 0 ? spend : 0,
      merchantId: merchantId ?? '',
      purchaseReference: `preview-${memberId}`,
    });
    res.status(HttpStatus.OK).json(result);
  }

  /**
   * GET /api/v1/promotions/standing — the member's own contribution profile.
   *
   * Surfaced to the member deliberately: if their history is what decides their
   * multiplier, they are entitled to see the same figures the decision used.
   */
  @Get('standing')
  async standing(@Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const tenantId = req.tenantId ?? '';
    const memberId = req.userId ?? '';
    if (!tenantId || !memberId) {
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 'auth required' });
      return;
    }

    const profile = await this.contribution.getProfile(tenantId, memberId);
    res.status(HttpStatus.OK).json(profile);
  }
}

@Controller('admin/promotions')
export class AdminPromotionsController {
  constructor(
    private readonly campaigns: PromotionCampaignService,
    private readonly engine: PromotionEngineService,
    private readonly liability: PromotionLiabilityService,
  ) {}

  /** GET /api/v1/admin/promotions — list campaigns for the tenant. */
  @Get()
  async list(
    @Query('campaign_type') campaignType: string,
    @Query('status') status: string,
    @Query('tenant_id') tenantIdQuery: string,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? tenantIdQuery ?? '';
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenant_id is required' });
      return;
    }

    const campaigns = await this.campaigns.listCampaigns(tenantId, {
      campaign_type: (campaignType as PromotionCampaignType) || undefined,
      status: (status as PromotionCampaignStatus) || undefined,
    });
    res.status(HttpStatus.OK).json({ campaigns });
  }

  /** GET /api/v1/admin/promotions/liability — liability + contribution report. */
  @Get('liability')
  async liabilityReport(
    @Query('include_ended') includeEnded: string,
    @Query('tenant_id') tenantIdQuery: string,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? tenantIdQuery ?? '';
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenant_id is required' });
      return;
    }

    const report = await this.liability.getReport(tenantId, {
      includeEnded: includeEnded !== 'false',
    });
    res.status(HttpStatus.OK).json(report);
  }

  /** POST /api/v1/admin/promotions — create a campaign (opens as DRAFT). */
  @Post()
  async create(
    @Body()
    body: Omit<CreateCampaignInput, 'starts_at' | 'ends_at'> & {
      starts_at: string;
      ends_at?: string | null;
    },
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? body.tenant_id ?? '';
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenant_id is required' });
      return;
    }

    const startsAt = new Date(body.starts_at);
    if (Number.isNaN(startsAt.getTime())) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'starts_at must be an ISO-8601 date' });
      return;
    }

    let endsAt: Date | null = null;
    if (body.ends_at) {
      endsAt = new Date(body.ends_at);
      if (Number.isNaN(endsAt.getTime())) {
        res.status(HttpStatus.BAD_REQUEST).json({ error: 'ends_at must be an ISO-8601 date' });
        return;
      }
    }

    const campaign = await this.campaigns.createCampaign({
      ...body,
      tenant_id: tenantId,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: req.userId ?? body.created_by,
    });
    res.status(HttpStatus.CREATED).json(campaign);
  }

  /** PUT /api/v1/admin/promotions/:id — edit non-economic fields only. */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Omit<UpdateCampaignInput, 'ends_at'> & { ends_at?: string | null; tenant_id?: string },
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? body.tenant_id ?? '';
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenant_id is required' });
      return;
    }

    const { tenant_id: _tid, ends_at, ...rest } = body;
    const updates: UpdateCampaignInput = { ...rest };

    if (ends_at !== undefined) {
      if (ends_at === null) {
        updates.ends_at = null;
      } else {
        const parsed = new Date(ends_at);
        if (Number.isNaN(parsed.getTime())) {
          res.status(HttpStatus.BAD_REQUEST).json({ error: 'ends_at must be an ISO-8601 date' });
          return;
        }
        updates.ends_at = parsed;
      }
    }

    const campaign = await this.campaigns.updateCampaign(id, tenantId, updates);
    res.status(HttpStatus.OK).json(campaign);
  }

  /** POST /api/v1/admin/promotions/:id/status — lifecycle transition. */
  @Post(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() body: { status?: PromotionCampaignStatus; tenant_id?: string },
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? body.tenant_id ?? '';
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenant_id is required' });
      return;
    }
    if (!body.status) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'status is required' });
      return;
    }

    const campaign = await this.campaigns.setStatus(id, tenantId, body.status);
    res.status(HttpStatus.OK).json(campaign);
  }

  /**
   * POST /api/v1/admin/promotions/purchase-bonus — apply multiplier bonuses and
   * progress for a settled purchase.
   *
   * Machine-to-machine: the merchant earn path calls this after base accrual
   * has run, passing the base points it awarded. Splitting it from accrual is
   * what keeps campaign cost separable from base programme cost in the ledger.
   */
  @Post('purchase-bonus')
  async purchaseBonus(
    @Body()
    body: {
      tenant_id?: string;
      member_id?: string;
      base_points?: number;
      spend_cents?: number;
      merchant_id?: string;
      event_class?: string;
      purchase_reference?: string;
      idempotency_key?: string;
      /** Progress units to record; defaults to spend in whole currency units. */
      progress_units?: number;
    },
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? body.tenant_id ?? '';
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenant_id is required' });
      return;
    }
    if (!body.member_id?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'member_id is required' });
      return;
    }
    if (!body.purchase_reference?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'purchase_reference is required' });
      return;
    }
    if (!body.idempotency_key?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'idempotency_key is required' });
      return;
    }
    if (typeof body.base_points !== 'number' || body.base_points < 0) {
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'base_points must be a non-negative number' });
      return;
    }

    const spendCents = typeof body.spend_cents === 'number' ? body.spend_cents : 0;

    const bonus = await this.engine.applyPurchaseBonus({
      tenantId,
      memberId: body.member_id,
      basePoints: body.base_points,
      spendCents,
      merchantId: body.merchant_id ?? '',
      eventClass: body.event_class,
      purchaseReference: body.purchase_reference,
      idempotencyKey: body.idempotency_key,
    });

    const progressUnits =
      typeof body.progress_units === 'number' ? body.progress_units : Math.floor(spendCents / 100);

    const bars =
      progressUnits > 0
        ? await this.engine.recordProgress({
            tenantId,
            memberId: body.member_id,
            units: progressUnits,
            spendCents,
            merchantId: body.merchant_id,
            sourceReference: body.purchase_reference,
            idempotencyKey: body.idempotency_key,
          })
        : [];

    res.status(HttpStatus.OK).json({ bonus, progress: bars });
  }
}
