/**
 * Ledger Service Implementation
 *
 * Provides immutable transaction logging and audit trail functionality.
 * All ledger entries are write-once and never modified.
 */

import { v4 as uuidv4 } from 'uuid';
import mongoose, { ClientSession } from 'mongoose';
import {
  ILedgerService,
  LedgerEntry,
  CreateLedgerEntryRequest,
  LedgerQueryFilter,
  LedgerQueryResult,
  BalanceSnapshot,
  ReconciliationReport,
  AuditTrailEntry,
  LedgerConfig,
} from './types';
import { LedgerEntryModel, ILedgerEntry } from '../db/models/ledger-entry.model';
import { IdempotencyRecordModel } from '../db/models/idempotency.model';
import { WalletModel } from '../db/models/wallet.model';
import { getProgramTenantId } from '../config/program-tenant';
import { TransactionType, TransactionReason } from '../wallets/types';
import logger from '../lib/logger';

/**
 * Default configuration for ledger service
 */
const DEFAULT_CONFIG: LedgerConfig = {
  enableAuditLogging: true,
  retentionDays: 2555, // 7 years minimum for financial records
  defaultCurrency: 'points',
  enableReconciliation: true,
  reconciliationFrequencyHours: 24,
  alertOnReconciliationFailure: true,
};

/**
 * LedgerService implementation
 */
export class LedgerService implements ILedgerService {
  private config: LedgerConfig;

  constructor(config: Partial<LedgerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new immutable ledger entry. When a Mongoose `ClientSession`
   * is supplied (B-006), the underlying insert participates in the caller's
   * transaction so multi-model writes commit or roll back atomically.
   */
  async createEntry(
    request: CreateLedgerEntryRequest,
    session?: ClientSession,
  ): Promise<LedgerEntry> {
    // Validate state/accountType compatibility
    if (request.accountType === 'user' && request.balanceState === 'earned') {
      throw new Error('Invalid state transition: users cannot use earned balance state');
    }
    if (request.accountType === 'model' && request.balanceState === 'escrow') {
      throw new Error('Invalid state transition: models cannot use escrow balance state');
    }

    // Validate metadata does not contain PII
    if (request.metadata) {
      // Use exact key names to avoid false positives on legitimate fields like emailCount
      const piiFieldNames = new Set([
        'email',
        'password',
        'ssn',
        'creditcard',
        'phonenumber',
        'phone',
      ]);
      const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
      for (const key of Object.keys(request.metadata)) {
        if (piiFieldNames.has(key.toLowerCase())) {
          throw new Error(`PII detected in metadata: field "${key}" may contain sensitive data`);
        }
        const val = request.metadata[key];
        if (typeof val === 'string' && emailPattern.test(val)) {
          throw new Error(`PII detected in metadata: field "${key}" contains an email address`);
        }
      }
    }

    // Generate IDs if not provided
    const entryId = uuidv4();
    const transactionId = request.transactionId || uuidv4();
    const timestamp = new Date();

    // Invariant (B-012): every LedgerEntry carries a non-null
    // correlation_id and reason_code. `reason` is already required by the
    // type system. For correlationId, default to the transactionId so
    // paired entries inside a single transaction share a stable
    // correlation key; an explicit caller-supplied value wins.
    const correlationId =
      request.correlationId && request.correlationId.trim().length > 0
        ? request.correlationId
        : transactionId;
    if (!correlationId || correlationId.trim().length === 0) {
      throw new Error('createEntry: correlationId is required (invariant B-012)');
    }
    if (!request.reason) {
      throw new Error('createEntry: reason is required (invariant B-012)');
    }

    // Create ledger entry document
    const entryDoc: Partial<ILedgerEntry> = {
      entryId,
      transactionId,
      accountId: request.accountId,
      accountType: request.accountType,
      amount: request.amount,
      type: request.type,
      balanceState: request.balanceState,
      stateTransition: request.stateTransition,
      reason: request.reason,
      idempotencyKey: request.idempotencyKey,
      requestId: request.requestId,
      balanceBefore: request.balanceBefore,
      balanceAfter: request.balanceAfter,
      timestamp,
      currency: request.currency || this.config.defaultCurrency,
      metadata: request.metadata,
      escrowId: request.escrowId,
      queueItemId: request.queueItemId,
      featureType: request.featureType,
      correlationId,
    };

    try {
      // Insert entry (idempotency key ensures uniqueness). When a session is
      // provided, Mongoose's `create` accepts it via array+options form.
      const created = session
        ? (await LedgerEntryModel.create([entryDoc], { session }))[0]
        : await LedgerEntryModel.create(entryDoc);

      // Map to domain object
      return this.mapToDomain(created);
    } catch (error: unknown) {
      // Handle duplicate idempotency key
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 11000 &&
        'keyPattern' in error &&
        (error.keyPattern as Record<string, unknown>)?.idempotencyKey
      ) {
        // Find and return existing entry
        const existing = await LedgerEntryModel.findOne({
          idempotencyKey: { $eq: request.idempotencyKey },
        })
          .lean()
          .exec();
        if (existing) {
          return this.mapToDomain(existing as ILedgerEntry);
        }
      }
      throw error;
    }
  }

