/**
 * Promotion Eligibility Service
 *
 * The single gate every promotional point movement passes through. It composes
 * three independent signals and returns one decision:
 *
 *   1. GateGuard AV  (GateGuardAVService)          — is this a verified adult?
 *   2. Welfare Guardian Score (WelfareGuardianScoreService) — would this
 *      movement harm the member?
 *   3. Contribution band (MemberContributionService) — has this member's own
 *      spend history paid for an uplift?
 *
 * ── Grants and burns are gated differently, on purpose ──────────────────────
 * A grant *induces future spend*; a burn *spends down points the member already
 * holds* and takes no new money. They therefore cannot share a welfare policy:
 *
 *   WGS action      Grant (induces spend)        Burn (retires liability)
 *   ───────────     ─────────────────────        ───────────────────────────
 *   PASS            allow, uplift permitted      allow
 *   REVIEW          allow at BASE only           allow
 *   SOFT_DECLINE    suppress entirely            allow — the healthier action
 *   HARD_DECLINE    suppress entirely            block
 *
 * Allowing a burn at SOFT_DECLINE is deliberate. A member flagged for spend
 * velocity is better served by redeeming points they already own than by being
 * locked out of the one action that costs them nothing. HARD_DECLINE blocks
 * both, because at that point the account needs a human, not a promotion.
 *
 * ── Fail-closed everywhere ──────────────────────────────────────────────────
 * An unreachable or throwing GateGuard/WGS dependency denies the promotion. It
 * does not "allow because the check was unavailable". The downside of failing
 * closed is a member who misses a bonus; the downside of failing open is
 * granting adult-programme incentives to an unverified account and inducing
 * spend on a member flagged for harm. Those are not comparable.
 *
 * @module promotions/promotion-eligibility.service
 */

import { Injectable, Logger } from '@nestjs/common';
import { GateGuardAVService } from '../services/gateguard-av.service';
import { WelfareGuardianScoreService } from '../services/welfare-guardian-score.service';
import {
  MemberContributionService,
  MemberContributionProfile,
} from './member-contribution.service';
import { ContributionBand, IMultiplierTerms } from '../db/models/promotion-campaign.model';
import { WgsAction } from '../interfaces/redroom-rewards';

/** Which side of the ledger the movement sits on. */
export type PromotionMovement = 'GRANT' | 'BURN';

/** Why a promotion was allowed, restricted, or denied. Auditable reason codes. */
export type EligibilityReasonCode =
  | 'ELIGIBLE'
  | 'ELIGIBLE_BASE_ONLY_WELFARE_REVIEW'
  | 'ELIGIBLE_BASE_ONLY_UNPROVEN_MARGIN'
  | 'DENIED_AGE_VERIFICATION'
  | 'DENIED_AGE_VERIFICATION_UNAVAILABLE'
  | 'DENIED_WELFARE_SOFT_DECLINE'
  | 'DENIED_WELFARE_HARD_DECLINE'
  | 'DENIED_WELFARE_UNAVAILABLE';

export interface EligibilityDecision {
  /** Whether the movement may proceed at all. */
  allowed: boolean;
  /**
   * Whether a margin-gated multiplier uplift may be applied. False means the
   * campaign's base multiplier is the ceiling — never a reduction below base.
   */
  upliftPermitted: boolean;
  reasonCode: EligibilityReasonCode;
  /** Operator-readable explanation. Contains no PII. */
  explanation: string;
  /** Contribution band in force, or null when not evaluated (burns). */
  band: ContributionBand | null;
  /** WGS action observed, or null when the check was not reached. */
  welfareAction: WgsAction | null;
  /** Full contribution profile when one was computed. */
  profile: MemberContributionProfile | null;
}

export interface EvaluateEligibilityInput {
  tenantId: string;
  memberId: string;
  movement: PromotionMovement;
  /**
   * Points at stake — bonus points for a grant, points_price for a burn. Feeds
   * the Welfare Guardian Score, which is scored on magnitude.
   */
  pointsAtStake: number;
  /** Opaque correlation reference for the originating transaction. */
  transactionRef: string;
  merchantId?: string;
}

@Injectable()
export class PromotionEligibilityService {
  private readonly logger = new Logger(PromotionEligibilityService.name);

  constructor(
    private readonly gateGuard: GateGuardAVService,
    private readonly welfare: WelfareGuardianScoreService,
    private readonly contribution: MemberContributionService,
  ) {}

