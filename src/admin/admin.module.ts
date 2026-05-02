import { Module } from '@nestjs/common';
import { AdminEarnController } from './admin-earn.controller';
import { AdminEarnService } from './admin-earn.service';
import { LedgerService } from '../ledger/ledger.service';

@Module({
  controllers: [AdminEarnController],
  providers: [AdminEarnService, { provide: LedgerService, useFactory: () => new LedgerService() }],
})
export class AdminModule {}
