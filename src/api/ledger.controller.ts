/**
 * Ledger Controller
 * 
 * REST API controller for ledger operations based on OpenAPI specification.
 * Provides endpoints for transaction history and balance queries.
 * 
 * @see /api/openapi.yaml for API contract
 */

import { LedgerQueryFilter, LedgerQueryResult, BalanceSnapshot, ILedgerService } from '../ledger/types';
import { TransactionType } from '../wallets/types';

/**
 * Request interface for GET /ledger/transactions
 */
export interface ListTransactionsRequest {
  userId?: string;
  type?: 'credit' | 'debit' | 'all';
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  requestId?: string;
}

/**
 * Response interface for GET /ledger/transactions
 */
export interface TransactionListResponse {
  transactions: Array<{
    id: string;
    userId: string;
    amount: number;
    type: 'credit' | 'debit';
    reason: string;
    metadata?: Record<string, any>;
    timestamp: string;
    idempotencyKey: string;
    previousBalance?: number;
    newBalance?: number;
    requestId?: string;
  }>;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

/**
 * Response interface for GET /ledger/balance/:userId
 */
export interface BalanceResponse {
  userId: string;
  available: number;
  escrow?: number;
  total: number;
  asOf: string;
}

/**
 * Ledger Controller Class
 * Handles HTTP requests for ledger operations
 */
export class LedgerController {
  private ledgerService: ILedgerService;

  constructor(ledgerService: ILedgerService) {
    this.ledgerService = ledgerService;
  }

  /**
   * GET /ledger/transactions
   * Retrieves a paginated list of transactions associated with the user
   * 
   * @param request - Query parameters for filtering transactions
   * @returns Promise<TransactionListResponse>
   */
  async listTransactions(request: ListTransactionsRequest): Promise<TransactionListResponse> {
    // Map string type to enum if provided
    let typeFilter: TransactionType | undefined;
    if (request.type && request.type !== 'all') {
      typeFilter = request.type === 'credit' ? TransactionType.CREDIT : TransactionType.DEBIT;
    }

    // Build filter from request parameters
    const filter: LedgerQueryFilter = {
      accountId: request.userId,
      accountType: request.userId ? 'user' : undefined,
      type: typeFilter,
      startDate: request.startDate ? new Date(request.startDate) : undefined,
      endDate: request.endDate ? new Date(request.endDate) : undefined,
      limit: Math.min(request.limit || 100, 1000),
      offset: request.offset || 0,
      sortBy: 'timestamp',
      sortOrder: 'desc',
    };

    // Query ledger service
    const result: LedgerQueryResult = await this.ledgerService.queryEntries(filter);

    // Map to response format matching OpenAPI spec
    return {
      transactions: result.entries.map(entry => ({
        id: entry.transactionId,
        userId: entry.accountId,
        amount: entry.amount,
        type: entry.type,
        reason: entry.reason,
        metadata: entry.metadata,
        timestamp: entry.timestamp.toISOString(),
        idempotencyKey: entry.idempotencyKey,
        previousBalance: entry.balanceBefore,
        newBalance: entry.balanceAfter,
        requestId: entry.requestId,
      })),
      pagination: {
        limit: result.limit,
        offset: result.offset,
        total: result.totalCount,
        hasMore: result.hasMore,
      },
    };
  }

  /**
   * GET /ledger/balance/:userId
   * Returns the current ledger balance for the provided user ID
   * 
   * @param userId - User identifier
   * @returns Promise<BalanceResponse>
   */
  async getBalance(userId: string): Promise<BalanceResponse> {
    // Get current balance snapshot
    const snapshot: BalanceSnapshot = await this.ledgerService.getBalanceSnapshot(
      userId,
      'user'
    );

    // Map to response format matching OpenAPI spec
    return {
      userId: snapshot.accountId,
      available: snapshot.availableBalance,
      escrow: snapshot.escrowBalance,
      total: (snapshot.availableBalance || 0) + (snapshot.escrowBalance || 0),
      asOf: snapshot.asOf.toISOString(),
    };
  }
}

/**
 * Factory function to create controller instance
 */
export function createLedgerController(ledgerService: ILedgerService): LedgerController {
  return new LedgerController(ledgerService);
}