  async evaluate(input: EvaluateEligibilityInput): Promise<EligibilityDecision> {
    // ── 1. GateGuard AV — mandatory 18+ check on both grants and burns ──────
    let verified: boolean;
    try {
      const av = await this.gateGuard.verifyAccount(input.memberId);
      verified = av.verified === true;
    } catch (error) {
      this.logger.warn(
        { memberId: input.memberId, err: (error as Error).message },
        'GateGuard AV unavailable — denying promotion (fail-closed)',
      );
      return deny(
        'DENIED_AGE_VERIFICATION_UNAVAILABLE',
        'Age verification could not be completed; promotions are withheld until it succeeds.',
      );
    }

    if (!verified) {
      return deny(
        'DENIED_AGE_VERIFICATION',
        'Account is not age-verified by GateGuard; promotional grants and burns are withheld.',
      );
    }

    // ── 2. Welfare Guardian Score ───────────────────────────────────────────
    let action: WgsAction;
    try {
      const score = await this.welfare.scoreTransaction({
        transactionId: input.transactionRef,
        guestId: input.memberId,
        amountCzt: input.pointsAtStake,
        context: { movement: input.movement, surface: 'RRR_PROMOTIONS' },
      });
      action = score.action;
    } catch (error) {
      this.logger.warn(
        { memberId: input.memberId, err: (error as Error).message },
        'Welfare Guardian Score unavailable — denying promotion (fail-closed)',
      );
      return deny(
        'DENIED_WELFARE_UNAVAILABLE',
        'Welfare scoring could not be completed; promotions are withheld until it succeeds.',
      );
    }

    if (action === 'HARD_DECLINE') {
      return {
        ...deny(
          'DENIED_WELFARE_HARD_DECLINE',
          'Welfare Guardian Score returned HARD_DECLINE; this account needs human review, not a promotion.',
        ),
        welfareAction: action,
      };
    }

    if (action === 'SOFT_DECLINE' && input.movement === 'GRANT') {
      // Burns stay permitted at SOFT_DECLINE — see the policy table above.
      return {
        ...deny(
          'DENIED_WELFARE_SOFT_DECLINE',
          'Welfare Guardian Score returned SOFT_DECLINE; spend-inducing grants are suppressed. Redemption remains available.',
        ),
        welfareAction: action,
      };
    }

    // ── 3. Burns need no margin evidence ────────────────────────────────────
    // Burning points reduces outstanding liability and improves programme
    // margin by definition. There is nothing to prove.
    if (input.movement === 'BURN') {
      return {
        allowed: true,
        upliftPermitted: false,
        reasonCode: 'ELIGIBLE',
        explanation: 'Verified member, welfare-clear; redemption reduces outstanding liability.',
        band: null,
        welfareAction: action,
        profile: null,
      };
    }

    // ── 4. Contribution band — gates the uplift, never the base offer ───────
    const profile = await this.contribution.getProfile(
      input.tenantId,
      input.memberId,
      input.merchantId,
    );

    const marginProven = profile.band === 'NET_POSITIVE' || profile.band === 'HIGH_MARGIN';

    // A welfare REVIEW caps the member at base even with proven margin: the
    // margin question ("can we afford it") and the welfare question ("should
    // we") are independent, and the restrictive answer wins.
    if (action === 'REVIEW') {
      return {
        allowed: true,
        upliftPermitted: false,
        reasonCode: 'ELIGIBLE_BASE_ONLY_WELFARE_REVIEW',
        explanation: `Welfare Guardian Score returned REVIEW; base multiplier only, uplift withheld. Contribution band: ${profile.band}.`,
        band: profile.band,
        welfareAction: action,
        profile,
      };
    }

    if (!marginProven) {
      return {
        allowed: true,
        upliftPermitted: false,
        reasonCode: 'ELIGIBLE_BASE_ONLY_UNPROVEN_MARGIN',
        explanation: `Base multiplier only — ${profile.band_reason}`,
        band: profile.band,
        welfareAction: action,
        profile,
      };
    }

    return {
      allowed: true,
      upliftPermitted: true,
      reasonCode: 'ELIGIBLE',
      explanation: `Uplift permitted — ${profile.band_reason}`,
      band: profile.band,
      welfareAction: action,
      profile,
    };
  }

  /**
   * Resolve the multiplier a member actually receives.
   *
   * Pure and exported so the "which multiplier applies" rule is testable and
   * inspectable without standing up the engine. The base multiplier is a floor:
   * a member never receives less than what the campaign advertised, whatever
   * their band. Uplift is strictly additive and strictly earned.
   */
  resolveMultiplier(
    terms: IMultiplierTerms,
    band: ContributionBand | null,
    upliftPermitted: boolean,
  ): { multiplier: number; upliftApplied: boolean } {
    const base = terms.multiplier;

    if (!upliftPermitted || !terms.band_multipliers || band === null) {
      return { multiplier: base, upliftApplied: false };
    }

    const candidate =
      band === 'HIGH_MARGIN'
        ? (terms.band_multipliers.HIGH_MARGIN ?? terms.band_multipliers.NET_POSITIVE)
        : band === 'NET_POSITIVE'
          ? terms.band_multipliers.NET_POSITIVE
          : undefined;

    if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate <= base) {
      return { multiplier: base, upliftApplied: false };
    }

    return { multiplier: candidate, upliftApplied: true };
  }
}

function deny(reasonCode: EligibilityReasonCode, explanation: string): EligibilityDecision {
  return {
    allowed: false,
    upliftPermitted: false,
    reasonCode,
    explanation,
    band: null,
    welfareAction: null,
    profile: null,
  };
}
