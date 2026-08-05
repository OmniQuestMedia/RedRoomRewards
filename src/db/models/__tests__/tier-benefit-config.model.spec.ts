/**
 * TierBenefitConfig model — unit tests (Canon Amendment 2026-08).
 *
 * The per-Standing-tier benefits "card": rrr_multiplier (earn bonus fraction,
 * default 0 % = admin-configurable), keyed to the four Standing tiers only.
 */

import { TierBenefitConfigModel, TierBenefitConfigSchema } from '../tier-benefit-config.model';
import { RedRoomTier } from '../../../interfaces/redroom-rewards';

describe('TierBenefitConfigModel (Canon 2026-08)', () => {
  describe('schema configuration', () => {
    it('binds to the tier_benefit_configs collection', () => {
      expect(
        (TierBenefitConfigSchema as unknown as { options: { collection: string } }).options
          .collection,
      ).toBe('tier_benefit_configs');
    });

    it('carries an rrr_multiplier path (not inferno_multiplier)', () => {
      expect(TierBenefitConfigSchema.path('rrr_multiplier')).toBeDefined();
      expect(TierBenefitConfigSchema.path('inferno_multiplier')).toBeUndefined();
    });

    it('keys tier to the four Standing tiers only', () => {
      const doc = new TierBenefitConfigModel({
        config_id: 'c-1',
        tenant_id: 't-1',
        effective_at: new Date(0),
        correlation_id: 'corr-1',
        reason_code: 'TEST',
        created_by: 'test',
        tier: 'PLATINUM', // retired ladder — must be rejected
      });
      expect(doc.validateSync()?.errors.tier).toBeDefined();
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
      tier: RedRoomTier.DESIRE,
    };

    it('defaults rrr_multiplier to 0 (0 % bonus, CEO default)', () => {
      const doc = new TierBenefitConfigModel({ ...base });
      expect(doc.validateSync()).toBeUndefined();
      expect(doc.rrr_multiplier).toBe(0);
      expect(doc.double_points_days_per_year).toBe(0);
      expect(doc.birthday_bonus_days).toBe(0);
      expect(doc.superseded_at).toBeNull();
    });

    it('accepts a positive rrr_multiplier bonus', () => {
      const doc = new TierBenefitConfigModel({
        ...base,
        tier: RedRoomTier.REIGN,
        rrr_multiplier: 0.5,
      });
      expect(doc.validateSync()).toBeUndefined();
      expect(doc.rrr_multiplier).toBe(0.5);
    });

    it('rejects a negative rrr_multiplier', () => {
      const doc = new TierBenefitConfigModel({ ...base, rrr_multiplier: -0.1 });
      expect(doc.validateSync()?.errors.rrr_multiplier).toBeDefined();
    });

    it('rejects a document missing required audit context', () => {
      const doc = new TierBenefitConfigModel({});
      const err = doc.validateSync();
      expect(err?.errors.config_id).toBeDefined();
      expect(err?.errors.tenant_id).toBeDefined();
      expect(err?.errors.correlation_id).toBeDefined();
      expect(err?.errors.tier).toBeDefined();
    });
  });
});
