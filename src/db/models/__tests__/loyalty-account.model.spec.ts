/**
 * LoyaltyAccount model — unit tests (B-005)
 */

import { LoyaltyAccountModel, LoyaltyAccountSchema } from '../loyalty-account.model';

describe('LoyaltyAccountModel (B-005)', () => {
  describe('schema configuration', () => {
    it('binds to the loyalty_accounts collection', () => {
      expect(
        (LoyaltyAccountSchema as unknown as { options: { collection: string } }).options.collection,
      ).toBe('loyalty_accounts');
    });

    // Canon Amendment 2026-08: RRR is standing-only. The RRR-native
    // rrr_member_tier (GUEST…PLATINUM) ladder was drift and is removed — the
    // loyalty account carries no member-tier path.
    it('does not carry an rrr_member_tier path (standing-only)', () => {
      expect(LoyaltyAccountSchema.path('rrr_member_tier')).toBeUndefined();
    });
  });

  describe('validateSync', () => {
    it('rejects a document missing required fields', () => {
      const doc = new LoyaltyAccountModel({});
      const err = doc.validateSync();
      expect(err).toBeDefined();
      expect(err?.errors.account_id).toBeDefined();
      expect(err?.errors.tenant_id).toBeDefined();
      expect(err?.errors.user_id).toBeDefined();
    });

    it('accepts a minimal valid document and applies defaults (status, currency, enrolled_at)', () => {
      const doc = new LoyaltyAccountModel({
        account_id: 'acc-1',
        tenant_id: 'tenant-rrp-001',
        user_id: 'user-1',
      });
      expect(doc.validateSync()).toBeUndefined();
      expect(doc.status).toBe('active');
      expect(doc.default_currency).toBe('points');
      expect(doc.enrolled_at).toBeInstanceOf(Date);
      expect(doc.closed_at).toBeNull();
    });

    it('rejects an out-of-enum status', () => {
      const doc = new LoyaltyAccountModel({
        account_id: 'acc-1',
        tenant_id: 't-1',
        user_id: 'u-1',
        status: 'paused',
      });
      expect(doc.validateSync()?.errors.status).toBeDefined();
    });
  });

  describe('indexes', () => {
    it('declares the documented composite-unique indexes', () => {
      const indexes = LoyaltyAccountSchema.indexes();
      const names = indexes.map(([def, opts]) => ({
        key: Object.keys(def).join(','),
        unique: opts?.unique === true,
      }));

      expect(names).toEqual(
        expect.arrayContaining([
          { key: 'tenant_id,account_id', unique: true },
          { key: 'tenant_id,user_id', unique: true },
          { key: 'tenant_id,status', unique: false },
        ]),
      );
    });
  });
});
