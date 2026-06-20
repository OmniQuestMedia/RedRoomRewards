import mongoose, { Document, Schema } from 'mongoose';

export type ChargebackStatus = 'received' | 'processing' | 'reversed' | 'disputed' | 'closed';

export interface IChargebackEvent extends Document {
  chargeback_id: string;
  tenant_id: string;
  member_id: string;
  order_ref: string;
  chargeback_amount_cents: number;
  points_to_reverse: number;
  status: ChargebackStatus;
  reversal_ledger_entry_id: string | null;
  correlation_id: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChargebackEventSchema = new Schema<IChargebackEvent>(
  {
    chargeback_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tenant_id: {
      type: String,
      required: true,
      index: true,
    },
    member_id: {
      type: String,
      required: true,
      index: true,
    },
    order_ref: {
      type: String,
      required: true,
      maxlength: 256,
    },
    chargeback_amount_cents: {
      type: Number,
      required: true,
      min: 1,
    },
    points_to_reverse: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ['received', 'processing', 'reversed', 'disputed', 'closed'],
      default: 'received',
    },
    reversal_ledger_entry_id: {
      type: String,
      default: null,
    },
    correlation_id: {
      type: String,
      required: true,
      maxlength: 128,
    },
    notes: {
      type: String,
      maxlength: 2048,
    },
  },
  {
    timestamps: true,
    collection: 'chargeback_events',
  },
);

ChargebackEventSchema.index({ tenant_id: 1, member_id: 1, status: 1 });

export const ChargebackEventModel = mongoose.model<IChargebackEvent>(
  'ChargebackEvent',
  ChargebackEventSchema,
);
