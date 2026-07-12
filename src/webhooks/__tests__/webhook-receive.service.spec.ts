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
import { AffiliateSpiffService } from '../../services/affiliate-spiff.service';

describe('WebhookReceiveService (C-007)', () => {
  let service: WebhookReceiveService;
  let idempotency: jest.Mocked<IdempotencyService>;
  let emitService: WebhookEmitService;
  let affiliate: jest.Mocked<AffiliateService>;
  let spiff: jest.Mocked<AffiliateSpiffService>;

  beforeEach(() => {
    idempotency = {
      checkKey: jest.fn(),
      recordKey: jest.fn(),
    } as unknown as jest.Mocked<IdempotencyService>;

    emitService = new WebhookEmitService();
    affiliate = {
      ensureLinkForCreator: jest.fn().mockResolvedValue({ affiliate_id: 'aff-1' }),
    } as unknown as jest.Mocked<AffiliateService>;
    spiff = {
      awardNewAccountSpiff: jest
        .fn()
        .mockResolvedValue({ awarded: true, points: 1000, reason: 'awarded' }),
    } as unknown as jest.Mocked<AffiliateSpiffService>;
    service = new WebhookReceiveService(idempotency, emitService, affiliate, spiff);
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

  it('awards the account spiff on a first-purchase affiliate.award.attributed event', async () => {
    idempotency.checkKey.mockResolvedValue(null);
    idempotency.recordKey.mockResolvedValue(undefined);

    await service.handleIncoming(
      {
        eventId: 'evt-awd-1',
        event: {
          type: 'affiliate.award.attributed',
          tenant_id: 'tenant_1',
          correlation_id: 'corr-awd-1',
          payload: {
            creatorId: 'creator-9',
            referredUserId: 'guest-3',
            isFirstPurchase: true,
          },
        },
      },
      'sig',
      'ts',
      {},
    );

    expect(spiff.awardNewAccountSpiff).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorId: 'creator-9',
        referredUserId: 'guest-3',
        requestId: 'corr-awd-1',
        tenantId: 'tenant_1',
      }),
    );
  });

  it('does not award a spiff when the award is not a first purchase', async () => {
    idempotency.checkKey.mockResolvedValue(null);
    idempotency.recordKey.mockResolvedValue(undefined);

    await service.handleIncoming(
      {
        eventId: 'evt-awd-2',
        event: {
          type: 'affiliate.award.attributed',
          tenant_id: 'tenant_1',
          payload: {
            creatorId: 'creator-9',
            referredUserId: 'guest-3',
            isFirstPurchase: false,
          },
        },
      },
      'sig',
      'ts',
      {},
    );

    expect(spiff.awardNewAccountSpiff).not.toHaveBeenCalled();
  });

  it('skips the spiff (no throw) when creator/referred are missing', async () => {
    idempotency.checkKey.mockResolvedValue(null);
    idempotency.recordKey.mockResolvedValue(undefined);

    const result = await service.handleIncoming(
      {
        eventId: 'evt-awd-3',
        event: {
          type: 'affiliate.award.attributed',
          tenant_id: 'tenant_1',
          payload: { isFirstPurchase: true },
        },
      },
      'sig',
      'ts',
      {},
    );

    expect(result.status).toBe('accepted');
    expect(spiff.awardNewAccountSpiff).not.toHaveBeenCalled();
  });
});
