import mongoose from 'mongoose';
import { IdentityLinkModel, IdentityLinkSchema } from '../IdentityLink';

describe('IdentityLink model (B-002)', () => {
  it('creates a valid identity-link document', () => {
    const doc = new IdentityLinkModel({
      loyalty_account_id: new mongoose.Types.ObjectId(),
      merchant_id: new mongoose.Types.ObjectId(),
      external_account_ref: 'external-ref-1',
      status: 'active',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.created_at).toBeInstanceOf(Date);
  });

  it('declares unique merchant_id + external_account_ref index for lookup', () => {
    const hasUniqueIndex = IdentityLinkSchema.indexes().some(
      ([def, options]) =>
        def.merchant_id === 1 && def.external_account_ref === 1 && options?.unique === true,
    );
    expect(hasUniqueIndex).toBe(true);
  });

  it('rejects status values outside active/suspended', () => {
    const doc = new IdentityLinkModel({
      loyalty_account_id: new mongoose.Types.ObjectId(),
      merchant_id: new mongoose.Types.ObjectId(),
      external_account_ref: 'external-ref-2',
      status: 'revoked',
    });
    expect(doc.validateSync()?.errors.status).toBeDefined();
  });
});
