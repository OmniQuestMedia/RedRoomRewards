import { DEFAULT_PROGRAM_TENANT_ID, getProgramTenantId, resolveTenantId } from '../program-tenant';

describe('program-tenant', () => {
  const original = process.env.RRR_PROGRAM_TENANT_ID;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RRR_PROGRAM_TENANT_ID;
    } else {
      process.env.RRR_PROGRAM_TENANT_ID = original;
    }
  });

  describe('getProgramTenantId', () => {
    it('returns the configured program tenant when set', () => {
      process.env.RRR_PROGRAM_TENANT_ID = 'oqmi';
      expect(getProgramTenantId()).toBe('oqmi');
    });

    it('trims surrounding whitespace', () => {
      process.env.RRR_PROGRAM_TENANT_ID = '  acme  ';
      expect(getProgramTenantId()).toBe('acme');
    });

    it('falls back to the canonical default when unset', () => {
      delete process.env.RRR_PROGRAM_TENANT_ID;
      expect(getProgramTenantId()).toBe(DEFAULT_PROGRAM_TENANT_ID);
    });

    it('falls back to the canonical default when empty', () => {
      process.env.RRR_PROGRAM_TENANT_ID = '   ';
      expect(getProgramTenantId()).toBe(DEFAULT_PROGRAM_TENANT_ID);
    });
  });

  describe('resolveTenantId', () => {
    it('prefers an explicit request-context tenant', () => {
      process.env.RRR_PROGRAM_TENANT_ID = 'oqmi';
      expect(resolveTenantId('other-tenant')).toBe('other-tenant');
    });

    it('falls back to the program tenant when explicit is empty/undefined', () => {
      process.env.RRR_PROGRAM_TENANT_ID = 'oqmi';
      expect(resolveTenantId(undefined)).toBe('oqmi');
      expect(resolveTenantId('')).toBe('oqmi');
      expect(resolveTenantId(null)).toBe('oqmi');
    });
  });
});
