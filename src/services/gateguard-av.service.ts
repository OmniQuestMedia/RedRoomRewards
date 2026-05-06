import { Injectable } from '@nestjs/common';
import { GateGuardAVResult } from '../interfaces/redroom-rewards';
import logger from '../lib/logger';

@Injectable()
export class GateGuardAVService {
  async verifyAccount(guestId: string, _billingAddress?: unknown): Promise<GateGuardAVResult> {
    // STUB: Real GateGuard Sentinel™ AV call in production
    logger.info({ guestId }, 'GateGuardAV verify (mandatory 18+ check)');
    return {
      verified: true,
      verifiedAt: new Date(),
      method: 'GATEGUARD',
      confidenceScore: 98,
    };
  }
}
