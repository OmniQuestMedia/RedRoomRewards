import { VipDfspHookService } from './vip-dfsp-hook.service';

describe('VipDfspHookService', () => {
  let service: VipDfspHookService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['DFSP_WEBHOOK_URL'];
    service = new VipDfspHookService();
  });

  afterEach(() => {
    delete process.env['DFSP_WEBHOOK_URL'];
  });

  describe('onVipUpgrade', () => {
    it('resolves without error for SILVER upgrade', async () => {
      await expect(
        service.onVipUpgrade({
          tenant_id: 't-1',
          member_id: 'member-1',
          previous_tier: null,
          new_tier: 'SILVER',
          correlation_id: 'corr-1',
        }),
      ).resolves.toBeUndefined();
    });

    it('resolves without error for DIAMOND upgrade from GOLD', async () => {
      await expect(
        service.onVipUpgrade({
          tenant_id: 't-1',
          member_id: 'member-2',
          previous_tier: 'GOLD',
          new_tier: 'DIAMOND',
          correlation_id: 'corr-2',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifyDfsp', () => {
    const baseEvent = {
      tenant_id: 't-1',
      member_id: 'member-1',
      event_type: 'POINTS_EARNED' as const,
      points_delta: 500,
      correlation_id: 'corr-1',
    };

    it('returns not-delivered when DFSP_WEBHOOK_URL is not set', async () => {
      const result = await service.notifyDfsp(baseEvent);

      expect(result.delivered).toBe(false);
      expect(result.endpoint).toBeNull();
      expect(result.skipped_reason).toBe('DFSP_WEBHOOK_URL not configured');
    });

    it('returns stub result with endpoint when DFSP_WEBHOOK_URL is set', async () => {
      process.env['DFSP_WEBHOOK_URL'] = 'https://dfsp.example.com/loyalty';

      const result = await service.notifyDfsp(baseEvent);

      expect(result.delivered).toBe(false);
      expect(result.endpoint).toBe('https://dfsp.example.com/loyalty');
      expect(result.skipped_reason).toMatch(/stub/);
    });

    it('handles POINTS_REDEEMED event type', async () => {
      const result = await service.notifyDfsp({ ...baseEvent, event_type: 'POINTS_REDEEMED' });
      expect(result.delivered).toBe(false);
    });

    it('handles CHARGEBACK event type', async () => {
      const result = await service.notifyDfsp({ ...baseEvent, event_type: 'CHARGEBACK' });
      expect(result.delivered).toBe(false);
    });
  });
});
