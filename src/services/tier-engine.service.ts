import { Injectable } from '@nestjs/common';
import { RedRoomTier, TierMultiplierConfig, TierProgress } from '../interfaces/redroom-rewards';

/**
 * TierEngineService — WO-007 final polish.
 *
 * Calculates the member's current tier and points remaining to the next tier
 * based on lifetime total points. Tier thresholds are locked per CEO spec (D3).
 *
 * Tier table (effective-dated constants — immutable until CEO amendment):
 *
 *   Tier            Min points  Vibe
 *   ─────────────   ──────────  ─────────────────────────────────
 *   RED_DESIRE      0           Heartbeat — alive in the program
 *   RED_PASSION     5,000       Emotionally invested
 *   RED_OBSESSION   25,000      Deep craving, committed
 *   RED_REIGN       100,000     All-in — the most devoted members
 *
 * At max tier (RED_REIGN) `pointsToNextTier` is 0 — there is no next tier.
 */
@Injectable()
export class TierEngineService {
  private readonly tierThresholds: Record<RedRoomTier, number> = {
    [RedRoomTier.RED_DESIRE]: 0,
    [RedRoomTier.RED_PASSION]: 5_000,
    [RedRoomTier.RED_OBSESSION]: 25_000,
    [RedRoomTier.RED_REIGN]: 100_000,
  };

  private readonly vibeDescriptions: Record<RedRoomTier, string> = {
    [RedRoomTier.RED_DESIRE]: 'Heartbeat — alive in the program',
    [RedRoomTier.RED_PASSION]: 'Emotionally invested',
    [RedRoomTier.RED_OBSESSION]: 'Deep craving, committed',
    [RedRoomTier.RED_REIGN]: 'All-in — the most devoted members',
  };

  /** Ordered list of tiers from lowest to highest threshold. */
  private readonly orderedTiers: RedRoomTier[] = [
    RedRoomTier.RED_DESIRE,
    RedRoomTier.RED_PASSION,
    RedRoomTier.RED_OBSESSION,
    RedRoomTier.RED_REIGN,
  ];

  private readonly multipliers: TierMultiplierConfig[] = [
    {
      tier: RedRoomTier.RED_DESIRE,
      earningMultiplier: 1.0,
      doublePointsDaysPerYear: 4,
      birthdayBonusDays: 7,
    },
    {
      tier: RedRoomTier.RED_PASSION,
      earningMultiplier: 1.2,
      doublePointsDaysPerYear: 6,
      birthdayBonusDays: 14,
    },
    {
      tier: RedRoomTier.RED_OBSESSION,
      earningMultiplier: 1.5,
      doublePointsDaysPerYear: 8,
      birthdayBonusDays: 21,
    },
    {
      tier: RedRoomTier.RED_REIGN,
      earningMultiplier: 1.7,
      doublePointsDaysPerYear: 10,
      birthdayBonusDays: 30,
    },
  ];

  getMultiplier(tier: RedRoomTier): number {
    return this.multipliers.find((m) => m.tier === tier)?.earningMultiplier || 1.0;
  }

  calculateTier(totalPoints: number): TierProgress {
    const effective = Math.max(0, totalPoints);
    let currentTier = RedRoomTier.RED_DESIRE;
    let pointsToNextTier = 0;

    for (let i = 0; i < this.orderedTiers.length; i++) {
      const tier = this.orderedTiers[i];
      if (effective >= this.tierThresholds[tier]) {
        currentTier = tier;
        const nextTier = this.orderedTiers[i + 1];
        // No next tier at max (RED_REIGN) → pointsToNextTier = 0
        pointsToNextTier = nextTier ? this.tierThresholds[nextTier] - effective : 0;
      } else {
        break;
      }
    }

    return {
      currentTier,
      pointsToNextTier,
      vibeDescription: this.vibeDescriptions[currentTier],
    };
  }
}
