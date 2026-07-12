import { AffiliateSpiffService } from './affiliate-spiff.service';
import type { PointAccrualService } from './point-accrual.service';
import type { AffiliateSpiffLever } from './affiliate-spiff.config';

const activeLever: AffiliateSpiffLever = {
  enabled: true,
  startsAt: null,
  endsAt: null,
  points: 1000,
};

function mockAccrual(awardImpl?: jest.Mock): PointAccrualService {
  return {
    awardReferralBonus:
      awardImpl ??
      jest.fn().mockResolvedValue({
        transactionId: 'tx-1',
        amountAwarded: 1000,
        newBalance: 1000,
        timestamp: new Date(),
      }),
  } as unknown as PointAccrualService;
}

const baseInput = {
  creatorId: 'creator-1',
  referredUserId: 'guest-9',
  requestId: 'req-1',
  tenantId: 'tenant-1',
};

describe('AffiliateSpiffService', () => {
  it('awards 1000 points to the referring creator when the lever is active', async () => {
    const award = jest.fn().mockResolvedValue({ transactionId: 'tx-9' });
    const svc = new AffiliateSpiffService(mockAccrual(award), activeLever);

    const res = await svc.awardNewAccountSpiff(baseInput);

    expect(res).toMatchObject({
      awarded: true,
      points: 1000,
      reason: 'awarded',
      transactionId: 'tx-9',
    });
    expect(award).toHaveBeenCalledWith('creator-1', 'guest-9', 1000, 'req-1', 'tenant-1');
  });

  it('does not award when the lever is disabled', async () => {
    const award = jest.fn();
    const svc = new AffiliateSpiffService(mockAccrual(award), { ...activeLever, enabled: false });

    const res = await svc.awardNewAccountSpiff(baseInput);

    expect(res).toMatchObject({ awarded: false, reason: 'lever_inactive' });
    expect(award).not.toHaveBeenCalled();
  });

  it('does not award outside the configured window', async () => {
    const award = jest.fn();
    const svc = new AffiliateSpiffService(mockAccrual(award), {
      ...activeLever,
      startsAt: '2027-01-01T00:00:00.000Z',
    });

    const res = await svc.awardNewAccountSpiff({
      ...baseInput,
      at: new Date('2026-07-12T00:00:00Z'),
    });

    expect(res.reason).toBe('lever_inactive');
    expect(award).not.toHaveBeenCalled();
  });

  it('treats a redelivered signal as already_awarded (idempotent)', async () => {
    const award = jest.fn().mockRejectedValue(new Error('Idempotency key already used'));
    const svc = new AffiliateSpiffService(mockAccrual(award), activeLever);

    const res = await svc.awardNewAccountSpiff(baseInput);

    expect(res).toMatchObject({ awarded: false, reason: 'already_awarded', points: 1000 });
  });

  it('propagates non-idempotency errors', async () => {
    const award = jest.fn().mockRejectedValue(new Error('wallet down'));
    const svc = new AffiliateSpiffService(mockAccrual(award), activeLever);

    await expect(svc.awardNewAccountSpiff(baseInput)).rejects.toThrow('wallet down');
  });
});
