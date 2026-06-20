/**
 * Wave B Core (B-001, B-002, B-006) tests.
 *
 * Covers WalletController -> LedgerService wiring and verifies the
 * transaction-safety wrapper added in B-006: the credit/deduct paths run
 * inside a Mongoose session via `withTransaction` when one is available, and
 * fall back to non-transactional execution when the topology does not
 * support transactions (so unit tests without a replica set still pass).
 */

import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import { WalletController } from '../controllers/wallet.controller';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerEntryModel } from '../db/models/ledger-entry.model';
import { WalletModel } from '../db/models/wallet.model';

jest.mock('../db/models/ledger-entry.model');
jest.mock('../db/models/idempotency.model');
jest.mock('../db/models/wallet.model');

describe('Wave B Core — Wallet credit/deduct', () => {
  let controller: WalletController;
  let ledger: LedgerService;
  let originalReadyStateDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [{ provide: LedgerService, useFactory: () => new LedgerService() }],
    }).compile();

    controller = module.get(WalletController);
    ledger = module.get(LedgerService);
    jest.clearAllMocks();

    // LCR-1: credit/deduct now mutate the authoritative WalletModel balance.
    // Default mock emulates an atomic `$inc` from a zero starting balance.
    (WalletModel.findOneAndUpdate as jest.Mock).mockImplementation(
      (_filter: unknown, update: { $inc?: { availableBalance?: number } }) => {
        const inc = update?.$inc?.availableBalance ?? 0;
        return Promise.resolve({ availableBalance: inc, version: 1 });
      },
    );
    (WalletModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ availableBalance: 0 }),
    });

    originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(
      mongoose.connection,
      'readyState',
    );
  });

  afterEach(() => {
    if (originalReadyStateDescriptor) {
      Object.defineProperty(mongoose.connection, 'readyState', originalReadyStateDescriptor);
    }
  });

  function fakeConnected() {
    Object.defineProperty(mongoose.connection, 'readyState', {
      configurable: true,
      get: () => 1,
    });
  }

  describe('LedgerService transaction safety (B-006)', () => {
    function mockBalance(available: number) {
      (LedgerEntryModel.find as jest.Mock).mockReturnValueOnce({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ balanceState: 'available', balanceAfter: available }]),
      });
    }

    it('runs creditPoints inside a withTransaction session when sessions are available', async () => {
      mockBalance(0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session: any = {
        withTransaction: jest.fn(async (cb: () => Promise<void>) => {
          await cb();
        }),
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      fakeConnected();
      const startSpy = jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
      (LedgerEntryModel.create as jest.Mock).mockImplementation(async (docs: unknown) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        return arr.map((d) => ({ ...(d as object), entryId: 'e-1', timestamp: new Date() }));
      });

      const ok = await ledger.creditPoints('user-1', 5000, 'test', 'award');

      expect(ok).toBe(true);
      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(session.endSession).toHaveBeenCalledTimes(1);
      expect(LedgerEntryModel.create).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ accountId: 'user-1', amount: 5000 })]),
        expect.objectContaining({ session }),
      );

      startSpy.mockRestore();
    });

    it('falls back to a non-transactional run when withTransaction reports no replica set', async () => {
      mockBalance(0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session: any = {
        withTransaction: jest
          .fn()
          .mockRejectedValue(
            new Error('Transaction numbers are only allowed on a replica set member or mongos'),
          ),
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      fakeConnected();
      const startSpy = jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
      (LedgerEntryModel.create as jest.Mock).mockResolvedValue({
        entryId: 'e-2',
        timestamp: new Date(),
      });

      const ok = await ledger.creditPoints('user-2', 1000, 'test', 'award');

      expect(ok).toBe(true);
      // First create call (inside transaction) used array+session form; the
      // fallback then re-invokes with the plain doc form (no session).
      const lastCall = (LedgerEntryModel.create as jest.Mock).mock.calls.at(-1);
      expect(Array.isArray(lastCall?.[0])).toBe(false);
      expect(session.endSession).toHaveBeenCalled();

      startSpy.mockRestore();
    });

    it('rejects deductPoints when balance is insufficient', async () => {
      mockBalance(100);
      // Conditional `availableBalance >= amount` update matches nothing.
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({ availableBalance: 100 }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session: any = {
        withTransaction: jest.fn(async (cb: () => Promise<void>) => {
          await cb();
        }),
        endSession: jest.fn().mockResolvedValue(undefined),
      };
      fakeConnected();
      const startSpy = jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);

      await expect(ledger.deductPoints('user-3', 5000, 'test', 'burn')).rejects.toThrow(
        'insufficient balance',
      );

      startSpy.mockRestore();
    });
  });

  describe('WalletController wiring (B-001, B-002)', () => {
    it('routes /wallet/credit to LedgerService.creditPoints', async () => {
      const spy = jest.spyOn(ledger, 'creditPoints').mockResolvedValue(true);

      const res = await controller.credit({
        accountId: 'guest-1',
        amount: 500,
        reason: 'welcome',
        idempotencyKey: 'idem-credit-1',
      });

      expect(res).toEqual({ ok: true });
      expect(spy).toHaveBeenCalledWith('guest-1', 500, 'API', 'welcome', 'idem-credit-1');
    });

    it('routes /wallet/deduct to LedgerService.deductPoints', async () => {
      const spy = jest.spyOn(ledger, 'deductPoints').mockResolvedValue(true);

      const res = await controller.deduct({
        accountId: 'guest-2',
        amount: 100,
        reason: 'redeem',
        idempotencyKey: 'idem-debit-1',
      });

      expect(res).toEqual({ ok: true });
      expect(spy).toHaveBeenCalledWith('guest-2', 100, 'API', 'redeem', 'idem-debit-1');
    });

    it('passes through caller-supplied source when provided', async () => {
      const spy = jest.spyOn(ledger, 'creditPoints').mockResolvedValue(true);

      await controller.credit({
        accountId: 'guest-3',
        amount: 250,
        reason: 'promo',
        source: 'REDROOM_REWARDS',
      });

      expect(spy).toHaveBeenCalledWith('guest-3', 250, 'REDROOM_REWARDS', 'promo', undefined);
    });
  });
});
