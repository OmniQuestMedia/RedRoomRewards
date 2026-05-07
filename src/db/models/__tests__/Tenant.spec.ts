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

  it('keeps slug discoverable for lookup via schema index metadata', () => {
    const indexes = TenantSchema.indexes();
    const hasSlugIndex = indexes.some(([def]) => def.slug === 1);
    expect(hasSlugIndex).toBe(true);
  });
});
