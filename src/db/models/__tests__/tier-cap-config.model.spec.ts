/**
 * TierCapConfig model — unit tests (Canon Amendment 2026-08).
 *
 * The per-Standing-tier redemption band card: redemption_floor_pct (the 5 %
 * floor) + redemption_cap_pct (the per-tier max), keyed to the four Standing
 * tiers only, program-wide (tenant-scoped, no merchant_id).
 */

import { TierCapConfigModel, TierCapConfigSchema } from '../tier-cap-config.model';
import { RedRoomTier } from '../../../interfaces/redroom-rewards';

describe('TierCapConfigModel (Canon 2026-08)', () => {
  describe('schema configuration', () => {
    it('binds to the tier_cap_configs collection', () => {
      expect(
        (TierCapConfigSchema as unknown as { options: { collection: string } }).options.collection,
      ).toBe('tier_cap_configs');
    });

    it('is keyed on Standing tier, not the retired ladder or merchant_id', () => {
      expect(TierCapConfigSchema.path('tier')).toBeDefined();
      expect(TierCapConfigSchema.path('tier_name')).toBeUndefined();
      expect(TierCapConfigSchema.path('merchant_id')).toBeUndefined();
    });

    it('carries both a floor and a cap percentage', () => {
      expect(TierCapConfigSchema.path('redemption_floor_pct')).toBeDefined();
      expect(TierCapConfigSchema.path('redemption_cap_pct')).toBeDefined();
    });
  });

  describe('validateSync', () => {
    const base = {
      config_id: 'c-1',
      tenant_id: 't-1',
      effective_at: new Date(0),
      correlation_id: 'corr-1',
      reason_code: 'TEST',
      created_by: 'test',
      tier: RedRoomTier.REIGN,
      redemption_floor_pct: 5,
      redemption_cap_pct: 45,
    };

    it('accepts a valid Standing-tier band', () => {
      const doc = new TierCapConfigModel({ ...base });
      expect(doc.validateSync()).toBeUndefined();
      expect(doc.superseded_at).toBeNull();
    });

    it('rejects a retired-ladder tier value', () => {
      const doc = new TierCapConfigModel({ ...base, tier: 'PLATINUM' });
      expect(doc.validateSync()?.errors.tier).toBeDefined();
    });

    it('rejects a cap percentage above 100', () => {
      const doc = new TierCapConfigModel({ ...base, redemption_cap_pct: 150 });
      expect(doc.validateSync()?.errors.redemption_cap_pct).toBeDefined();
    });

    it('rejects a negative floor percentage', () => {
      const doc = new TierCapConfigModel({ ...base, redemption_floor_pct: -1 });
      expect(doc.validateSync()?.errors.redemption_floor_pct).toBeDefined();
    });

    it('requires the floor and cap fields', () => {
      const doc = new TierCapConfigModel({
        config_id: 'c-1',
        tenant_id: 't-1',
        effective_at: new Date(0),
        correlation_id: 'corr-1',
        reason_code: 'TEST',
        created_by: 'test',
        tier: RedRoomTier.DESIRE,
      });
      const err = doc.validateSync();
      expect(err?.errors.redemption_floor_pct).toBeDefined();
      expect(err?.errors.redemption_cap_pct).toBeDefined();
    });
  });
});
