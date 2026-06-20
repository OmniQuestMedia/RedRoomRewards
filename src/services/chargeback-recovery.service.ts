import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ChargebackEventModel, IChargebackEvent } from '../db/models/chargeback-event.model';
import { LedgerService } from '../ledger/ledger.service';

export interface InitiateChargebackInput {
  tenant_id: string;
  member_id: string;
  order_ref: string;
  chargeback_amount_cents: number;
  points_to_reverse: number;
  correlation_id?: string;
  notes?: string;
}

@Injectable()
export class ChargebackRecoveryService {
  constructor(private readonly ledger: LedgerService) {}

  async initiateChargeback(input: InitiateChargebackInput): Promise<IChargebackEvent> {
    if (!Number.isInteger(input.chargeback_amount_cents) || input.chargeback_amount_cents < 1) {
      throw new BadRequestException('chargeback_amount_cents must be a positive integer >= 1');
    }
    if (!Number.isInteger(input.points_to_reverse) || input.points_to_reverse < 0) {
      throw new BadRequestException('points_to_reverse must be a non-negative integer');
    }

    const record = new ChargebackEventModel({
      chargeback_id: randomUUID(),
      tenant_id: input.tenant_id,
      member_id: input.member_id,
      order_ref: input.order_ref,
      chargeback_amount_cents: input.chargeback_amount_cents,
      points_to_reverse: input.points_to_reverse,
      status: 'received',
      reversal_ledger_entry_id: null,
      correlation_id: input.correlation_id ?? randomUUID(),
      notes: input.notes ?? '',
    });

    return record.save();
  }

  async reversePoints(
    chargebackId: string,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<IChargebackEvent> {
    const chargeback = await ChargebackEventModel.findOne({
      chargeback_id: { $eq: chargebackId },
      tenant_id: { $eq: tenantId },
    }).exec();

    if (!chargeback) {
      throw new NotFoundException(`Chargeback not found: ${chargebackId}`);
    }

    if (chargeback.status !== 'received' && chargeback.status !== 'processing') {
      throw new BadRequestException(
        `Chargeback ${chargebackId} cannot be reversed from status '${chargeback.status}'`,
      );
    }

    if (chargeback.points_to_reverse === 0) {
      chargeback.status = 'closed';
      return chargeback.save();
    }

    await this.ledger.deductPoints(
      chargeback.member_id,
      chargeback.points_to_reverse,
      'CHARGEBACK_REVERSAL',
      `Chargeback reversal for order ${chargeback.order_ref}`,
      idempotencyKey,
    );

    chargeback.status = 'reversed';
    return chargeback.save();
  }
}