  /**
   * Lifetime earned points for a member — the RRR **Standing** ladder is a
   * ratchet on cumulative points *earned*, independent of current balance
   * (spending never lowers Standing). The ledger is the single source of truth
   * across every heterogeneous earn path (accrual, `creditPoints`, WooCommerce,
   * admin award, …), so we derive it here rather than maintain a fragile
   * per-path counter.
   *
   * Definition: the sum of `credit` entries to a **user's** `available` balance,
   * EXCLUDING credits that are refunds/releases back to the member (those return
   * previously-held points, they are not new earnings). Model settlements never
   * match (they are not user `available` credits).
   */
  async getLifetimeEarnedPoints(accountId: string): Promise<number> {
    const NON_EARN_CREDIT_REASONS: string[] = [
      TransactionReason.PERFORMANCE_ABANDONED,
      TransactionReason.USER_DISCONNECTED,
      TransactionReason.MODEL_INITIATED_REFUND,
      TransactionReason.ROPE_DROP_TIMEOUT,
      TransactionReason.ADMIN_REFUND,
      // Escrow releases back to available on a voided merchant redemption
      // (see RedemptionService.voidRedemption) — a return, not an earning.
      TransactionReason.MERCHANT_ORDER_REDEMPTION_VOID,
    ];

    const rows = await LedgerEntryModel.aggregate<{ total: number }>([
      {
        $match: {
          accountId: { $eq: accountId },
          accountType: 'user',
          type: TransactionType.CREDIT,
          balanceState: 'available',
          reason: { $nin: NON_EARN_CREDIT_REASONS },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return rows.length > 0 ? rows[0].total : 0;
  }

  /**
   * Query ledger entries with filters
   */
  async queryEntries(filter: LedgerQueryFilter): Promise<LedgerQueryResult> {
    // Build query
    const query: {
      accountId?: { $eq: ILedgerEntry['accountId'] };
      accountType?: { $eq: ILedgerEntry['accountType'] };
      type?: { $eq: ILedgerEntry['type'] };
      reason?: { $eq: ILedgerEntry['reason'] };
      balanceState?: { $eq: ILedgerEntry['balanceState'] };
      escrowId?: { $eq: NonNullable<ILedgerEntry['escrowId']> };
      queueItemId?: { $eq: NonNullable<ILedgerEntry['queueItemId']> };
      featureType?: { $eq: NonNullable<ILedgerEntry['featureType']> };
      tenant_id?: { $eq: NonNullable<ILedgerEntry['tenant_id']> };
      timestamp?: { $gte?: Date; $lte?: Date };
    } = {};

    if (filter.accountId) {
      query.accountId = { $eq: filter.accountId };
    }

    if (filter.accountType) {
      query.accountType = { $eq: filter.accountType };
    }

    if (filter.type) {
      query.type = { $eq: filter.type };
    }

    if (filter.reason) {
      query.reason = { $eq: filter.reason };
    }

    if (filter.balanceState) {
      query.balanceState = { $eq: filter.balanceState };
    }

    if (filter.escrowId) {
      query.escrowId = { $eq: filter.escrowId };
    }

    if (filter.queueItemId) {
      query.queueItemId = { $eq: filter.queueItemId };
    }

    if (filter.featureType) {
      query.featureType = { $eq: filter.featureType };
    }

    // Date range filter
    if (filter.startDate || filter.endDate) {
      query.timestamp = {
        ...(filter.startDate ? { $gte: filter.startDate } : {}),
        ...(filter.endDate ? { $lte: filter.endDate } : {}),
      };
    }

    // Pagination
    const limit = Math.min(filter.limit || 100, 1000);
    const offset = filter.offset || 0;

    // Sorting
    const sortField = filter.sortBy || 'timestamp';
    const sortOrder = filter.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };

    const [entries, totalCount] = await Promise.all([
      LedgerEntryModel.find(
        filter.tenantId ? { tenant_id: { $eq: filter.tenantId }, ...query } : query,
      )
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      LedgerEntryModel.countDocuments(
        filter.tenantId ? { tenant_id: { $eq: filter.tenantId }, ...query } : query,
      ),
    ]);

    // Map results
    return {
      entries: entries.map((e) => this.mapToDomain(e as ILedgerEntry)),
      totalCount,
      offset,
      limit,
      hasMore: offset + entries.length < totalCount,
    };
  }

  /**
   * Get a specific ledger entry by ID
   */
  async getEntry(entryId: string, tenantId?: string): Promise<LedgerEntry | null> {
    const entry = await LedgerEntryModel.findOne({
      ...(tenantId ? { tenant_id: { $eq: tenantId } } : {}),
      entryId: { $eq: entryId },
    })
      .lean()
      .exec();

    return entry ? this.mapToDomain(entry as ILedgerEntry) : null;
  }

  /**
   * Get balance snapshot at a point in time.
   *
   * LCR-4: balances are derived by summing the signed `amount` delta of every
   * entry per balance state, NOT by reading the `balanceAfter` of the most
   * recent entry. Summing deltas is the correct append-only projection: it is
   * order-independent and a single incorrect `balanceAfter` annotation can no
   * longer poison the read. `balanceBefore`/`balanceAfter` remain on each entry
   * purely as an audit annotation. Credit entries carry a positive `amount`,
   * debit entries a negative `amount`, so the per-state sum is the net balance.
   */
  async getBalanceSnapshot(
    accountId: string,
    accountType: 'user' | 'model',
    asOf?: Date,
    tenantId?: string,
  ): Promise<BalanceSnapshot> {
    const query: {
      accountId: { $eq: ILedgerEntry['accountId'] };
      accountType: { $eq: ILedgerEntry['accountType'] };
      tenant_id?: { $eq: NonNullable<ILedgerEntry['tenant_id']> };
      timestamp?: { $lte: Date };
    } = {
      accountId: { $eq: accountId },
      accountType: { $eq: accountType },
    };

    if (asOf) {
      query.timestamp = { $lte: asOf };
    }

    // Get all entries up to the specified time — include tenant_id inline so B-009 can verify scoping
    const entries = await LedgerEntryModel.find(
      tenantId ? { tenant_id: { $eq: tenantId }, ...query } : query,
    )
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    // Project the balance for each state by summing signed deltas (LCR-4).
    const balances: { [key: string]: number } = {
      available: 0,
      escrow: 0,
      earned: 0,
    };

    for (const entry of entries) {
      if (
        entry.balanceState === 'available' ||
        entry.balanceState === 'escrow' ||
        entry.balanceState === 'earned'
      ) {
        balances[entry.balanceState] += entry.amount;
      }
    }

    const snapshot: BalanceSnapshot = {
      accountId,
      accountType,
      availableBalance: balances.available,
      asOf: asOf || new Date(),
      currency: this.config.defaultCurrency,
    };

    // Add escrow for users, earned for models
    if (accountType === 'user') {
      snapshot.escrowBalance = balances.escrow;
    } else if (accountType === 'model') {
      snapshot.earnedBalance = balances.earned;
    }

    return snapshot;
  }

  /**
   * Generate reconciliation report
   */
  async generateReconciliationReport(
    accountId: string,
    accountType: 'user' | 'model',
    dateRange: { start: Date; end: Date },
    tenantId: string,
  ): Promise<ReconciliationReport> {
    // Get starting balance (before start date)
    const startSnapshot = await this.getBalanceSnapshot(accountId, accountType, dateRange.start);

    // Get entries in date range. Sort by timestamp ascending with entryId as
    // a deterministic tie-breaker so the reconciliation output is stable and
    // auditable even when multiple entries share a timestamp.
    const entries = await LedgerEntryModel.find({
      tenant_id: { $eq: tenantId },
      accountId: { $eq: accountId },
      accountType: { $eq: accountType },
      timestamp: { $gte: dateRange.start, $lte: dateRange.end },
    })
      .sort({ timestamp: 1, entryId: 1 })
      .lean()
      .exec();

    // Calculate totals
    let totalCredits = 0;
    let totalDebits = 0;

    for (const entry of entries) {
      if (entry.type === 'credit') {
        totalCredits += entry.amount;
      } else {
        totalDebits += Math.abs(entry.amount);
      }
    }

    // Get ending balance
    const endSnapshot = await this.getBalanceSnapshot(accountId, accountType, dateRange.end);

    // Calculate expected balance
    const startingBalance =
      startSnapshot.availableBalance +
      (startSnapshot.escrowBalance || 0) +
      (startSnapshot.earnedBalance || 0);

    const calculatedBalance = startingBalance + totalCredits - totalDebits;

    const actualBalance =
      endSnapshot.availableBalance +
      (endSnapshot.escrowBalance || 0) +
      (endSnapshot.earnedBalance || 0);

    const difference = actualBalance - calculatedBalance;
    const reconciled = Math.abs(difference) < 0.01; // Allow for floating point precision

    return {
      accountId,
      accountType,
      startingBalance,
      totalCredits,
      totalDebits,
      calculatedBalance,
      actualBalance,
      difference,
      reconciled,
      reportedAt: new Date(),
      dateRange,
    };
  }

  /**
   * Get audit trail for a transaction
   */
  async getAuditTrail(transactionId: string, tenantId: string): Promise<AuditTrailEntry[]> {
    const entries = await LedgerEntryModel.find({
      tenant_id: { $eq: tenantId },
      transactionId: { $eq: transactionId },
    })
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    return entries.map((entry) => ({
      auditId: entry.entryId,
      ledgerEntry: this.mapToDomain(entry as ILedgerEntry),
      auditedAt: entry.timestamp,
    }));
  }

  /**
   * Check if idempotency key has been used
   */
  async checkIdempotency(key: string, operationType: string, tenantId: string): Promise<boolean> {
    const existing = await IdempotencyRecordModel.findOne({
      tenant_id: { $eq: tenantId },
      pointsIdempotencyKey: { $eq: key },
      eventScope: { $eq: operationType },
    })
      .lean()
      .exec();

    return existing !== null;
  }

  /**
   * Atomically claim an idempotency key by inserting a reservation record
   * backed by the unique index on (pointsIdempotencyKey, eventScope).
   * Returns true if this caller won the race, false if another caller already
   * claimed the same key. This is the concurrency gate that ensures only one
   * of N simultaneous requests with the same idempotency key proceeds.
   */
  async claimIdempotency(key: string, operationType: string, tenantId?: string): Promise<boolean> {
    try {
      await IdempotencyRecordModel.create({
        pointsIdempotencyKey: key,
        eventScope: operationType,
        resultHash: 'pending',
        storedResult: {},
        // Short-lived claim; finalized by storeIdempotencyResult on success.
        expiresAt: new Date(Date.now() + 60_000),
        retentionUntil: new Date(Date.now() + 60_000),
        ...(tenantId !== undefined ? { tenant_id: tenantId } : {}),
      });
      return true;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Store idempotency result
   */
  async storeIdempotencyResult(
    key: string,
    operationType: string,
    result: unknown,
    _statusCode: number,
    ttlSeconds: number,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const retentionUntil = new Date(Date.now() + ttlSeconds * 1000);

    await IdempotencyRecordModel.create({
      pointsIdempotencyKey: key,
      eventScope: operationType,
      resultHash: JSON.stringify(result),
      storedResult: result as Record<string, unknown>,
      expiresAt,
      retentionUntil,
    });
  }

  /**
   * Run `fn` inside a Mongoose transaction (B-006).
   *
   * If the caller already holds a session, we participate in it and let the
   * outer scope commit/abort. Otherwise we open our own session, attempt
   * `withTransaction`, and gracefully fall back to a no-session run when the
   * topology does not support transactions (standalone Mongo, in-memory tests).
   * The fallback is what keeps unit tests working without a replica set; the
   * production deploy targets a replica set where the real transaction path
   * fires.
   */
  /**
   * Public transaction wrapper (B-006).
   *
   * Runs `fn` inside a Mongoose session, opening one if the caller has none
   * and committing/aborting around `fn`. Falls back to a no-session run on
   * topologies that don't support transactions (delegates to
   * `withTransactionSafety`).
   */
  async withTransaction<T>(fn: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
    return this.withTransactionSafety(undefined, fn);
  }

  private async withTransactionSafety<T>(
    session: ClientSession | undefined,
    fn: (s: ClientSession | undefined) => Promise<T>,
  ): Promise<T> {
    if (session) {
      return fn(session);
    }

    // Only attempt transactions when Mongoose is actually connected. Calling
    // `startSession` on a non-connected client buffers indefinitely, which
    // would deadlock unit tests that don't stand up a database. `readyState`
    // === 1 means "connected" per Mongoose semantics.
    if (mongoose.connection?.readyState !== 1) {
      return fn(undefined);
    }

    let owned: ClientSession | null = null;
    try {
      owned = await mongoose.startSession();
    } catch {
      return fn(undefined);
    }

    try {
      let result!: T;
      await owned.withTransaction(async () => {
        result = await fn(owned ?? undefined);
      });
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      const transactionsUnsupported =
        /Transaction numbers are only allowed/i.test(msg) ||
        /This MongoDB deployment does not support retryable writes/i.test(msg) ||
        /standalone/i.test(msg);
      if (transactionsUnsupported) {
        return fn(undefined);
      }
      throw e;
    } finally {
      try {
        await owned.endSession();
      } catch {
        // ignore: session already closed
      }
    }
  }

  /**
   * Credit promotional points to a user's available balance (B-001).
   *
   * LCR-1 (unified balance source of truth): the authoritative available
   * balance lives on `WalletModel.availableBalance`. This method atomically
   * `$inc`s that field and writes the immutable ledger entry inside the same
   * MongoDB transaction (B-006), deriving `balanceBefore`/`balanceAfter` from
   * the post-update wallet document. Previously this path derived balances from
   * the ledger snapshot and never touched `WalletModel`, so ledger-path credits
   * (catalogue, WooCommerce, RedRoom compliance awards) were invisible to the
   * escrow/`getUserBalance` path — the "split-brain" divergence (review F-1).
   * Now every earn/spend path converges on `WalletModel`.
   *
   * The string `reason` is captured in metadata alongside `source`. An optional
   * `idempotencyKey` may be provided by the caller for true idempotency
   * protection; without it a random key is generated so each call creates a new
   * entry. Pass an existing `session` to enlist this write in the caller's
   * transaction.
   */
  async creditPoints(
    accountId: string,
    amount: number,
    source: string,
    reason: string,
    idempotencyKey?: string,
    session?: ClientSession,
  ): Promise<boolean> {
    if (amount <= 0) {
      throw new Error(`creditPoints: amount must be positive, got ${amount}`);
    }
    return this.withTransactionSafety(session, async (s) => {
      // Atomically bump the authoritative balance. Upsert so the first credit
      // for a brand-new account creates the wallet; `$inc` from the 0 default
      // yields availableBalance === amount.
      const tenantId = getProgramTenantId();
      const updated = await WalletModel.findOneAndUpdate(
        { tenant_id: { $eq: tenantId }, userId: { $eq: accountId } },
        {
          $inc: { availableBalance: amount, version: 1 },
          $setOnInsert: {
            tenant_id: tenantId,
            escrowBalance: 0,
            currency: this.config.defaultCurrency,
          },
        },
        { new: true, upsert: true, ...(s ? { session: s } : {}) },
      );
      const balanceAfter = updated!.availableBalance;
      const balanceBefore = balanceAfter - amount;
      await this.createEntry(
        {
          accountId,
          accountType: 'user',
          type: TransactionType.CREDIT,
          amount,
          balanceState: 'available',
          stateTransition: 'promotional-credit→available',
          reason: TransactionReason.PROMOTIONAL_AWARD,
          idempotencyKey: idempotencyKey ?? `credit-${source}-${accountId}-${uuidv4()}`,
          requestId: uuidv4(),
          balanceBefore,
          balanceAfter,
          correlationId: source,
          metadata: { reason, source },
        },
        s,
      );
      return true;
    });
  }

  /**
   * Deduct points from a user's available balance (B-002).
   *
   * LCR-1 (unified balance source of truth): decrements the authoritative
   * `WalletModel.availableBalance` with a single atomic, conditional
   * `findOneAndUpdate` (`availableBalance >= amount`) and writes the immutable
   * ledger entry in the same transaction (B-006). The conditional decrement is
   * race-free — concurrent debits cannot both succeed against the same balance,
   * and the operation never drives the balance negative (the spec only permits
   * negative balances via reversals/chargebacks, not via this debit path).
   * A non-match means the wallet is missing or has insufficient funds; both map
   * to an insufficient-balance error. Previously this derived balances from the
   * ledger snapshot and never mutated `WalletModel`, leaving catalogue/WooCommerce
   * burns invisible to the escrow/`getUserBalance` path (review F-1).
   *
   * The string `reason` is captured in metadata alongside `source`. An optional
   * `idempotencyKey` may be provided by the caller for true idempotency
   * protection; without it a random key is generated so each call creates a new
   * entry. Pass an existing `session` to enlist this write in the caller's
   * transaction.
   */
  async deductPoints(
    accountId: string,
    amount: number,
    source: string,
    reason: string,
    idempotencyKey?: string,
    session?: ClientSession,
  ): Promise<boolean> {
    if (amount <= 0) {
      throw new Error(`deductPoints: amount must be positive, got ${amount}`);
    }
    return this.withTransactionSafety(session, async (s) => {
      const tenantId = getProgramTenantId();
      const updated = await WalletModel.findOneAndUpdate(
        {
          tenant_id: { $eq: tenantId },
          userId: { $eq: accountId },
          availableBalance: { $gte: amount },
        },
        { $inc: { availableBalance: -amount, version: 1 } },
        { new: true, ...(s ? { session: s } : {}) },
      );
      if (!updated) {
        // Surface the current balance for diagnostics when a wallet exists.
        const wallet = await WalletModel.findOne({
          tenant_id: { $eq: tenantId },
          userId: { $eq: accountId },
        }).lean();
        const available = wallet ? wallet.availableBalance : 0;
        throw new Error(
          `deductPoints: insufficient balance for ${accountId} — available ${available}, requested ${amount}`,
        );
      }
      const balanceAfter = updated.availableBalance;
      const balanceBefore = balanceAfter + amount;
      await this.createEntry(
        {
          accountId,
          accountType: 'user',
          type: TransactionType.DEBIT,
          amount: -amount,
          balanceState: 'available',
          stateTransition: 'available→promotional-debit',
          reason: TransactionReason.ADMIN_DEBIT,
          idempotencyKey: idempotencyKey ?? `debit-${source}-${accountId}-${uuidv4()}`,
          requestId: uuidv4(),
          balanceBefore,
          balanceAfter,
          correlationId: source,
          metadata: { reason, source },
        },
        s,
      );
      return true;
    });
  }

  async awardPromotionalPoints(
    creatorId: string,
    points: number,
    source: string,
    reason: string,
    _expiryDays?: number,
  ): Promise<boolean> {
    return this.creditPoints(creatorId, points, source, reason);
  }

  async createGiftingPromotion(
    creatorId: string,
    _points: number,
    _title: string,
    _condition: string,
    _maxRecipients?: number,
    _expiryDays?: number,
  ) {
    // STUB: real implementation in next payload
    logger.info({ creatorId }, 'Ledger gifting-promotion created (stub)');
    return true;
  }

  /**
   * Map database document to domain object
   */
  private mapToDomain(doc: ILedgerEntry): LedgerEntry {
    return {
      entryId: doc.entryId,
      transactionId: doc.transactionId,
      accountId: doc.accountId,
      accountType: doc.accountType,
      amount: doc.amount,
      type: doc.type as TransactionType,
      balanceState: doc.balanceState,
      stateTransition: doc.stateTransition,
      reason: doc.reason as TransactionReason,
      idempotencyKey: doc.idempotencyKey,
      requestId: doc.requestId,
      balanceBefore: doc.balanceBefore,
      balanceAfter: doc.balanceAfter,
      timestamp: doc.timestamp,
      currency: doc.currency,
      metadata: doc.metadata,
      escrowId: doc.escrowId,
      queueItemId: doc.queueItemId,
      featureType: doc.featureType,
      correlationId: doc.correlationId,
    };
  }
}

/**
 * Factory function to create ledger service instance
 */
export function createLedgerService(config?: Partial<LedgerConfig>): ILedgerService {
  return new LedgerService(config);
}
