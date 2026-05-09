import mongoose from 'mongoose';
import { MERCHANT_TIERS, MerchantModel, MerchantSchema } from '../Merchant';

describe('Merchant model (B-001)', () => {
  it('creates a valid merchant document', () => {
    const doc = new MerchantModel({
      tenant_id: new mongoose.Types.ObjectId(),
      slug: 'cyrano',
      name: 'Cyrano',
      merchant_tier: 'GOLD',
      phase: 1,
      status: 'active',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('supports all required merchant tiers', () => {
    expect(MERCHANT_TIERS).toEqual(['PLATINUM', 'GOLD', 'SILVER', 'MEMBER', 'GUEST']);
  });

  it('declares unique tenant_id + slug index for lookup', () => {
    const hasUniqueTenantSlug = MerchantSchema.indexes().some(
      ([def, options]) => def.tenant_id === 1 && def.slug === 1 && options?.unique === true,
    );
    expect(hasUniqueTenantSlug).toBe(true);
  });
});
