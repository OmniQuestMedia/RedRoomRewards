/**
 * Admin Earn Controller — Screen 07
 *
 * POST /admin/earn — award bonus or promotional points to a member or model.
 *
 * Route classification: AUTH_ONLY (JWT required; no tenant-scope enforcement
 * because the adminId is validated from the JWT sub claim and merchantId is
 * in the request body).
 *
 * Step-up auth is enforced inside AdminEarnService — the JWT must carry
 * `step_up: true` (set by the IdP after the StepUpModal re-auth challenge).
 *
 * @module admin/admin-earn.controller
 */

import { Controller, Post, Body, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import {
  AdminEarnService,
  AdminEarnRequest,
  AdminEarnReasonCode,
  StepUpRequiredError,
  InvalidReasonCodeError,
} from './admin-earn.service';

interface AdminEarnBody {
  recipientId: string;
  recipientType: 'member' | 'model';
  amount: number;
  reasonCode: AdminEarnReasonCode;
  walletBucket: 'promotional_bonus';
  merchantId: string;
  idempotencyKey: string;
  requestId?: string;
}

@Controller('admin')
export class AdminEarnController {
  constructor(private readonly adminEarnService: AdminEarnService) {}

  /**
   * POST /admin/earn
   *
   * Awards promotional points to a member or model on behalf of a Merchant Admin.
   * Requires step-up authentication (`step_up: true` in JWT).
   *
   * Returns 201 on success, 403 on missing step-up auth, 422 on invalid input.
   */
  @Post('earn')
  async earn(
    @Body() body: AdminEarnBody,
    @Req() req: Request & { tenantId?: string; userId?: string },
    @Res() res: Response,
  ): Promise<void> {
    const adminId = req.userId ?? '';
    const tenantId = req.tenantId ?? '';

    // Input validation
    if (!body.recipientId?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'recipientId is required' });
      return;
    }
    if (!['member', 'model'].includes(body.recipientType)) {
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: "recipientType must be 'member' or 'model'" });
      return;
    }
    if (!(body.amount > 0)) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'amount must be positive' });
      return;
    }
    if (!body.idempotencyKey?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'idempotencyKey is required' });
      return;
    }
    if (!body.merchantId?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'merchantId is required' });
      return;
    }

    const request: AdminEarnRequest = {
      recipientId: body.recipientId,
      recipientType: body.recipientType,
      amount: body.amount,
      reasonCode: body.reasonCode,
      walletBucket: body.walletBucket ?? 'promotional_bonus',
      merchantId: body.merchantId,
      tenantId,
      idempotencyKey: body.idempotencyKey,
      requestId: body.requestId ?? '',
      authorizationHeader: req.headers.authorization ?? '',
      adminId,
    };

    try {
      const result = await this.adminEarnService.awardPoints(request);
      res.status(HttpStatus.CREATED).json(result);
    } catch (err) {
      if (err instanceof StepUpRequiredError) {
        res.status(HttpStatus.FORBIDDEN).json({ error: err.code, message: err.message });
        return;
      }
      if (err instanceof InvalidReasonCodeError) {
        res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({ error: err.code, message: err.message });
        return;
      }
      throw err;
    }
  }
}
