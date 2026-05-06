/**
 * SettlementService
 *
 * Initiates and records a settlement run for a tenant period (C-011).
 *
 * A settlement run aggregates all points redeemed across merchants
 * within `periodStart`..`periodEnd` for the given tenant and persists
 * a SettlementRecord with the result.
 *
 * NOTE: `total_redeemed` aggregation is stubbed at 0 in this wave;
 * real per-merchant aggregation requires the B-011 reconciliation job
 * to be wired first.
 */

import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { ISettlementRecord, SettlementRecordModel } from '../db/models/settlement-record.model';
import logger from '../lib/logger';

@Injectable()
export class SettlementService {
  /**
   * Opens a settlement record for the given tenant period.
   *
   * A SettlementRecord with status `pending` is created immediately.
   * Real point aggregation will populate `total_redeemed` once the
   * B-011 reconciliation job is connected.
   */
  async settlePeriod(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    correlationId?: string,
  ): Promise<ISettlementRecord> {
    logger.info(
      {
        tenantId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
      'Settlement period processing started',
    );

    const record = new SettlementRecordModel({
      settlement_id: uuidv4(),
      tenant_id: tenantId,
      period_start: periodStart,
      period_end: periodEnd,
      total_redeemed: 0, // real aggregation wired in full impl (B-011)
      status: 'pending',
      correlation_id: correlationId ?? uuidv4(),
    });

    await record.save();
    return record;
  }
}
