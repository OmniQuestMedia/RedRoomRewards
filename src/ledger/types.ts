/**
 * Ledger Type Definitions
 * 
 * Defines types for the immutable transaction ledger system.
 * All ledger entries are write-once and never modified.
 * 
 * @see /docs/WALLET_ESCROW_ARCHITECTURE.md for detailed specifications
 */

import { TransactionType, TransactionReason } from '../wallets/types';

/**
 * Ledger entry representing an immutable transaction record
 * These entries are never modified after creation
 */
export interface LedgerEntry {
  /** Unique ledger entry identifier */
  entryId: string;
  
  /** Transaction identifier (may have multiple ledger entries) */
  transactionId: string;
  
  /** Account identifier (user or model) */
  accountId: string;
  
  /** Account type */
  accountType: 'user' | 'model';
  
  /** Transaction amount (signed: positive credit, negative debit) */
  amount: number;
  
  /** Transaction type */
  type: TransactionType;
  
  /** Balance state affected */
  balanceState: 'available' | 'escrow' | 'earned';
  
  /** State transition description */
  stateTransition: string;
  
  /** Structured reason code */
  reason: TransactionReason;
  
  /** Idempotency key */
  idempotencyKey: string;
  
  /** Request tracing ID */
  requestId: string;
  
  /** Balance before this entry */
  balanceBefore: number;
  
  /** Balance after this entry */
  balanceAfter: number;
  
  /** Entry creation timestamp (immutable) */
  timestamp: Date;
  
  /** Currency type */
  currency: string;
  
  /** Additional context (no PII) */
  metadata?: Record<string, any>;
  
  /** Related escrow ID if applicable */
  escrowId?: string;
  
  /** Related queue item ID if applicable */
  queueItemId?: string;
  
  /** Feature that initiated transaction */
  featureType?: string;
  
  /** Correlation ID for multi-entry transactions */
  correlationId?: string;
}

/**
 * Request to create a ledger entry
 */
export interface CreateLedgerEntryRequest {
  /** Transaction ID (generated if not provided) */
  transactionId?: string;
  
  /** Account identifier */
  accountId: string;
  
  /** Account type */
  accountType: 'user' | 'model';
  
  /** Transaction amount */
  amount: number;
  
  /** Transaction type */
  type: TransactionType;
  
  /** Balance state being modified */
  balanceState: 'available' | 'escrow' | 'earned';
  
  /** State transition */
  stateTransition: string;
  
  /** Reason code */
  reason: TransactionReason;
  
  /** Idempotency key */
  idempotencyKey: string;
  
  /** Request ID */
  requestId: string;
  
  /** Balance before transaction */
  balanceBefore: number;
  
  /** Balance after transaction */
  balanceAfter: number;
  
  /** Currency type */
  currency?: string;
  
  /** Metadata */
  metadata?: Record<string, any>;
  
  /** Escrow ID if applicable */
  escrowId?: string;
  
  /** Queue item ID if applicable */
  queueItemId?: string;
  
  /** Feature type */
  featureType?: string;
  
  /** Correlation ID for grouped entries */
  correlationId?: string;
}

/**
 * Query filters for ledger entries
 */
export interface LedgerQueryFilter {
  /** Filter by account ID */
  accountId?: string;
  
  /** Filter by account type */
  accountType?: 'user' | 'model';
  
  /** Filter by transaction type */
  type?: TransactionType;
  
  /** Filter by reason */
  reason?: TransactionReason;
  
  /** Filter by balance state */
  balanceState?: 'available' | 'escrow' | 'earned';
  
  /** Filter by escrow ID */
  escrowId?: string;
  
  /** Filter by queue item ID */
  queueItemId?: string;
  
  /** Filter by feature type */
  featureType?: string;
  
  /** Start date (inclusive) */
  startDate?: Date;
  
  /** End date (inclusive) */
  endDate?: Date;
  
  /** Pagination offset */
  offset?: number;
  
  /** Pagination limit */
  limit?: number;
  
  /** Sort field */
  sortBy?: 'timestamp' | 'amount';
  
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Ledger query result
 */
export interface LedgerQueryResult {
  /** Ledger entries matching query */
  entries: LedgerEntry[];
  
  /** Total count of matching entries */
  totalCount: number;
  
  /** Pagination offset used */
  offset: number;
  
  /** Pagination limit used */
  limit: number;
  
  /** Whether more results exist */
  hasMore: boolean;
}

/**
 * Balance snapshot at a point in time
 */
export interface BalanceSnapshot {
  /** Account identifier */
  accountId: string;
  
  /** Account type */
  accountType: 'user' | 'model';
  
  /** Available balance */
  availableBalance: number;
  
  /** Escrow balance (users only) */
  escrowBalance?: number;
  
