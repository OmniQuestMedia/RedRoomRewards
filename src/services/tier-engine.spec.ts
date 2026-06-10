import { Test } from '@nestjs/testing';
import { TierEngineService } from './tier-engine.service';
import { RedRoomTier } from '../interfaces/redroom-rewards';

describe('TierEngineService (WO-007)', () => {
  let service: TierEngineService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [TierEngineService],
    }).compile();
    service = module.get(TierEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('0 points → RED_DESIRE, points to next = 5000', () => {
    const result = service.calculateTier(0);
    expect(result.currentTier).toBe(RedRoomTier.RED_DESIRE);
    expect(result.pointsToNextTier).toBe(5_000);
    expect(result.vibeDescription).toBe('Heartbeat — alive in the program');
  });

  it('4999 points → RED_DESIRE, points to next = 1', () => {
    const result = service.calculateTier(4_999);
    expect(result.currentTier).toBe(RedRoomTier.RED_DESIRE);
    expect(result.pointsToNextTier).toBe(1);
  });

  it('5000 points → RED_PASSION, points to next = 20000', () => {
    const result = service.calculateTier(5_000);
    expect(result.currentTier).toBe(RedRoomTier.RED_PASSION);
    expect(result.pointsToNextTier).toBe(20_000);
    expect(result.vibeDescription).toBe('Emotionally invested');
  });

  it('calculates correct tier and vibe for 30000 (RED_OBSESSION)', () => {
    const result = service.calculateTier(30_000);
    expect(result.currentTier).toBe(RedRoomTier.RED_OBSESSION);
    expect(result.vibeDescription).toBe('Deep craving, committed');
    expect(result.pointsToNextTier).toBe(70_000);
  });

  it('100000 points → RED_REIGN (max tier), pointsToNextTier = 0', () => {
    const result = service.calculateTier(100_000);
    expect(result.currentTier).toBe(RedRoomTier.RED_REIGN);
    expect(result.pointsToNextTier).toBe(0);
    expect(result.vibeDescription).toBe('All-in — the most devoted members');
  });

  it('beyond max tier → still RED_REIGN, pointsToNextTier = 0', () => {
    const result = service.calculateTier(999_999);
    expect(result.currentTier).toBe(RedRoomTier.RED_REIGN);
    expect(result.pointsToNextTier).toBe(0);
  });

  it('negative input is treated as 0 (RED_DESIRE)', () => {
    const result = service.calculateTier(-100);
    expect(result.currentTier).toBe(RedRoomTier.RED_DESIRE);
    expect(result.pointsToNextTier).toBe(5_000);
  });

  describe('getMultiplier', () => {
    it('returns earningMultiplier for a known tier', () => {
      expect(service.getMultiplier(RedRoomTier.RED_DESIRE)).toBeGreaterThan(0);
    });

    it('returns 1.0 for an unknown tier (fallback branch)', () => {
      expect(service.getMultiplier('UNKNOWN_TIER' as RedRoomTier)).toBe(1.0);
    });
  });
});
