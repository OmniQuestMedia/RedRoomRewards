import mongoose from 'mongoose';
import { LoyaltyAccountModel, LoyaltyAccountSchema, RRR_MEMBER_TIERS } from '../LoyaltyAccount';

describe('LoyaltyAccount model (B-002)', () => {
  it('creates a valid loyalty account document', () => {
    const doc = new LoyaltyAccountModel({
      tenant_id: new mongoose.Types.ObjectId(),
      external_user_id: 'external-user-1',
      rrr_member_tier: 'GOLD',
      status: 'active',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.created_at).toBeInstanceOf(Date);
  });

  it('supports nullable and enumerated rrr_member_tier values', () => {
    expect(RRR_MEMBER_TIERS).toEqual(['PLATINUM', 'GOLD', 'SILVER', 'MEMBER', 'GUEST']);

    const nullableDoc = new LoyaltyAccountModel({
      tenant_id: new mongoose.Types.ObjectId(),
      external_user_id: 'external-user-2',
      status: 'active',
    });
    expect(nullableDoc.validateSync()).toBeUndefined();
    expect(nullableDoc.rrr_member_tier).toBeNull();
  });

  it('declares unique tenant_id + external_user_id index for lookup', () => {
    const hasUniqueIndex = LoyaltyAccountSchema.indexes().some(
      ([def, options]) =>
        def.tenant_id === 1 && def.external_user_id === 1 && options?.unique === true,
    );
    expect(hasUniqueIndex).toBe(true);
  });
});
