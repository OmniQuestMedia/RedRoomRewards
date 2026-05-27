/**
 * AdminOpsService — unit tests (B-013)
 *
 * Full coverage of src/services/admin-ops.service.ts.
 * All database and ledger calls are mocked.
 */

import {
  AdminOpsService,
  AdminContext,
  ManualAdjustmentRequest,
  AdminRefundRequest,
  BalanceCorrectionRequest,
} from './admin-ops.service';
import { ILedgerService, LedgerEntry, LedgerQueryResult } from '../ledger/types';
import { IWalletService } from './types';
import { WalletModel } from '../db/models/wallet.model';
import { TransactionReason } from '../wallets/types';

jest.mock('../db/models/wallet.model');

const mockLedgerService: jest.Mocked<ILedgerService> = {
  createEntry: jest.fn(),
  queryEntries: jest.fn(),
  getEntry: jest.fn(),
  getBalanceSnapshot: jest.fn(),
  generateReconciliationReport: jest.fn(),
  getAuditTrail: jest.fn(),
  checkIdempotency: jest.fn(),
  claimIdempotency: jest.fn(),
  storeIdempotencyResult: jest.fn(),
  creditPoints: jest.fn(),
  deductPoints: jest.fn(),
  withTransaction: jest.fn(),
} as unknown as jest.Mocked<ILedgerService>;

const mockWalletService = {} as jest.Mocked<IWalletService>;

const adminCtx: AdminContext = {
  adminId: 'admin-001',
  adminUsername: 'testadmin',
  roles: ['admin'],
  ipAddress: '127.0.0.1',
};

const makeWallet = (balance = 500, version = 1) => ({
  userId: 'user-001',
  availableBalance: balance,
  version,
});

