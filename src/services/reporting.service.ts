import { Injectable } from '@nestjs/common';
import { LiabilityReport } from '../interfaces/redroom-rewards';

/**
 * ReportingService — WO-014 final polish.
 *
 * Produces AirMiles-level liability statements for the RRR program.
 *
 * PoC: Returns computed stub values matching the docs/ASSUMPTIONS.md F-012 contract.
 * Production replacement: Wire `LedgerService.queryEntries()` with
 * `{ reason: 'REDROOM_REWARDS', type: 'CREDIT' }` for issued, and
 * `{ reason: { $regex: '^BURN_' }, type: 'DEBIT' }` for burned totals.
 * Use MongoDB `aggregate` with `$sum` of `delta` fields for O(1) retrieval.
 *
 * All burns route through RedRoomLedgerService per docs/ASSUMPTIONS.md F-012.
 */
@Injectable()
export class ReportingService {
  /**
   * Generate a liability report.
   *
   * Returns the total promotional points issued, burned, and outstanding
   * as of the current moment.
   *
   * STUB: Replace the body with real LedgerService aggregation before launch.
   * Correlation: REQUIREMENTS_MASTER.md RRR-P2-010 (liability reporting endpoint).
   */
  async getLiabilityReport(): Promise<LiabilityReport> {
    // STUB: Replace with real LedgerService.queryEntries() aggregation.
    // Query pattern for production:
    //   issued  = SUM(delta) WHERE source='REDROOM_REWARDS' AND delta > 0
    //   burned  = SUM(ABS(delta)) WHERE reason LIKE 'BURN_%' AND delta < 0
    //   outstanding = issued - burned
    const totalPromotionalIssued = 245_000;
    const totalBurned = 87_000;

    return {
      totalPromotionalIssued,
      totalBurned,
      outstandingLiability: totalPromotionalIssued - totalBurned,
      asOf: new Date(),
    };
  }
}
