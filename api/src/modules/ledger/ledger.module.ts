/**
 * Ledger Module
 * 
 * Central module for ledger operations with comprehensive idempotency framework.
 * 
 * This module provides:
 * - Transaction-level UUID validation
 * - Idempotency checking and duplicate prevention
 * - Graceful handling of duplicate requests
 * - Financial transaction controllers with built-in protection
 * 
 * @module api/src/modules/ledger
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LedgerTransactionController } from './controllers/ledger-transaction.controller';
import { IdempotencyService } from './services/idempotency.service';
import { IdempotencyGuard } from './guards/idempotency.guard';

/**
 * Ledger Module
 * 
 * Handles ledger transaction operations with full idempotency support:
 * - Transaction creation and querying
 * - Automatic duplicate detection
 * - UUID validation
 * - Response caching for idempotent operations
 */
@Module({
  imports: [
    // Note: Models are defined in src/db/models and imported there
    // MongooseModule schemas would be registered here if needed
  ],
  controllers: [
    LedgerTransactionController,
  ],
  providers: [
    IdempotencyService,
    IdempotencyGuard,
  ],
  exports: [
    IdempotencyService,
    IdempotencyGuard,
  ],
})
export class LedgerModule {}