describe('AdminOpsService (B-013)', () => {
  let service: AdminOpsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminOpsService(mockLedgerService, mockWalletService);
  });

  // ─── instantiation ────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates an instance with default config', () => {
      expect(service).toBeDefined();
    });

    it('accepts partial config overrides', () => {
      const svc = new AdminOpsService(mockLedgerService, mockWalletService, {
        maxAdjustmentAmount: 500,
        requireReason: false,
      });
      expect(svc).toBeDefined();
    });
  });

  // ─── manualAdjustment ─────────────────────────────────────────────────────

  describe('manualAdjustment', () => {
    const baseRequest = (): ManualAdjustmentRequest => ({
      userId: 'user-001',
      amount: 100,
      reason: 'Test credit',
      admin: adminCtx,
      requestId: 'req-001',
    });

    it('credits points and returns adjustment response', async () => {
      const wallet = makeWallet(500);
      (WalletModel.findOne as jest.Mock).mockResolvedValue(wallet);
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...wallet,
        availableBalance: 600,
      });
      (mockLedgerService.createEntry as jest.Mock).mockResolvedValue({} as LedgerEntry);

      const result = await service.manualAdjustment(baseRequest());

      expect(result.amountAdjusted).toBe(100);
      expect(result.previousBalance).toBe(500);
      expect(result.newBalance).toBe(600);
      expect(result.transactionId).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('debits points when amount is negative', async () => {
      const wallet = makeWallet(500);
      (WalletModel.findOne as jest.Mock).mockResolvedValue(wallet);
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...wallet,
        availableBalance: 400,
      });
      (mockLedgerService.createEntry as jest.Mock).mockResolvedValue({} as LedgerEntry);

      const result = await service.manualAdjustment({ ...baseRequest(), amount: -100 });

      expect(result.amountAdjusted).toBe(-100);
      expect(result.newBalance).toBe(400);
    });

    it('throws when amount is zero', async () => {
      await expect(service.manualAdjustment({ ...baseRequest(), amount: 0 })).rejects.toThrow(
        'Adjustment amount cannot be zero',
      );
    });

    it('throws when amount exceeds max adjustment limit', async () => {
      await expect(
        service.manualAdjustment({ ...baseRequest(), amount: 2_000_000 }),
      ).rejects.toThrow('exceeds maximum');
    });

    it('throws when reason is missing and requireReason=true', async () => {
      await expect(service.manualAdjustment({ ...baseRequest(), reason: '' })).rejects.toThrow(
        'Reason is required',
      );
    });

    it('proceeds without reason when requireReason=false', async () => {
      const svc = new AdminOpsService(mockLedgerService, mockWalletService, {
        requireReason: false,
      });
      const wallet = makeWallet(500);
      (WalletModel.findOne as jest.Mock).mockResolvedValue(wallet);
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...wallet,
        availableBalance: 600,
      });
      (mockLedgerService.createEntry as jest.Mock).mockResolvedValue({} as LedgerEntry);

      const result = await svc.manualAdjustment({ ...baseRequest(), reason: '' });
      expect(result.amountAdjusted).toBe(100);
    });

    it('throws when wallet not found', async () => {
      (WalletModel.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.manualAdjustment(baseRequest())).rejects.toThrow('Wallet not found');
    });

    it('throws when debit would result in negative balance', async () => {
      const wallet = makeWallet(50);
      (WalletModel.findOne as jest.Mock).mockResolvedValue(wallet);
      await expect(service.manualAdjustment({ ...baseRequest(), amount: -100 })).rejects.toThrow(
        'negative balance',
      );
    });

    it('allows negative balance when allowNegative metadata flag is set', async () => {
      const wallet = makeWallet(50);
      (WalletModel.findOne as jest.Mock).mockResolvedValue(wallet);
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...wallet,
        availableBalance: -50,
      });
      (mockLedgerService.createEntry as jest.Mock).mockResolvedValue({} as LedgerEntry);

      const result = await service.manualAdjustment({
        ...baseRequest(),
        amount: -100,
        metadata: { allowNegative: true },
      });
      expect(result.newBalance).toBe(-50);
    });

    it('retries once on optimistic lock conflict (null updated)', async () => {
      const wallet = makeWallet(500);
      (WalletModel.findOne as jest.Mock).mockResolvedValue(wallet);
      (WalletModel.findOneAndUpdate as jest.Mock)
        .mockResolvedValueOnce(null) // first attempt: conflict
        .mockResolvedValue({ ...wallet, availableBalance: 600 }); // retry
      (mockLedgerService.createEntry as jest.Mock).mockResolvedValue({} as LedgerEntry);

      const result = await service.manualAdjustment(baseRequest());
      expect(result.newBalance).toBe(600);
      expect(WalletModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });

    it('throws when admin context is invalid (no roles)', async () => {
      await expect(
        service.manualAdjustment({
          ...baseRequest(),
          admin: { ...adminCtx, roles: [] },
        }),
      ).rejects.toThrow('Invalid admin context');
    });

    it('throws when admin lacks required role', async () => {
      await expect(
        service.manualAdjustment({
          ...baseRequest(),
          admin: { ...adminCtx, roles: ['viewer'] },
        }),
      ).rejects.toThrow('Insufficient permissions');
    });

    it('accepts super_admin and finance_admin roles', async () => {
      for (const role of ['super_admin', 'finance_admin']) {
        const wallet = makeWallet(500);
        (WalletModel.findOne as jest.Mock).mockResolvedValue(wallet);
        (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
          ...wallet,
          availableBalance: 600,
        });
        (mockLedgerService.createEntry as jest.Mock).mockResolvedValue({} as LedgerEntry);

        const result = await service.manualAdjustment({
          ...baseRequest(),
          admin: { ...adminCtx, roles: [role] },
        });
        expect(result.amountAdjusted).toBe(100);
      }
    });
  });

  // ─── processRefund ────────────────────────────────────────────────────────

  describe('processRefund', () => {
    const baseRefund = (): AdminRefundRequest => ({
      userId: 'user-001',
      amount: 200,
      reason: 'Test refund',
      admin: adminCtx,
      requestId: 'req-refund-001',
      referenceTransactionId: 'txn-original-001',
    });

    it('issues refund and returns refund response', async () => {
      const wallet = makeWallet(300);
      (WalletModel.findOne as jest.Mock).mockResolvedValue(wallet);
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...wallet,
        availableBalance: 500,
      });
      (mockLedgerService.createEntry as jest.Mock).mockResolvedValue({} as LedgerEntry);

      const result = await service.processRefund(baseRefund());

      expect(result.amountRefunded).toBe(200);
      expect(result.newBalance).toBe(500);
      expect(result.transactionId).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('throws when refund amount is zero', async () => {
      await expect(service.processRefund({ ...baseRefund(), amount: 0 })).rejects.toThrow(
        'must be positive',
      );
    });

    it('throws when refund amount is negative', async () => {
      await expect(service.processRefund({ ...baseRefund(), amount: -50 })).rejects.toThrow(
        'must be positive',
      );
    });

    it('throws when refund exceeds maximum', async () => {
      await expect(service.processRefund({ ...baseRefund(), amount: 2_000_000 })).rejects.toThrow(
        'exceeds maximum',
      );
    });

    it('throws when admin has no roles', async () => {
      await expect(
        service.processRefund({ ...baseRefund(), admin: { ...adminCtx, roles: [] } }),
      ).rejects.toThrow('Invalid admin context');
    });
  });

  // ─── correctBalance ───────────────────────────────────────────────────────

  describe('correctBalance', () => {
    const baseCorrection = (): BalanceCorrectionRequest => ({
      userId: 'user-001',
      expectedBalance: 600,
      actualBalance: 500,
      reason: 'Ledger drift correction',
      admin: adminCtx,
      requestId: 'req-correct-001',
    });

    it('applies positive correction when expected > actual', async () => {
      const wallet = makeWallet(500);
      (WalletModel.findOne as jest.Mock).mockResolvedValue(wallet);
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...wallet,
        availableBalance: 600,
      });
      (mockLedgerService.createEntry as jest.Mock).mockResolvedValue({} as LedgerEntry);

      const result = await service.correctBalance(baseCorrection());

      expect(result.correctionAmount).toBe(100);
      expect(result.newBalance).toBe(600);
      expect(result.transactionId).toBeDefined();
    });

    it('applies negative correction when expected < actual', async () => {
      const wallet = makeWallet(700);
      (WalletModel.findOne as jest.Mock).mockResolvedValue(wallet);
      (WalletModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...wallet,
        availableBalance: 500,
      });
      (mockLedgerService.createEntry as jest.Mock).mockResolvedValue({} as LedgerEntry);

      const result = await service.correctBalance({
        ...baseCorrection(),
        expectedBalance: 500,
        actualBalance: 700,
      });
      expect(result.correctionAmount).toBe(-200);
    });

    it('throws when balances already match (no correction needed)', async () => {
      await expect(
        service.correctBalance({ ...baseCorrection(), expectedBalance: 500, actualBalance: 500 }),
      ).rejects.toThrow('No correction needed');
    });

    it('throws when admin lacks required role', async () => {
      await expect(
        service.correctBalance({
          ...baseCorrection(),
          admin: { ...adminCtx, roles: ['viewer'] },
        }),
      ).rejects.toThrow('Insufficient permissions');
    });
  });

  // ─── getAdminOperationHistory ─────────────────────────────────────────────

  describe('getAdminOperationHistory', () => {
    it('returns only admin-scoped ledger entries', async () => {
      const entries = [
        { reason: TransactionReason.ADMIN_CREDIT },
        { reason: TransactionReason.ADMIN_DEBIT },
        { reason: TransactionReason.ADMIN_REFUND },
        { reason: TransactionReason.PROMOTIONAL_AWARD }, // should be filtered out
      ] as LedgerEntry[];

      (mockLedgerService.queryEntries as jest.Mock).mockResolvedValue({
        entries,
        totalCount: 4,
        offset: 0,
        limit: 100,
        hasMore: false,
      } as LedgerQueryResult);

      const result = await service.getAdminOperationHistory('user-001');

      expect(result).toHaveLength(3);
      expect(
        result.every((e) =>
          ['admin_credit', 'admin_debit', 'admin_refund'].includes(
            (e as { reason: string }).reason,
          ),
        ),
      ).toBe(true);
    });

    it('returns empty array when no admin operations exist', async () => {
      (mockLedgerService.queryEntries as jest.Mock).mockResolvedValue({
        entries: [{ reason: TransactionReason.USER_SIGNUP_BONUS }] as LedgerEntry[],
        totalCount: 1,
        offset: 0,
        limit: 100,
        hasMore: false,
      } as LedgerQueryResult);

      const result = await service.getAdminOperationHistory('user-002');
      expect(result).toHaveLength(0);
    });
  });
});
