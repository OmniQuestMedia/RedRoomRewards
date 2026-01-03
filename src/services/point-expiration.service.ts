/**
 * Point Expiration Service
 * 
 * Handles automatic expiration of points based on configured rules.
 * Points can have expiration dates attached when awarded, and this
 * service processes those expirations by debiting expired balances.
 * 
 * @module services/point-expiration
 */

import { v4 as uuidv4 } from 'uuid';
import { ILedgerService, LedgerQueryFilter } from '../ledger/types';
import { WalletModel } from '../db/models/wallet.model';
import { TransactionType, TransactionReason } from '../wallets/types';

/**
 * Expiration batch result
 */
export interface ExpirationBatchResult {
  /** Number of users processed */
  usersProcessed: number;
  
  /** Total points expired */
  totalPointsExpired: number;
  
  /** Number of successful expirations */
  successCount: number;
  
  /** Number of failed expirations */
  failureCount: number;
  
  /** Processing timestamp */
  timestamp: Date;
  
  /** Errors encountered (if any) */
  errors?: Array<{ userId: string; error: string }>;
}

/**
 * User expiration details
 */
export interface UserExpirationDetails {
  /** User ID */
  userId: string;
  
  /** Amount expired */
  amountExpired: number;
  
  /** Transaction ID */
  transactionId: string;
  
  /** Expiration timestamp */
  timestamp: Date;
}

/**
 * Configuration for expiration service
 */
export interface PointExpirationConfig {
  /** Default currency */
  defaultCurrency: string;
  
  /** Grace period in days before expiration */
  gracePeriodDays: number;
  
  /** Batch size for bulk processing */
  batchSize: number;
  
  /** Enable expiration notifications */
  enableNotifications: boolean;
  
  /** Warning period in days (notify before expiration) */
  warningPeriodDays: number;
}

const DEFAULT_CONFIG: PointExpirationConfig = {
  defaultCurrency: 'points',
  gracePeriodDays: 0,
  batchSize: 100,
  enableNotifications: true,
  warningPeriodDays: 7,
};

/**
 * Point Expiration Service Implementation
 * 
 * Processes point expirations automatically based on expiration
 * dates stored in ledger metadata. All expirations create new
 * immutable ledger entries (no destructive edits).
 */
export class PointExpirationService {
  private config: PointExpirationConfig;
  private ledgerService: ILedgerService;

  constructor(
    ledgerService: ILedgerService,
    config: Partial<PointExpirationConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ledgerService = ledgerService;
  }

  /**
   * Process expired points for a single user
   * 
   * This method:
   * 1. Queries ledger for credit entries with expiration dates
   * 2. Identifies expired points
   * 3. Debits the expired amount
   * 4. Creates immutable ledger entry for the expiration
   * 
   * @param userId User ID
   * @param requestId Request ID for tracing
   * @returns Expiration details
   */
  async processUserExpiration(
    userId: string,
    requestId: string
  ): Promise<UserExpirationDetails | null> {
    // Query ledger for credit entries with expiration dates
    const filter: LedgerQueryFilter = {
      accountId: userId,
      accountType: 'user',
      type: TransactionType.CREDIT,
      balanceState: 'available',
    };
    
    const ledgerResult = await this.ledgerService.queryEntries(filter);
    
    // Find expired entries
    const now = new Date();
    const gracePeriodDate = new Date(
      now.getTime() - this.config.gracePeriodDays * 24 * 60 * 60 * 1000
    );
    
    let totalExpired = 0;
    
    for (const entry of ledgerResult.entries) {
      const expiresAt = entry.metadata?.expiresAt 
        ? new Date(entry.metadata.expiresAt) 
        : null;
      
      if (expiresAt && expiresAt <= gracePeriodDate) {
        // This entry has expired
        totalExpired += entry.amount;
      }
    }
    
    if (totalExpired === 0) {
      return null;
    }
    
    // Get user wallet
    const wallet = await WalletModel.findOne({ userId: { $eq: userId } });
    if (!wallet) {
      throw new Error(`Wallet not found for user: ${userId}`);
    }
    
    // Ensure we don't expire more than available
    const amountToExpire = Math.min(totalExpired, wallet.availableBalance);
    
    if (amountToExpire <= 0) {
      return null;
    }
    
    const previousBalance = wallet.availableBalance;
    const newBalance = wallet.availableBalance - amountToExpire;
    const currentVersion = wallet.version;
    
    // Update wallet with optimistic locking
    const updated = await WalletModel.findOneAndUpdate(
      {
        userId: { $eq: userId },
        version: { $eq: currentVersion },
      },
      {
        $inc: {
          availableBalance: -amountToExpire,
          version: 1,
        },
      },
      { new: true }
    );
    
    if (!updated) {
      // Retry once on conflict
      return this.processUserExpiration(userId, requestId);
    }
    
    // Create ledger entry for expiration
    const transactionId = uuidv4();
    const timestamp = new Date();
    
    // Use deterministic idempotency key based on user and expiration date
    const expirationDateKey = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    const idempotencyKey = `expiration-${userId}-${expirationDateKey}`;
    
    await this.ledgerService.createEntry({
      transactionId,
      accountId: userId,
      accountType: 'user',
      amount: -amountToExpire,
      type: TransactionType.DEBIT,
      balanceState: 'available',
      stateTransition: 'available→expired',
      reason: TransactionReason.POINT_EXPIRY,
      idempotencyKey,
      requestId,
      balanceBefore: previousBalance,
      balanceAfter: newBalance,
      currency: this.config.defaultCurrency,
      metadata: {
        expirationDate: timestamp.toISOString(),
        amountExpired: amountToExpire,
      },
    });
    
    return {
      userId,
      amountExpired: amountToExpire,
      transactionId,
      timestamp,
    };
  }
  
