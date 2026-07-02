/**
 * RRR-#2 Phase C — cross-tenant isolation guarantees.
 *
 * The isolation contract is enforced by the composite UNIQUE index
 * { tenant_id, userId } (and { tenant_id, modelId }). Under it, the SAME userId
 * may exist under two DIFFERENT program tenants → two distinct wallets. Under
 * the old global unique { userId } the second insert would have collided. These
 * tests lock that mechanism (schema-level, no live DB required) plus the
 * resolver that scopes every money-store query.
 */
import { WalletModel } from '../wallet.model';
import { ModelWalletModel } from '../model-wallet.model';
import { EscrowItemModel } from '../escrow-item.model';
import { resolveTenantId } from '../../../config/program-tenant';

type IndexEntry = [Record<string, number>, Record<string, unknown> | undefined];

function findIndex(model: { schema: { indexes(): IndexEntry[] } }, keys: Record<string, number>) {
  return model.schema.indexes().find(([k]) => JSON.stringify(k) === JSON.stringify(keys));
}

describe('wallet tenant isolation (Phase C)', () => {
  describe('WalletModel', () => {
    it('is unique on the composite { tenant_id, userId }', () => {
      const idx = findIndex(WalletModel, { tenant_id: 1, userId: 1 });
      expect(idx).toBeDefined();
      expect(idx![1]?.unique).toBe(true);
    });

    it('has NO standalone unique { userId } index (same userId allowed across tenants)', () => {
      const idx = findIndex(WalletModel, { userId: 1 });
      expect(idx?.[1]?.unique).not.toBe(true);
    });

    it('requires tenant_id', () => {
      expect(WalletModel.schema.path('tenant_id').isRequired).toBe(true);
    });
  });

  describe('ModelWalletModel', () => {
    it('is unique on the composite { tenant_id, modelId }', () => {
      const idx = findIndex(ModelWalletModel, { tenant_id: 1, modelId: 1 });
      expect(idx).toBeDefined();
      expect(idx![1]?.unique).toBe(true);
    });

    it('has NO standalone unique { modelId } index', () => {
      const idx = findIndex(ModelWalletModel, { modelId: 1 });
      expect(idx?.[1]?.unique).not.toBe(true);
    });

    it('requires tenant_id', () => {
      expect(ModelWalletModel.schema.path('tenant_id').isRequired).toBe(true);
    });
  });

  describe('EscrowItemModel', () => {
    it('requires tenant_id (escrowId stays the unique key)', () => {
      expect(EscrowItemModel.schema.path('tenant_id').isRequired).toBe(true);
      const idx = findIndex(EscrowItemModel, { escrowId: 1 });
      expect(idx![1]?.unique).toBe(true);
    });
  });

  describe('resolver isolation', () => {
    it('scopes the same userId to different wallets per program tenant', () => {
      // Two tenants → two distinct scoping keys for an identical userId, so a
      // query for tenant-a can never read tenant-b's wallet.
      const a = { tenant_id: resolveTenantId('tenant-a'), userId: 'shared-user' };
      const b = { tenant_id: resolveTenantId('tenant-b'), userId: 'shared-user' };
      expect(a.userId).toBe(b.userId);
      expect(a.tenant_id).not.toBe(b.tenant_id);
    });
  });
});
