import {
  OkibIntegrationService,
  loadOkibConfig,
  OkibContextRequest,
} from './okib-integration.service';

jest.mock('../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const req: OkibContextRequest = {
  tenantId: 'redroompleasures',
  memberRef: 'member-opaque-001',
  correlationId: 'corr-1',
};

describe('OkibIntegrationService', () => {
  describe('loadOkibConfig', () => {
    it('disabled by default when OKIB_ENABLED is unset', () => {
      expect(loadOkibConfig({}).enabled).toBe(false);
    });

    it('enabled only on the exact string "true"', () => {
      expect(loadOkibConfig({ OKIB_ENABLED: 'true' }).enabled).toBe(true);
      expect(loadOkibConfig({ OKIB_ENABLED: '1' }).enabled).toBe(false);
      expect(loadOkibConfig({ OKIB_ENABLED: 'TRUE' }).enabled).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('false when flag off', () => {
      const svc = new OkibIntegrationService({ enabled: false });
      expect(svc.isEnabled()).toBe(false);
    });

    it('fails open (false) when enabled but baseUrl/apiKey missing', () => {
      const svc = new OkibIntegrationService({ enabled: true });
      expect(svc.isEnabled()).toBe(false);
    });

    it('true only when enabled and fully configured', () => {
      const svc = new OkibIntegrationService({
        enabled: true,
        baseUrl: 'https://okib.example.com',
        apiKey: 'k',
      });
      expect(svc.isEnabled()).toBe(true);
    });
  });

  describe('context methods return neutral results when disabled', () => {
    const svc = new OkibIntegrationService({ enabled: false });

    it('getPersonalizedProductContext', async () => {
      await expect(svc.getPersonalizedProductContext(req)).resolves.toEqual({
        enabled: false,
        hints: [],
      });
    });

    it('getEngagementNudges', async () => {
      await expect(svc.getEngagementNudges(req)).resolves.toEqual({
        enabled: false,
        nudges: [],
      });
    });

    it('getCreatorAffinity', async () => {
      await expect(svc.getCreatorAffinity(req)).resolves.toEqual({
        enabled: false,
        creatorId: null,
        confidence: 0,
      });
    });
  });

  describe('context methods return enabled placeholder when fully configured', () => {
    const svc = new OkibIntegrationService({
      enabled: true,
      baseUrl: 'https://okib.example.com',
      apiKey: 'k',
    });

    it('product context is enabled but empty (placeholder)', async () => {
      await expect(svc.getPersonalizedProductContext(req)).resolves.toEqual({
        enabled: true,
        hints: [],
      });
    });

    it('creator affinity is enabled but unresolved (placeholder)', async () => {
      await expect(svc.getCreatorAffinity(req)).resolves.toEqual({
        enabled: true,
        creatorId: null,
        confidence: 0,
      });
    });
  });
});
