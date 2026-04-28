import { Module } from '@nestjs/common';
import { LedgerController } from '../controllers/ledger.controller';
import { LedgerService } from '../ledger/ledger.service';

/**
 * LedgerModule — HTTP transport for transaction history endpoints.
 *
 * Exposes:
 *   GET /ledger/transactions          (Screen 04 — paginated list)
 *   GET /ledger/transactions/:entryId (Screen 04 — full AuditRow detail)
 */
@Module({
  controllers: [LedgerController],
  providers: [{ provide: LedgerService, useFactory: () => new LedgerService() }],
})
export class LedgerModule {}
