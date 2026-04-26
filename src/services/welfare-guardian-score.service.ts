import { Injectable } from '@nestjs/common';
import {
  WgsAction,
  WgsScoreRequest,
  WgsScoreResponse,
  WgsWelfareTier,
} from '../interfaces/redroom-rewards';

/**
 * WelfareGuardianScoreService — WO-006 rule-based prototype model.
 *
 * Implements the Welfare Guardian Score (WGS) using a deterministic rule engine
 * against the transaction amount. The production implementation (WO-006 final)
 * will replace this with a hybrid rule + ML model trained on behavioural signals.
 *
 * Thresholds are configurable via environment at runtime; defaults match the
 * spec docs/ASSUMPTIONS.md F-009 (1000-point trigger).
 *
 * Rule table:
 *
 *   amountCzt        fraudRisk  welfareRisk  welfareTier  action
 *   ─────────────    ─────────  ───────────  ───────────  ──────────────
 *   0 – 999          5          10           LOW          PASS
 *   1000 – 4999      15         22           LOW          PASS
 *   5000 – 9999      30         40           MEDIUM       REVIEW
 *   10000 – 24999    55         65           HIGH         SOFT_DECLINE
 *   25000+           80         90           CRITICAL     HARD_DECLINE
 */
@Injectable()
export class WelfareGuardianScoreService {
  /** Overridable thresholds for testing / configuration */
  private readonly thresholds = {
    medium: Number(process.env.WGS_THRESHOLD_MEDIUM ?? 5_000),
    high: Number(process.env.WGS_THRESHOLD_HIGH ?? 10_000),
    critical: Number(process.env.WGS_THRESHOLD_CRITICAL ?? 25_000),
  };

  async scoreTransaction(req: WgsScoreRequest): Promise<WgsScoreResponse> {
    const amount = req.amountCzt;

    let fraudRisk: number;
    let welfareRisk: number;
    let welfareTier: WgsWelfareTier;
    let action: WgsAction;

    if (amount >= this.thresholds.critical) {
      fraudRisk = 80;
      welfareRisk = 90;
      welfareTier = 'CRITICAL';
      action = 'HARD_DECLINE';
    } else if (amount >= this.thresholds.high) {
      fraudRisk = 55;
      welfareRisk = 65;
      welfareTier = 'HIGH';
      action = 'SOFT_DECLINE';
    } else if (amount >= this.thresholds.medium) {
      fraudRisk = 30;
      welfareRisk = 40;
      welfareTier = 'MEDIUM';
      action = 'REVIEW';
    } else if (amount >= 1_000) {
      fraudRisk = 15;
      welfareRisk = 22;
      welfareTier = 'LOW';
      action = 'PASS';
    } else {
      fraudRisk = 5;
      welfareRisk = 10;
      welfareTier = 'LOW';
      action = 'PASS';
    }

    return { fraudRisk, welfareRisk, welfareTier, action };
  }
}