  /**
   * Process expirations in batch for multiple users
   * 
   * This is typically run as a scheduled job to process
   * expirations across all users.
   * 
   * @param userIds List of user IDs to process (optional, processes all if not provided)
   * @param requestId Request ID for tracing
   * @returns Batch processing results
   */
  async processBatchExpiration(
    userIds: string[] | null,
    requestId: string
  ): Promise<ExpirationBatchResult> {
    const result: ExpirationBatchResult = {
      usersProcessed: 0,
      totalPointsExpired: 0,
      successCount: 0,
      failureCount: 0,
      timestamp: new Date(),
      errors: [],
    };
    
    // If no user IDs provided, get all wallets
    const users = userIds || await this.getAllUserIds();
    
    // Process in batches
    for (let i = 0; i < users.length; i += this.config.batchSize) {
      const batch = users.slice(i, i + this.config.batchSize);
      
      await Promise.all(
        batch.map(async (userId) => {
          try {
            const expiration = await this.processUserExpiration(userId, requestId);
            
            result.usersProcessed++;
            
            if (expiration) {
              result.totalPointsExpired += expiration.amountExpired;
              result.successCount++;
            }
          } catch (error) {
            result.failureCount++;
            result.errors!.push({
              userId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        })
      );
    }
    
    return result;
  }
  
  /**
   * Get users with expiring points (for warning notifications)
   * 
   * Returns users who have points expiring within the warning period.
   * 
   * @returns List of users with expiring points
   */
  async getUsersWithExpiringPoints(): Promise<
    Array<{ userId: string; amountExpiring: number; expiresAt: Date }>
  > {
    const users: Array<{ userId: string; amountExpiring: number; expiresAt: Date }> = [];
    
    // Get all ledger entries with expiration dates
    const now = new Date();
    const warningDate = new Date(
      now.getTime() + this.config.warningPeriodDays * 24 * 60 * 60 * 1000
    );
    
    // Query would need to be enhanced to filter by metadata.expiresAt
    // This is a simplified implementation
    const filter: LedgerQueryFilter = {
      type: TransactionType.CREDIT,
      balanceState: 'available',
    };
    
    const ledgerResult = await this.ledgerService.queryEntries(filter);
    
    // Group by user and sum expiring amounts
    const userExpirationMap = new Map<string, { amount: number; date: Date }>();
    
    for (const entry of ledgerResult.entries) {
      const expiresAt = entry.metadata?.expiresAt
        ? new Date(entry.metadata.expiresAt)
        : null;
      
      if (expiresAt && expiresAt >= now && expiresAt <= warningDate) {
        const existing = userExpirationMap.get(entry.accountId);
        if (existing) {
          existing.amount += entry.amount;
          if (expiresAt < existing.date) {
            existing.date = expiresAt;
          }
        } else {
          userExpirationMap.set(entry.accountId, {
            amount: entry.amount,
            date: expiresAt,
          });
        }
      }
    }
    
    // Convert map to array
    userExpirationMap.forEach((value, userId) => {
      users.push({
        userId,
        amountExpiring: value.amount,
        expiresAt: value.date,
      });
    });
    
    return users;
  }
  
  /**
   * Get all user IDs with wallets
   * 
   * @returns Array of user IDs
   */
  private async getAllUserIds(): Promise<string[]> {
    const wallets = await WalletModel.find({}).select('userId').lean().exec();
    return wallets.map(w => w.userId);
  }
}

/**
 * Factory function to create point expiration service
 */
export function createPointExpirationService(
  ledgerService: ILedgerService,
  config?: Partial<PointExpirationConfig>
): PointExpirationService {
  return new PointExpirationService(ledgerService, config);
}
