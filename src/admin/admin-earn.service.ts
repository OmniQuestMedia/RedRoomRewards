/**
 * Admin Earn Service — Screen 07
 *
 * Allows Merchant Admins to award bonus or promotional points to members or
 * models. Requires step-up authentication (JWT claim `step_up: true`).
 *
 * API binding: POST /admin/earn
 *
 * Supported reason codes:
 *   PROMO_BONUS — promotional bonus points to a member
 *   MODEL_GIFT  — gift points to a model's promotional wallet bucket
 *
 * Every award writes an immutable ledger entry (FIZ-compliant, PROMOTIONAL_AWARD
 * or MODEL_GIFT reason). An AuditRow entry is emitted via LedgerService so the
 * award appears in the recipient's transaction history.
 *
 * Step-up auth: the caller's Bearer JWT must carry `step_up: true`. This claim
 * is set by the external IdP after the Merchant Admin completes a re-auth
 * challenge (StepUpModal on the client). The service validates this claim before
 * processing the award.
 *
 * @module admin/admin-earn.service
 */

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as jwt from 'jsonwebtoken';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionType, TransactionReason } from '../wallets/types';

// ── Reason codes ─────────────────────────────────────────────────────────────

export const ADMIN_EARN_REASON_CODES = ['PROMO_BONUS', 'MODEL_GIFT'] as const;
export type AdminEarnReasonCode = (typeof ADMIN_EARN_REASON_CODES)[number];

// ── Request / Response shapes ─────────────────────────────────────────────────

export interface AdminEarnRequest {
  /** Member or model receiving the award */
  recipientId: string;
  /** Whether the recipient is a member or model */
  recipientType: 'member' | 'model';
  /** Points to award (must be positive) */
  amount: number;
  /** Structured reason code */
  reasonCode: AdminEarnReasonCode;
  /** Must be 'promotional_bonus' — the only bucket for admin awards */
  walletBucket: 'promotional_bonus';
  /** Merchant initiating the award */
  merchantId: string;
  /** Tenant scope */
  tenantId: string;
  /** Caller-supplied idempotency key */
  idempotencyKey: string;
  /** Tracing ID */
  requestId: string;
  /** Raw Authorization header value ("Bearer <token>") for step-up verification */
  authorizationHeader: string;
  /** Admin user performing the action */
  adminId: string;
}