  /** Earned balance (models only) */
  earnedBalance?: number;
  
  /** Snapshot timestamp */
  asOf: Date;
  
  /** Currency type */
  currency: string;
}

/**
 * Audit trail entry with full context
 */
export interface AuditTrailEntry {
  /** Audit entry ID */
  auditId: string;
  
  /** Related ledger entry */
  ledgerEntry: LedgerEntry;
  
  /** IP address of requester (if available) */
  ipAddress?: string;
  
  /** User agent of requester (if available) */
  userAgent?: string;
  
  /** Authenticated user/service that initiated */
  initiatedBy?: string;
  
  /** Additional audit context (no PII) */
  auditContext?: Record<string, any>;
  
  /** Audit entry created timestamp */
  auditedAt: Date;
}

/**
 * Reconciliation report for balance verification
 */
export interface ReconciliationReport {
  /** Account identifier */
  accountId: string;
  
  /** Account type */
  accountType: 'user' | 'model';
  
  /** Starting balance */
  startingBalance: number;
  
  /** Total credits */
  totalCredits: number;
  
  /** Total debits */
  totalDebits: number;
  
  /** Calculated ending balance */
  calculatedBalance: number;
  
  /** Actual current balance */
  actualBalance: number;
  
  /** Difference (should be zero) */
  difference: number;
  
  /** Whether reconciliation passed */
  reconciled: boolean;
  
  /** Report generation timestamp */
  reportedAt: Date;
  
  /** Date range for report */
  dateRange: {
    start: Date;
    end: Date;
  };
}

/**
 * Ledger service interface
 */
export interface ILedgerService {
  /**
   * Create a new ledger entry (immutable)
   */
  createEntry(request: CreateLedgerEntryRequest): Promise<LedgerEntry>;
  
  /**
   * Query ledger entries with filters
   */
  queryEntries(filter: LedgerQueryFilter): Promise<LedgerQueryResult>;
  
  /**
   * Get a specific ledger entry by ID
   */
  getEntry(entryId: string): Promise<LedgerEntry | null>;
  
  /**
   * Get balance snapshot at a point in time
   */
  getBalanceSnapshot(accountId: string, accountType: 'user' | 'model', asOf?: Date): Promise<BalanceSnapshot>;
  
  /**
   * Generate reconciliation report
   */
  generateReconciliationReport(
    accountId: string,
    accountType: 'user' | 'model',
    dateRange: { start: Date; end: Date }
  ): Promise<ReconciliationReport>;
  
  /**
   * Get audit trail for a transaction
   */
  getAuditTrail(transactionId: string): Promise<AuditTrailEntry[]>;
  
  /**
   * Verify idempotency key hasn't been used
   */
  checkIdempotency(key: string, operationType: string): Promise<boolean>;
  
  /**
   * Store idempotency result
   */
  storeIdempotencyResult(
    key: string,
    operationType: string,
    result: any,
    statusCode: number,
    ttlSeconds: number
  ): Promise<void>;
}

/**
 * Ledger configuration
 */
export interface LedgerConfig {
  /** Enable comprehensive audit logging */
  enableAuditLogging: boolean;
  
  /** Retention period in days (minimum 7 years = 2555 days) */
  retentionDays: number;
  
  /** Default currency type */
  defaultCurrency: string;
  
  /** Enable automatic reconciliation checks */
  enableReconciliation: boolean;
  
  /** Reconciliation check frequency in hours */
  reconciliationFrequencyHours: number;
  
  /** Alert on reconciliation failures */
  alertOnReconciliationFailure: boolean;
}

/**
 * Ledger statistics for monitoring
 */
export interface LedgerStatistics {
  /** Total number of ledger entries */
  totalEntries: number;
  
  /** Total entries in last 24 hours */
  entriesLast24Hours: number;
  
  /** Total credit amount (all time) */
  totalCredits: number;
  
  /** Total debit amount (all time) */
  totalDebits: number;
  
  /** Number of unique accounts */
  uniqueAccounts: number;
  
  /** Average entries per day (last 30 days) */
  avgEntriesPerDay: number;
  
  /** Oldest entry timestamp */
  oldestEntryDate: Date;
  
  /** Newest entry timestamp */
  newestEntryDate: Date;
  
  /** Statistics generated at */
  generatedAt: Date;
}

/**
 * Transaction batch for atomic multi-entry operations
 */
export interface TransactionBatch {
  /** Batch identifier */
  batchId: string;
  
  /** Correlation ID for all entries */
  correlationId: string;
  
  /** Entries to create atomically */
  entries: CreateLedgerEntryRequest[];
  
  /** Batch timestamp */
  timestamp: Date;
  
  /** Whether batch was successful */
  success?: boolean;
  
  /** Error message if failed */
  error?: string;
}
