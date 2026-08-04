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
 *   DESIRE      0           Heartbeat — alive in the program
 *   PASSION     5,000       Emotionally invested
 *   OBSESSION   25,000      Deep craving, committed
 *   REIGN       100,000     All-in — the most devoted members
 *
 * At max tier (REIGN) `pointsToNextTier` is 0 — there is no next tier.
 */
@Injectable()
export class TierEngineService {
  private readonly tierThresholds: Record<RedRoomTier, number> = {
    [RedRoomTier.DESIRE]: 0,
    [RedRoomTier.PASSION]: 5_000,
    [RedRoomTier.OBSESSION]: 25_000,
    [RedRoomTier.REIGN]: 100_000,
  };

  private readonly vibeDescriptions: Record<RedRoomTier, string> = {
    [RedRoomTier.DESIRE]: 'Heartbeat — alive in the program',
    [RedRoomTier.PASSION]: 'Emotionally invested',
    [RedRoomTier.OBSESSION]: 'Deep craving, committed',
    [RedRoomTier.REIGN]: 'All-in — the most devoted members',
  };

  /** Ordered list of tiers from lowest to highest threshold. */
  private readonly orderedTiers: RedRoomTier[] = [
    RedRoomTier.DESIRE,
    RedRoomTier.PASSION,
    RedRoomTier.OBSESSION,
    RedRoomTier.REIGN,
  ];

  private readonly multipliers: TierMultiplierConfig[] = [
    {
      tier: RedRoomTier.DESIRE,
      earningMultiplier: 1.0,
      doublePointsDaysPerYear: 4,
      birthdayBonusDays: 7,
    },
    {
      tier: RedRoomTier.PASSION,
      earningMultiplier: 1.2,
      doublePointsDaysPerYear: 6,
      birthdayBonusDays: 14,
    },
    {
      tier: RedRoomTier.OBSESSION,
      earningMultiplier: 1.5,
      doublePointsDaysPerYear: 8,
      birthdayBonusDays: 21,
    },
    {
      tier: RedRoomTier.REIGN,
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
    let currentTier = RedRoomTier.DESIRE;
    let pointsToNextTier = 0;

    for (let i = 0; i < this.orderedTiers.length; i++) {
      const tier = this.orderedTiers[i];
      if (effective >= this.tierThresholds[tier]) {
        currentTier = tier;
        const nextTier = this.orderedTiers[i + 1];
        // No next tier at max (REIGN) → pointsToNextTier = 0
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
