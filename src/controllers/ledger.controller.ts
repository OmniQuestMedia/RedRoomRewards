/**
 * Ledger NestJS Controller
 *
 * Thin HTTP transport layer for transaction history endpoints.
 * Business logic lives in the plain-TS LedgerController in src/api/.
 *
 * Routes:
 *   GET /ledger/transactions          — paginated list, filterable by date/reason_code
 *   GET /ledger/transactions/:entryId — full AuditRow detail
 *
 * @see /api/openapi.yaml — operationId listTransactions / getTransaction
 */

import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { LedgerController as LedgerApiController } from '../api/ledger.controller';
import { LedgerService } from '../ledger/ledger.service';

@Controller('ledger')
export class LedgerController {
  private readonly api: LedgerApiController;

  constructor(private readonly ledgerService: LedgerService) {
    this.api = new LedgerApiController(ledgerService);
  }

  /**
   * GET /ledger/transactions
   *
   * Query params (all optional):
   *   userId       — filter to a specific account
   *   type         — credit | debit | all
   *   reason_code  — structured reason code (e.g. PURCHASE_EARN, REDEMPTION)
   *   startDate    — ISO-8601 lower bound (inclusive)
   *   endDate      — ISO-8601 upper bound (inclusive)
   *   limit        — page size (default 100, max 1000)
   *   offset       — pagination offset (default 0)
   */
  @Get('transactions')
  async listTransactions(
    @Query('userId') userId?: string,
    @Query('type') type?: 'credit' | 'debit' | 'all',
    @Query('reason_code') reasonCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      return await this.api.listTransactions({
        userId,
        type,
        reasonCode,
        startDate,
        endDate,
        limit: limit !== undefined ? parseInt(limit, 10) : undefined,
        offset: offset !== undefined ? parseInt(offset, 10) : undefined,
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Invalid reason_code')) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /**
   * GET /ledger/transactions/:entryId
   *
   * Returns the full AuditRow for a single ledger entry, including
   * correlationId, reason_code, balanceBefore/After, and full chain context.
   */
  @Get('transactions/:entryId')
  async getTransaction(@Param('entryId') entryId: string) {
    const detail = await this.api.getTransaction(entryId);
    if (!detail) {
      throw new NotFoundException(`Transaction ${entryId} not found`);
    }
    return detail;
  }

  /**
   * GET /ledger/balance/:userId
   *
   * Aggregate point balance for a member: the per-bucket balances (available,
   * escrow) and their computed total, projected from the append-only ledger as
   * of now. Read-only — never mutates the ledger.
   */
  @Get('balance/:userId')
  async getBalance(@Param('userId') userId: string) {
    if (!userId || !userId.trim()) {
      throw new BadRequestException('userId is required');
    }
    return this.api.getBalance(userId);
  }
}
