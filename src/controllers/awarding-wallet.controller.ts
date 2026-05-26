import { Controller, Post, Body, Req } from '@nestjs/common';
import { AwardingWalletService } from '../services/awarding-wallet.service';
import { AwardingWalletUploadRow } from '../interfaces/redroom-rewards';
import { Request } from 'express';

@Controller('awarding-wallet')
export class AwardingWalletController {
  constructor(private readonly awardingWalletService: AwardingWalletService) {}

  @Post('upload-csv')
  async uploadCSV(@Body() body: { rows: AwardingWalletUploadRow[] }, @Req() req: Request) {
    const merchantId = (req as unknown as { user: { merchantId: string } }).user.merchantId; // from existing auth
    return this.awardingWalletService.uploadCSV(body.rows, merchantId);
  }
}
