/**
 * Ledger Controller Tests
 */

import { LedgerController, ListTransactionsRequest } from './ledger.controller';
import { ILedgerService, LedgerQueryResult, BalanceSnapshot, LedgerEntry } from '../ledger/types';
import { TransactionType, TransactionReason } from '../wallets/types';

describe('LedgerController', () => {
  let controller: LedgerController;
  let mockLedgerService: jest.Mocked<ILedgerService>;

  const makeMockEntry = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
    entryId: 'entry-123',
    transactionId: 'txn-123',
    accountId: 'user-123',
    accountType: 'user',
    amount: 100,
    type: TransactionType.CREDIT,
    balanceState: 'available',
    stateTransition: 'credit→available',
    reason: TransactionReason.USER_SIGNUP_BONUS,
    idempotencyKey: 'idem-123',
    requestId: 'req-123',
    balanceBefore: 0,
    balanceAfter: 100,
    timestamp: new Date('2024-01-01T00:00:00Z'),
    currency: 'points',
    ...overrides,
  });

  beforeEach(() => {
    // Create mock ledger service
    mockLedgerService = {
      queryEntries: jest.fn(),
      getBalanceSnapshot: jest.fn(),
      createEntry: jest.fn(),
      getEntry: jest.fn(),
      generateReconciliationReport: jest.fn(),
      getAuditTrail: jest.fn(),
      checkIdempotency: jest.fn(),
      storeIdempotencyResult: jest.fn(),
    } as unknown as jest.Mocked<ILedgerService>;

    controller = new LedgerController(mockLedgerService);
  });

  describe('listTransactions', () => {
    it('should retrieve a paginated list of transactions', async () => {
      const mockResult: LedgerQueryResult = {
        entries: [makeMockEntry()],
        totalCount: 1,
        offset: 0,
        limit: 100,
        hasMore: false,
      };

      mockLedgerService.queryEntries.mockResolvedValue(mockResult);

      const request: ListTransactionsRequest = {
        userId: 'user-123',
        limit: 10,
        offset: 0,
      };

      const response = await controller.listTransactions(request);

      expect(response.transactions).toHaveLength(1);
      expect(response.transactions[0].id).toBe('txn-123');
      expect(response.transactions[0].userId).toBe('user-123');
      expect(response.transactions[0].amount).toBe(100);
      expect(response.transactions[0].type).toBe('credit');
      expect(response.pagination.total).toBe(1);
      expect(response.pagination.hasMore).toBe(false);
      expect(mockLedgerService.queryEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'user-123',
          limit: 10,
          offset: 0,
        }),
      );
    });

    it('should filter transactions by type', async () => {
      const mockResult: LedgerQueryResult = {
        entries: [],
        totalCount: 0,
        offset: 0,
        limit: 100,
        hasMore: false,
      };

      mockLedgerService.queryEntries.mockResolvedValue(mockResult);

      const request: ListTransactionsRequest = {
        userId: 'user-123',
        type: 'credit',
        limit: 10,
        offset: 0,
      };

      await controller.listTransactions(request);

      expect(mockLedgerService.queryEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'user-123',
          type: 'credit',
        }),
      );
    });

    it('should filter transactions by date range', async () => {
      const mockResult: LedgerQueryResult = {
        entries: [],
        totalCount: 0,
        offset: 0,
        limit: 100,
        hasMore: false,
      };

      mockLedgerService.queryEntries.mockResolvedValue(mockResult);

      const request: ListTransactionsRequest = {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        limit: 10,
        offset: 0,
      };

      await controller.listTransactions(request);

      expect(mockLedgerService.queryEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: new Date('2024-01-01T00:00:00Z'),
          endDate: new Date('2024-12-31T23:59:59Z'),
        }),
      );
    });

    it('should enforce maximum limit of 1000', async () => {
      const mockResult: LedgerQueryResult = {
        entries: [],
        totalCount: 0,
        offset: 0,
        limit: 1000,
        hasMore: false,
      };

      mockLedgerService.queryEntries.mockResolvedValue(mockResult);

      const request: ListTransactionsRequest = {
        limit: 5000, // Exceeds maximum
        offset: 0,
      };

      await controller.listTransactions(request);

      expect(mockLedgerService.queryEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 1000, // Capped at maximum
        }),
      );
    });

    it('should filter transactions by reason_code', async () => {
      const emptyResult: LedgerQueryResult = {
        entries: [],
        totalCount: 0,
        offset: 0,
        limit: 100,
        hasMore: false,
      };
      mockLedgerService.queryEntries.mockResolvedValue(emptyResult);

      await controller.listTransactions({
        userId: 'user-123',
        reasonCode: TransactionReason.CHIP_MENU_PURCHASE,
      });

      expect(mockLedgerService.queryEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: TransactionReason.CHIP_MENU_PURCHASE,
        }),
      );
    });

    it('should reject an unrecognised reason_code with an error', async () => {
      await expect(controller.listTransactions({ reasonCode: 'INVALID_CODE' })).rejects.toThrow(
        'Invalid reason_code: "INVALID_CODE"',
      );
      expect(mockLedgerService.queryEntries).not.toHaveBeenCalled();
    });

    it('should not pass reason filter when reasonCode is absent', async () => {
      const emptyResult: LedgerQueryResult = {
        entries: [],
        totalCount: 0,
        offset: 0,
        limit: 100,
        hasMore: false,
      };
      mockLedgerService.queryEntries.mockResolvedValue(emptyResult);

      await controller.listTransactions({ userId: 'user-123' });

      const calledWith = mockLedgerService.queryEntries.mock.calls[0][0];
      expect(calledWith.reason).toBeUndefined();
    });
  });

  describe('getTransaction', () => {
    it('should return full detail for an existing entry', async () => {
      const entry = makeMockEntry({
        correlationId: 'corr-abc',
        escrowId: 'escrow-99',
        queueItemId: 'queue-77',
        featureType: 'performance',
      });
      mockLedgerService.getEntry.mockResolvedValue(entry);

      const detail = await controller.getTransaction('entry-123');

      expect(detail).not.toBeNull();
      expect(detail!.entryId).toBe('entry-123');
      expect(detail!.id).toBe('txn-123');
      expect(detail!.userId).toBe('user-123');
      expect(detail!.accountType).toBe('user');
      expect(detail!.amount).toBe(100);
      expect(detail!.type).toBe('credit');
      expect(detail!.balanceState).toBe('available');
      expect(detail!.reason).toBe(TransactionReason.USER_SIGNUP_BONUS);
      expect(detail!.correlationId).toBe('corr-abc');
      expect(detail!.escrowId).toBe('escrow-99');
      expect(detail!.queueItemId).toBe('queue-77');
      expect(detail!.featureType).toBe('performance');
      expect(detail!.previousBalance).toBe(0);
      expect(detail!.newBalance).toBe(100);
      expect(detail!.currency).toBe('points');
      expect(mockLedgerService.getEntry).toHaveBeenCalledWith('entry-123');
    });

    it('should return null when entry does not exist', async () => {
      mockLedgerService.getEntry.mockResolvedValue(null);

      const detail = await controller.getTransaction('missing-id');

      expect(detail).toBeNull();
    });
  });

  describe('getBalance', () => {
    it('should return current balance for a user', async () => {
      const mockSnapshot: BalanceSnapshot = {
        accountId: 'user-123',
        accountType: 'user',
        availableBalance: 500,
        escrowBalance: 100,
        asOf: new Date('2024-01-01T00:00:00Z'),
        currency: 'points',
      };

      mockLedgerService.getBalanceSnapshot.mockResolvedValue(mockSnapshot);

      const response = await controller.getBalance('user-123');

      expect(response.userId).toBe('user-123');
      expect(response.available).toBe(500);
      expect(response.escrow).toBe(100);
      expect(response.total).toBe(600);
      expect(response.asOf).toBe('2024-01-01T00:00:00.000Z');
      expect(mockLedgerService.getBalanceSnapshot).toHaveBeenCalledWith('user-123', 'user');
    });

    it('should handle balance without escrow', async () => {
      const mockSnapshot: BalanceSnapshot = {
        accountId: 'user-456',
        accountType: 'user',
        availableBalance: 750,
        asOf: new Date('2024-01-01T00:00:00Z'),
        currency: 'points',
      };

      mockLedgerService.getBalanceSnapshot.mockResolvedValue(mockSnapshot);

      const response = await controller.getBalance('user-456');

      expect(response.userId).toBe('user-456');
      expect(response.available).toBe(750);
      expect(response.escrow).toBeUndefined();
      expect(response.total).toBe(750);
    });
  });
});
