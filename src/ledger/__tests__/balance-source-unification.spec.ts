/**
 * LCR-1 — Balance source-of-truth unification (review finding F-1).
 *
 * Regression guard for the "split-brain" divergence: before LCR-1 the
 * ledger-derived path (`LedgerService.creditPoints` / `deductPoints`, used by
 * the catalogue, WooCommerce, and RedRoom compliance awards) and the
 * mutable-field path (`PointAccrualService.awardPoints`, `WalletService` escrow)
 * tracked balances in two different stores. A credit through one path was
 * invisible to the other.
 *
 * This test backs all three writers with a single stateful in-memory
 * `WalletModel` fake and asserts that movements made through either path are
 * observed by `WalletService.getUserBalance` — i.e. there is now exactly one
 * authoritative balance.
 */

import { LedgerService } from '../ledger.service';
import { PointAccrualService } from '../../services/point-accrual.service';
import { WalletService } from '../../wallets/wallet.service';
import { TransactionReason } from '../../wallets/types';
import { WalletModel } from '../../db/models/wallet.model';
import { LedgerEntryModel } from '../../db/models/ledger-entry.model';
import { IdempotencyRecordModel } from '../../db/models/idempotency.model';

jest.mock('../../db/models/wallet.model');
jest.mock('../../db/models/ledger-entry.model');
jest.mock('../../db/models/idempotency.model');

interface WalletRec {
  userId: string;
  availableBalance: number;
  escrowBalance: number;
  currency: string;
  version: number;
}

type Filter = {
  userId?: { $eq?: string } | string;
  version?: { $eq?: number };
  availableBalance?: { $gte?: number };
};

describe('LCR-1: unified balance source of truth', () => {
  let ledger: LedgerService;
  let accrual: PointAccrualService;
  let wallets: WalletService;
  let store: Map<string, WalletRec>;

  const uid = (f: Filter): string =>
    typeof f.userId === 'string' ? f.userId : (f.userId?.$eq ?? '');

  const matches = (f: Filter, doc: WalletRec): boolean => {
    if (doc.userId !== uid(f)) return false;
    if (f.version?.$eq !== undefined && doc.version !== f.version.$eq) return false;
    if (
      f.availableBalance?.$gte !== undefined &&
      !(doc.availableBalance >= f.availableBalance.$gte)
    ) {
      return false;
    }
    return true;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    store = new Map();

    ledger = new LedgerService();
    accrual = new PointAccrualService(ledger);
    wallets = new WalletService(ledger);

    // Ledger entries are immutable audit; not under test here.
    (LedgerEntryModel.create as jest.Mock).mockResolvedValue({
      entryId: 'e',
      timestamp: new Date(),
    });
    // Idempotency: never previously seen.
    (IdempotencyRecordModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    });

    (WalletModel.findOne as jest.Mock).mockImplementation((f: Filter) => {
      const doc = store.get(uid(f)) ?? null;
      const result = doc ? { ...doc } : null;
      const thenable: Promise<WalletRec | null> & { lean?: () => Promise<WalletRec | null> } =
        Promise.resolve(result);
      thenable.lean = () => Promise.resolve(result);
      return thenable;
    });

    (WalletModel.create as jest.Mock).mockImplementation((doc: Partial<WalletRec>) => {
      const rec: WalletRec = {
        userId: doc.userId as string,
        availableBalance: doc.availableBalance ?? 0,
        escrowBalance: doc.escrowBalance ?? 0,
        currency: doc.currency ?? 'points',
        version: doc.version ?? 0,
      };
      store.set(rec.userId, rec);
      return Promise.resolve({ ...rec });
    });

    (WalletModel.findOneAndUpdate as jest.Mock).mockImplementation(
      (
        f: Filter,
        update: {
          $inc?: Record<string, number>;
          $set?: Partial<WalletRec>;
          $setOnInsert?: Partial<WalletRec>;
        },
        options: { upsert?: boolean } = {},
      ) => {
        let doc = store.get(uid(f));
        if (!doc) {
          if (!options.upsert) return Promise.resolve(null);
          doc = {
            userId: uid(f),
            availableBalance: 0,
            escrowBalance: 0,
            currency: 'points',
            version: 0,
            ...(update.$setOnInsert as Partial<WalletRec>),
          };
        } else if (!matches(f, doc)) {
          return Promise.resolve(null);
        }
        if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            (doc as unknown as Record<string, number>)[k] =
              ((doc as unknown as Record<string, number>)[k] ?? 0) + v;
          }
        }
        if (update.$set) Object.assign(doc, update.$set);
        store.set(doc.userId, doc);
        return Promise.resolve({ ...doc });
      },
    );
  });

  it('credits via the mutable-field path AND the ledger path land on one balance', async () => {
    const userId = 'conv-user-1';

    // Mutable-field path (point accrual / signup-style earn).
    await accrual.awardPoints({
      userId,
      amount: 1000,
      reason: TransactionReason.ADMIN_CREDIT,
      idempotencyKey: 'k-accrual-1',
      requestId: 'r1',
      tenantId: 'tenant-1',
    });

    // Ledger path (catalogue / WooCommerce / RedRoom compliance award).
    await ledger.creditPoints(userId, 500, 'WOOCOMMERCE_ORDER', 'order points', 'k-ledger-1');

    // The escrow/read path must observe BOTH credits — pre-LCR-1 it saw only 1000.
    const balance = await wallets.getUserBalance(userId);
    expect(balance.available).toBe(1500);
  });

  it('a ledger-path deduction is observed by the escrow/read path', async () => {
    const userId = 'conv-user-2';

    await accrual.awardPoints({
      userId,
      amount: 1000,
      reason: TransactionReason.ADMIN_CREDIT,
      idempotencyKey: 'k-accrual-2',
      requestId: 'r2',
      tenantId: 'tenant-1',
    });

    // Catalogue burn goes through the ledger path.
    await ledger.deductPoints(userId, 300, 'CATALOGUE_REDEEM', 'redeem item', 'k-ledger-2');

    const balance = await wallets.getUserBalance(userId);
    expect(balance.available).toBe(700);
  });

  it('ledger-path deduction respects the unified balance (insufficient funds)', async () => {
    const userId = 'conv-user-3';

    // Only a ledger-path credit exists; it must still gate a later deduction.
    await ledger.creditPoints(userId, 100, 'WOOCOMMERCE_ORDER', 'order points', 'k-ledger-3');

    await expect(
      ledger.deductPoints(userId, 250, 'CATALOGUE_REDEEM', 'too much', 'k-ledger-4'),
    ).rejects.toThrow('insufficient balance');

    const balance = await wallets.getUserBalance(userId);
    expect(balance.available).toBe(100);
  });
});
