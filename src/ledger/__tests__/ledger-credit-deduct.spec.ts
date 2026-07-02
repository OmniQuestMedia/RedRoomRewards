/**
 * Unit tests for LedgerService.creditPoints and LedgerService.deductPoints
 *
 * LCR-1: these methods now mutate the authoritative `WalletModel.availableBalance`
 * (the same store the escrow / `getUserBalance` path reads) inside the same
 * transaction as the immutable ledger entry, deriving balanceBefore/After from
 * the post-update wallet document. Tests therefore mock `WalletModel` rather
 * than the ledger snapshot.
 */

import { LedgerService } from '../ledger.service';
import { LedgerEntryModel } from '../../db/models/ledger-entry.model';
import { WalletModel } from '../../db/models/wallet.model';

jest.mock('../../db/models/ledger-entry.model');
jest.mock('../../db/models/idempotency.model');
jest.mock('../../db/models/wallet.model');

describe('LedgerService - creditPoints / deductPoints', () => {
  let service: LedgerService;

  /**
   * Install a WalletModel.findOneAndUpdate mock that emulates an atomic `$inc`
   * against a starting `base` balance, returning the post-update document.
   */
  function mockWalletStartingAt(base: number): void {
    (WalletModel.findOneAndUpdate as jest.Mock).mockImplementation(
      (_filter: unknown, update: { $inc?: { availableBalance?: number } }) => {
        const inc = update?.$inc?.availableBalance ?? 0;
        return Promise.resolve({ availableBalance: base + inc, version: 1 });
      },
    );
    (WalletModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ availableBalance: base }),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LedgerService();

    (LedgerEntryModel.create as jest.Mock).mockImplementation((doc: unknown) => {
      const d = doc as Record<string, unknown>;
      return Promise.resolve({
        entryId: 'entry-test',
        transactionId: 'txn-test',
        ...d,
        timestamp: new Date(),
        currency: 'points',
      });
    });
  });

  describe('creditPoints', () => {
    beforeEach(() => mockWalletStartingAt(0));

    it('returns true on successful credit', async () => {
      const result = await service.creditPoints('user-1', 500, 'TEST_SOURCE', 'signup bonus');
      expect(result).toBe(true);
    });

    it('increments the authoritative WalletModel available balance', async () => {
      await service.creditPoints('user-1b', 500, 'SRC', 'reason');

      expect(WalletModel.findOneAndUpdate).toHaveBeenCalledWith(
        { tenant_id: { $eq: 'oqmi' }, userId: { $eq: 'user-1b' } },
        expect.objectContaining({
          $inc: expect.objectContaining({ availableBalance: 500 }),
        }),
        expect.objectContaining({ upsert: true, new: true }),
      );
    });

    it('writes a credit ledger entry with correct type and balance state', async () => {
      await service.creditPoints('user-2', 250, 'PROMO', 'promo award');

      expect(LedgerEntryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'user-2',
          accountType: 'user',
          type: 'credit',
          amount: 250,
          balanceState: 'available',
          correlationId: 'PROMO',
        }),
      );
    });

    it('stores reason and source in metadata', async () => {
      await service.creditPoints('user-3', 100, 'API', 'referral reward');

      expect(LedgerEntryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { reason: 'referral reward', source: 'API' },
        }),
      );
    });

    it('generates unique idempotency keys per call when none provided', async () => {
      await service.creditPoints('user-4', 50, 'SRC', 'a');
      await service.creditPoints('user-4', 50, 'SRC', 'b');

      const calls = (LedgerEntryModel.create as jest.Mock).mock.calls;
      const key1 = (calls[0][0] as Record<string, unknown>).idempotencyKey as string;
      const key2 = (calls[1][0] as Record<string, unknown>).idempotencyKey as string;
      expect(key1).not.toBe(key2);
    });

    it('uses caller-provided idempotency key when supplied', async () => {
      const callerKey = 'caller-idem-key-abc';
      await service.creditPoints('user-4b', 50, 'SRC', 'a', callerKey);

      expect(LedgerEntryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: callerKey }),
      );
    });

    it('sets balanceAfter = balanceBefore + amount (zero starting balance)', async () => {
      await service.creditPoints('user-5', 300, 'SRC', 'reason');

      expect(LedgerEntryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          balanceBefore: 0,
          balanceAfter: 300,
        }),
      );
    });

    it('rejects zero amount', async () => {
      await expect(service.creditPoints('user-z', 0, 'SRC', 'reason')).rejects.toThrow(
        'amount must be positive',
      );
      expect(LedgerEntryModel.create).not.toHaveBeenCalled();
    });

    it('rejects negative amount', async () => {
      await expect(service.creditPoints('user-z', -10, 'SRC', 'reason')).rejects.toThrow(
        'amount must be positive',
      );
      expect(LedgerEntryModel.create).not.toHaveBeenCalled();
    });
  });

  describe('deductPoints', () => {
    beforeEach(() => mockWalletStartingAt(500));

    it('returns true on successful deduction when balance is sufficient', async () => {
      const result = await service.deductPoints('user-6', 100, 'TEST_SOURCE', 'spend');
      expect(result).toBe(true);
    });

    it('atomically decrements WalletModel with an insufficient-funds guard', async () => {
      await service.deductPoints('user-6b', 100, 'SRC', 'spend');

      expect(WalletModel.findOneAndUpdate).toHaveBeenCalledWith(
        { tenant_id: { $eq: 'oqmi' }, userId: { $eq: 'user-6b' }, availableBalance: { $gte: 100 } },
        expect.objectContaining({
          $inc: expect.objectContaining({ availableBalance: -100 }),
        }),
        expect.objectContaining({ new: true }),
      );
    });

    it('writes a debit ledger entry with correct type and negated amount', async () => {
      await service.deductPoints('user-7', 200, 'BURN', 'redemption');

      expect(LedgerEntryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'user-7',
          accountType: 'user',
          type: 'debit',
          amount: -200,
          balanceState: 'available',
          correlationId: 'BURN',
        }),
      );
    });

    it('stores reason and source in metadata', async () => {
      await service.deductPoints('user-8', 50, 'API', 'point burn');

      expect(LedgerEntryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { reason: 'point burn', source: 'API' },
        }),
      );
    });

    it('uses caller-provided idempotency key when supplied', async () => {
      const callerKey = 'debit-idem-key-xyz';
      await service.deductPoints('user-8b', 50, 'SRC', 'reason', callerKey);

      expect(LedgerEntryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: callerKey }),
      );
    });

    it('rejects deduction when balance is insufficient', async () => {
      // Conditional update matches nothing → null; diagnostic read shows 0.
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      (WalletModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({ availableBalance: 0 }),
      });

      await expect(service.deductPoints('user-9', 75, 'SRC', 'reason')).rejects.toThrow(
        'insufficient balance',
      );
      expect(LedgerEntryModel.create).not.toHaveBeenCalled();
    });

    it('rejects zero amount', async () => {
      await expect(service.deductPoints('user-z', 0, 'SRC', 'reason')).rejects.toThrow(
        'amount must be positive',
      );
      expect(LedgerEntryModel.create).not.toHaveBeenCalled();
    });

    it('rejects negative amount', async () => {
      await expect(service.deductPoints('user-z', -5, 'SRC', 'reason')).rejects.toThrow(
        'amount must be positive',
      );
      expect(LedgerEntryModel.create).not.toHaveBeenCalled();
    });
  });

  describe('awardPromotionalPoints (backward-compatible delegate)', () => {
    it('delegates to creditPoints and returns true', async () => {
      const creditSpy = jest.spyOn(service, 'creditPoints').mockResolvedValue(true);

      const result = await service.awardPromotionalPoints('creator-1', 1000, 'SRC', 'award');

      expect(result).toBe(true);
      expect(creditSpy).toHaveBeenCalledWith('creator-1', 1000, 'SRC', 'award');
    });
  });
});
