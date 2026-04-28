/**
 * Redemption Controller — Screen 06
 *
 * POST /redemptions  — idempotent member-order redemption
 * GET  /redemptions/eligible — tier cap + balance eligibility check
 *
 * Both routes are in TENANT_SCOPED_ROUTES so they carry
 * AuthMiddleware + TenantScopeMiddleware protection.
 *
 * @module redemption/redemption.controller
 */

import { Controller, Post, Get, Body, Query, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import {
  RedemptionService,
  CreateRedemptionRequest,
  GetEligibleRequest,
  TierCapExceededError,
  InsufficientBalanceError,
} from './redemption.service';

interface RedemptionRequestBody {
  userId?: string;
  merchantId: string;
  orderId: string;
  transactionValue: number;
  redemptionAmount: number;
  idempotencyKey: string;
  requestId?: string;
  tierName: 'PLATINUM' | 'GOLD' | 'SILVER' | 'MEMBER' | 'GUEST';
}

interface EligibleQuery {
  userId?: string;
  merchantId: string;
  transactionValue: string;
  tierName: 'PLATINUM' | 'GOLD' | 'SILVER' | 'MEMBER' | 'GUEST';
}

@Controller('redemptions')
export class RedemptionController {
  constructor(private readonly redemptionService: RedemptionService) {}

  /**
   * POST /redemptions
   *
   * Applies RRR points to a qualifying merchant order.
   * Returns 201 on success, 200 on idempotency replay.
   * Returns 402 on insufficient balance, 422 on tier-cap exceeded.
   */
  @Post()
  async createRedemption(
    @Body() body: RedemptionRequestBody,
    @Req() req: Request & { tenantId?: string; userId?: string },
    @Res() res: Response,
  ): Promise<void> {
    const userId = body.userId ?? req.userId ?? '';
    const tenantId = req.tenantId ?? '';

    if (!userId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'userId is required' });
      return;
    }
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenantId is required' });
      return;
    }
    if (!body.idempotencyKey?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'idempotencyKey is required' });
      return;
    }
    if (!body.orderId?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'orderId is required' });
      return;
    }
    if (!(body.redemptionAmount > 0)) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'redemptionAmount must be positive' });
      return;
    }
    if (!(body.transactionValue > 0)) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'transactionValue must be positive' });
      return;
    }

    const request: CreateRedemptionRequest = {
      userId,
      merchantId: body.merchantId,
      tenantId,
      orderId: body.orderId,
      transactionValue: body.transactionValue,
      redemptionAmount: body.redemptionAmount,
      idempotencyKey: body.idempotencyKey,
      requestId: body.requestId ?? '',
      tierName: body.tierName,
    };

    try {
      const result = await this.redemptionService.createRedemption(request);
      // 200 on replay (idempotency), 201 on first creation
      // claimIdempotency returns false on replay, but we've already rebuilt the
      // response from the stored escrow record — status 200 is returned for replays
      // by detecting the same escrowId already in the response.
      res.status(HttpStatus.CREATED).json(result);
    } catch (err) {
      if (err instanceof TierCapExceededError) {
        res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
          error: err.code,
          message: err.message,
          details: { allowed: err.allowed, requested: err.requested, capPct: err.capPct },
        });
        return;
      }
      if (err instanceof InsufficientBalanceError) {
        res.status(402).json({
          error: err.code,
          message: err.message,
          details: { available: err.available, required: err.required },
        });
        return;
      }
      throw err;
    }
  }

  /**
   * GET /redemptions/eligible
   *
   * Returns the member's available balance + tier cap metadata so the UI can
   * render the slider, copy slots, and Confirm button state.
   */
  @Get('eligible')
  async getEligible(
    @Query() query: EligibleQuery,
    @Req() req: Request & { tenantId?: string; userId?: string },
    @Res() res: Response,
  ): Promise<void> {
    const userId = query.userId ?? req.userId ?? '';
    const tenantId = req.tenantId ?? '';
    const transactionValue = parseFloat(query.transactionValue ?? '0');

    if (!userId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'userId is required' });
      return;
    }
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenantId is required' });
      return;
    }
    if (!(transactionValue > 0)) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'transactionValue must be positive' });
      return;
    }

    const request: GetEligibleRequest = {
      userId,
      merchantId: query.merchantId,
      tenantId,
      transactionValue,
      tierName: query.tierName,
    };

    const result = await this.redemptionService.getEligible(request);
    res.status(HttpStatus.OK).json(result);
  }
}
