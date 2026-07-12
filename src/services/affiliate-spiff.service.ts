/**
 * Affiliate Account-Spiff Service
 *
 * Awards the referring creator a configurable RRR points spiff when a referred
 * guest opens a new RedRoomPleasures / RedRoomRewards account. Points logic
 * lives in RedRoomRewards (RRR owns points); this orchestrates the award via
 * PointAccrualService.awardReferralBonus (ledger-backed, idempotent per
 * referrer+referred). AccountFinanceZone only REFLECTS the resulting balance.
 *
 * @module services/affiliate-spiff.service
 */

import { PointAccrualService } from './point-accrual.service';
import {
  AFFILIATE_ACCOUNT_SPIFF,
  AffiliateSpiffLever,
  isSpiffActive,
} from './affiliate-spiff.config';

export interface NewAccountSpiffInput {
  /** Referring creator (the affiliate-link owner) — receives the points. */
  creatorId: string;
  /** The referred guest whose new account triggered the spiff. */
  referredUserId: string;
  /** Request id for tracing. */
  requestId: string;
  /** Tenant scope. */
  tenantId: string;
  /** Evaluation time (defaults to now) — used for the lever window. */
  at?: Date;
}

export interface NewAccountSpiffResult {
  awarded: boolean;
  points: number;
  reason: 'awarded' | 'already_awarded' | 'lever_inactive';
  transactionId?: string;
}

export class AffiliateSpiffService {
  constructor(
    private readonly pointAccrual: PointAccrualService,
    private readonly lever: AffiliateSpiffLever = AFFILIATE_ACCOUNT_SPIFF,
  ) {}

  /**
   * Idempotently award the configured account spiff to the referring creator.
   * A no-op (reason `lever_inactive`) when the lever is off/out-of-window, and
   * `already_awarded` on a redelivered signal (the underlying referral bonus is
   * idempotent on referrer+referred).
   */
  async awardNewAccountSpiff(input: NewAccountSpiffInput): Promise<NewAccountSpiffResult> {
    const at = input.at ?? new Date();
    if (!isSpiffActive(this.lever, at)) {
      return { awarded: false, points: 0, reason: 'lever_inactive' };
    }

    try {
      const res = await this.pointAccrual.awardReferralBonus(
        input.creatorId,
        input.referredUserId,
        this.lever.points,
        input.requestId,
        input.tenantId,
      );
      return {
        awarded: true,
        points: this.lever.points,
        reason: 'awarded',
        transactionId: res.transactionId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/idempotency/i.test(message)) {
        return { awarded: false, points: this.lever.points, reason: 'already_awarded' };
      }
      throw err;
    }
  }
}

export function createAffiliateSpiffService(
  pointAccrual: PointAccrualService,
  lever?: AffiliateSpiffLever,
): AffiliateSpiffService {
  return new AffiliateSpiffService(pointAccrual, lever);
}
