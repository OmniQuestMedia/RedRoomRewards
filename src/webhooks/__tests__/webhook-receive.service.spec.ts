/**
 * WebhookReceiveService — unit tests (C-007)
 *
 * Verifies idempotency replay, signature stub pass-through,
 * and missing eventId rejection.
 */

import { WebhookReceiveService } from '../webhook-receive.service';
import { WebhookEmitService } from '../webhook-emit.service';
import { IdempotencyService } from '../../services/idempotency.service';
import { AffiliateService } from '../../services/affiliate.service';

describe('WebhookReceiveService (C-007)', () => {
  let service: WebhookReceiveService;
  let idempotency: jest.Mocked<IdempotencyService>;
  let emitService: WebhookEmitService;
  let affiliate: jest.Mocked<AffiliateService>;

  beforeEach(() => {
    idempotency = {
      checkKey: jest.fn(),
      recordKey: jest.fn(),
    } as unknown as jest.Mocked<IdempotencyService>;

    emitService = new WebhookEmitService();
    affiliate = {
      ensureLinkForCreator: jest.fn().mockResolvedValue({ affiliate_id: 'aff-1' }),
    } as unknown as jest.Mocked<AffiliateService>;
    service = new WebhookReceiveService(idempotency, emitService, affiliate);
  });

  it('accepts and records a new webhook event', async () => {
    idempotency.checkKey.mockResolvedValue(null);
    idempotency.recordKey.mockResolvedValue(undefined);

    const result = await service.handleIncoming({ eventId: 'evt-123' }, 'sig', 'ts', {});

    expect(result.status).toBe('accepted');
    expect(result.eventId).toBe('evt-123');
    expect(idempotency.checkKey).toHaveBeenCalledWith('evt-123', 'system', 'webhook_receive');
    expect(idempotency.recordKey).toHaveBeenCalledWith('evt-123', 'system', 'webhook_receive', {
      status: 'accepted',
      eventId: 'evt-123',
    });
  });

  it('returns cached result on idempotent replay', async () => {
    const cached = { status: 'accepted', eventId: 'evt-123' };
    idempotency.checkKey.mockResolvedValue(cached);

    const result = await service.handleIncoming({ eventId: 'evt-123' }, 'sig', 'ts', {});

    expect(result).toEqual(cached);
    expect(idempotency.recordKey).not.toHaveBeenCalled();
  });

  it('uses payload.id when eventId field is absent', async () => {
    idempotency.checkKey.mockResolvedValue(null);
    idempotency.recordKey.mockResolvedValue(undefined);

    const result = await service.handleIncoming({ id: 'evt-456' }, 'sig', 'ts', {});

    expect(result.eventId).toBe('evt-456');
  });

  it('throws when both eventId and id are absent', async () => {
    await expect(service.handleIncoming({ foo: 'bar' }, 'sig', 'ts', {})).rejects.toThrow(
      'Missing eventId in webhook payload',
    );
  });

  it('auto-provisions an affiliate link on a CreatorRegistered envelope', async () => {
    idempotency.checkKey.mockResolvedValue(null);
    idempotency.recordKey.mockResolvedValue(undefined);

    await service.handleIncoming(
      {
        eventId: 'evt-cr-1',
        event: {
          type: 'CreatorRegistered',
          tenant_id: 'tenant_1',
          correlation_id: 'corr-1',
          payload: { account_id: 'acc-9', origin_platform: 'synthimates' },
        },
      },
      'sig',
      'ts',
      {},
    );

    expect(affiliate.ensureLinkForCreator).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant_1',
        creator_id: 'acc-9',
        external_creator_ref: 'acc-9',
        platform: 'synthimate',
        correlation_id: 'corr-1',
      }),
    );
  });

  it('does not provision for non-creator event types', async () => {
    idempotency.checkKey.mockResolvedValue(null);
    idempotency.recordKey.mockResolvedValue(undefined);

    await service.handleIncoming(
      { eventId: 'evt-x', type: 'UserRegistered', payload: { account_id: 'acc-1' } },
      'sig',
      'ts',
      {},
    );

    expect(affiliate.ensureLinkForCreator).not.toHaveBeenCalled();
  });

  it('skips provisioning (no throw) when tenant/account are missing', async () => {
    idempotency.checkKey.mockResolvedValue(null);
    idempotency.recordKey.mockResolvedValue(undefined);

    const result = await service.handleIncoming(
      { eventId: 'evt-bad', event: { type: 'CreatorRegistered', payload: {} } },
      'sig',
      'ts',
      {},
    );

    expect(result.status).toBe('accepted');
    expect(affiliate.ensureLinkForCreator).not.toHaveBeenCalled();
  });
});
