/**
 * Ledger Controller Tests
 */

import { LedgerController, ListTransactionsRequest } from './ledger.controller';
import { ILedgerService, LedgerQueryResult, BalanceSnapshot, LedgerEntry } from '../ledger/types';
import { TransactionType, TransactionReason } from '../wallets/types';

describe('LedgerController', () => {
  let controller: LedgerController;
  let mockLedgerService: jest.Mocked<ILedgerService>;

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
      const mockEntry: LedgerEntry = {
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
      };

      const mockResult: LedgerQueryResult = {
        entries: [mockEntry],
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
        })
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
        })
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
        })
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
        })
      );
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
      expect(mockLedgerService.getBalanceSnapshot).toHaveBeenCalledWith(
        'user-123',
        'user'
      );
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
