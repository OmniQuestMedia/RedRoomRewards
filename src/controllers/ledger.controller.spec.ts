/**
 * Tests for the Nest transport wrapper around the ledger API — the §3.1 balance
 * aggregate route. Business logic lives in src/api/ledger.controller.ts (covered
 * by its own spec); here we cover the route wiring + input validation.
 */
import { BadRequestException } from '@nestjs/common';
import { LedgerController } from './ledger.controller';

function makeService(snapshot: unknown) {
  return {
    getBalanceSnapshot: jest.fn().mockResolvedValue(snapshot),
  } as never;
}

describe('LedgerController (Nest transport) — GET /ledger/balance/:userId', () => {
  it('returns the aggregate balance (buckets + computed total)', async () => {
    const svc = makeService({
      accountId: 'u1',
      accountType: 'user',
      availableBalance: 300,
      escrowBalance: 50,
      asOf: new Date('2026-01-01T00:00:00Z'),
      currency: 'points',
    });
    const ctrl = new LedgerController(svc);

    const res = await ctrl.getBalance('u1');
    expect(res).toEqual({
      userId: 'u1',
      available: 300,
      escrow: 50,
      total: 350,
      asOf: '2026-01-01T00:00:00.000Z',
    });
    expect(
      (svc as unknown as { getBalanceSnapshot: jest.Mock }).getBalanceSnapshot,
    ).toHaveBeenCalledWith('u1', 'user');
  });

  it('rejects a missing/blank userId', async () => {
    const ctrl = new LedgerController(makeService({}));
    await expect(ctrl.getBalance('   ')).rejects.toBeInstanceOf(BadRequestException);
  });
});