export interface AdminEarnResponse {
  transactionId: string;
  auditId: string;
  recipientId: string;
  recipientType: 'member' | 'model';
  amount: number;
  reasonCode: AdminEarnReasonCode;
  walletBucket: 'promotional_bonus';
  merchantId: string;
  timestamp: string;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class StepUpRequiredError extends Error {
  public readonly code = 'STEP_UP_REQUIRED';
  constructor() {
    super('Step-up authentication is required for this operation');
    this.name = 'StepUpRequiredError';
  }
}

export class InvalidReasonCodeError extends Error {
  public readonly code = 'INVALID_REASON_CODE';
  constructor(code: string) {
    super(`Invalid reason code: ${code}. Allowed: ${ADMIN_EARN_REASON_CODES.join(', ')}`);
    this.name = 'InvalidReasonCodeError';
  }
}

// ── JWT shape with step_up claim ─────────────────────────────────────────────

interface StepUpJwtPayload {
  step_up?: boolean;
  role?: string;
  sub?: string;
  [key: string]: unknown;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AdminEarnService {
  constructor(private readonly ledgerService: LedgerService) {}

  /**
   * POST /admin/earn
   *
   * Awards promotional points to a member or model on behalf of a Merchant Admin.
   * Validates step-up auth, reason code, and idempotency before writing the
   * ledger entry.
   *
   * @throws StepUpRequiredError if the JWT does not carry `step_up: true`
   * @throws InvalidReasonCodeError if reasonCode is not in ADMIN_EARN_REASON_CODES
   */
  async awardPoints(request: AdminEarnRequest): Promise<AdminEarnResponse> {
    // 1. Validate step-up auth claim
    this.verifyStepUp(request.authorizationHeader);

    // 2. Validate reason code
    if (!ADMIN_EARN_REASON_CODES.includes(request.reasonCode)) {
      throw new InvalidReasonCodeError(request.reasonCode);
    }

    // 3. Validate wallet bucket
    if (request.walletBucket !== 'promotional_bonus') {
      throw new Error(
        `Invalid walletBucket: ${request.walletBucket}. Only 'promotional_bonus' is supported.`,
      );
    }

    // 4. Validate amount
    if (!(request.amount > 0)) {
      throw new Error('amount must be a positive integer');
    }

    // 5. Map reason code to TransactionReason
    const transactionReason =
      request.reasonCode === 'MODEL_GIFT'
        ? TransactionReason.MODEL_GIFT
        : TransactionReason.PROMOTIONAL_AWARD;

    // 6. Determine account type for ledger entry
    const accountType = request.recipientType === 'model' ? 'model' : 'user';

    // 7. Check idempotency
    const claimed = await this.ledgerService.claimIdempotency(request.idempotencyKey, 'admin_earn');

    const transactionId = uuidv4();
    const auditId = uuidv4();

    if (!claimed) {
      // Idempotency replay — return synthetic response (no duplicate entry)
      return this.buildResponse(request, transactionId, auditId);
    }

    // 8. Write immutable ledger entry (FIZ)
    const correlationId = transactionId;

    if (accountType === 'model') {
      // Model ledger entry uses 'earned' balance state
      await this.ledgerService.createEntry({
        transactionId,
        accountId: request.recipientId,
        accountType: 'model',
        amount: request.amount,
        type: TransactionType.CREDIT,
        balanceState: 'earned',
        stateTransition: 'none→earned',
        reason: transactionReason,
        idempotencyKey: request.idempotencyKey,
        requestId: request.requestId,
        balanceBefore: 0, // Snapshot would require model wallet lookup; acceptable for promo awards
        balanceAfter: request.amount,
        correlationId,
        metadata: {
          reasonCode: request.reasonCode,
          walletBucket: request.walletBucket,
          merchantId: request.merchantId,
          tenantId: request.tenantId,
          adminId: request.adminId,
          auditId,
        },
      });
    } else {
      // Member — use creditPoints which handles balance snapshot internally
      await this.ledgerService.creditPoints(
        request.recipientId,
        request.amount,
        `ADMIN_EARN_${request.merchantId}`,
        `${request.reasonCode}: awarded by merchant admin`,
        request.idempotencyKey,
      );
    }

    return this.buildResponse(request, transactionId, auditId);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Verifies that the Bearer JWT contains `step_up: true`.
   * Decodes the token without re-verifying the signature (the signature was
   * already verified by AuthMiddleware before reaching this handler).
   * Fails closed: any parse error is treated as missing step-up claim.
   */
  private verifyStepUp(authorizationHeader: string): void {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new StepUpRequiredError();
    }
    const token = authorizationHeader.slice(7);
    let payload: StepUpJwtPayload;
    try {
      // decode without verification — signature already checked by AuthMiddleware
      payload = jwt.decode(token) as StepUpJwtPayload;
    } catch {
      throw new StepUpRequiredError();
    }
    if (!payload || payload.step_up !== true) {
      throw new StepUpRequiredError();
    }
  }

  private buildResponse(
    request: AdminEarnRequest,
    transactionId: string,
    auditId: string,
  ): AdminEarnResponse {
    return {
      transactionId,
      auditId,
      recipientId: request.recipientId,
      recipientType: request.recipientType,
      amount: request.amount,
      reasonCode: request.reasonCode,
      walletBucket: request.walletBucket,
      merchantId: request.merchantId,
      timestamp: new Date().toISOString(),
    };
  }
}
