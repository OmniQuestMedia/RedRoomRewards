import { Module } from '@nestjs/common';
import { LedgerService } from '../ledger/ledger.service';
import { BurnCatalogueService } from '../services/burn-catalogue.service';
import { CatalogueController, AdminCatalogueController } from '../controllers/catalogue.controller';

@Module({
  controllers: [CatalogueController, AdminCatalogueController],
  providers: [
    BurnCatalogueService,
    { provide: LedgerService, useFactory: () => new LedgerService() },
  ],
  exports: [BurnCatalogueService],
})
export class CatalogueModule {}
