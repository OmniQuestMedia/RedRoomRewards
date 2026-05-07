import { TenantModel, TenantSchema } from '../Tenant';

describe('Tenant model (B-001)', () => {
  it('creates a valid tenant document', () => {
    const doc = new TenantModel({ slug: 'redroom', name: 'RedRoom', status: 'active' });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.created_at).toBeInstanceOf(Date);
  });

  it('declares a unique slug constraint', () => {
    const path = TenantSchema.path('slug') as unknown as { options: { unique: boolean } };
    expect(path.options.unique).toBe(true);
  });

  it('declares unique slug index for lookup', () => {
    const hasSlugIndex = TenantSchema.indexes().some(
      ([def, options]) => def.slug === 1 && options?.unique === true,
    );
    expect(hasSlugIndex).toBe(true);
  });
});
