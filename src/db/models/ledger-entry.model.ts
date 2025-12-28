/**
 * Ledger Entry Model
 * 
 * Immutable transaction records for full audit trail.
 * Never modified after creation - corrections are new entries.
 * Collection: ledger_entries
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface ILedgerEntry extends Document {
  entryId: string;
  transactionId: string;
  accountId: string;
  accountType: 'user' | 'model';
  amount: number;
  type: 'credit' | 'debit';
  balanceState: 'available' | 'escrow' | 'earned';
  stateTransition: string;
  reason: string;
  idempotencyKey: string;
  requestId: string;
  balanceBefore: number;
  balanceAfter: number;
  timestamp: Date;
  currency: string;
  metadata?: Record<string, any>;
  escrowId?: string;
  queueItemId?: string;
  featureType?: string;
  correlationId?: string;
}

const LedgerEntrySchema = new Schema<ILedgerEntry>(
  {
    entryId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    transactionId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    accountId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    accountType: {
      type: String,
      required: true,
      enum: ['user', 'model'],
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['credit', 'debit'],
    },
    balanceState: {
      type: String,
      required: true,
      enum: ['available', 'escrow', 'earned'],
    },
    stateTransition: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
      index: true,
    },
    requestId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    currency: {
      type: String,
      required: true,
      default: 'points',
      trim: true,
      maxlength: 16,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
    escrowId: {
      type: String,
      required: false,
      trim: true,
      maxlength: 128,
      index: true,
    },
    queueItemId: {
      type: String,
      required: false,
      trim: true,
      maxlength: 128,
      index: true,
    },
    featureType: {
      type: String,
      required: false,
      trim: true,
      maxlength: 64,
    },
    correlationId: {
      type: String,
      required: false,
      trim: true,
      maxlength: 128,
      index: true,
    },
  },
  {
    timestamps: false, // We use our own timestamp field
    collection: 'ledger_entries',
  }
);

// Unique index on entryId
LedgerEntrySchema.index({ entryId: 1 }, { unique: true });

// Unique index on idempotencyKey to prevent duplicates
LedgerEntrySchema.index({ idempotencyKey: 1 }, { unique: true });

// Compound indexes for common queries
LedgerEntrySchema.index({ accountId: 1, timestamp: -1 });
LedgerEntrySchema.index({ accountId: 1, type: 1, timestamp: -1 });
LedgerEntrySchema.index({ accountId: 1, balanceState: 1, timestamp: -1 });
LedgerEntrySchema.index({ transactionId: 1, timestamp: -1 });

// Index for escrow tracking
LedgerEntrySchema.index({ escrowId: 1 }, { sparse: true });

// Index for queue tracking
LedgerEntrySchema.index({ queueItemId: 1 }, { sparse: true });

// Index for correlation tracking
LedgerEntrySchema.index({ correlationId: 1 }, { sparse: true });

// Index for time-based queries and retention
LedgerEntrySchema.index({ timestamp: 1 });

export const LedgerEntryModel = mongoose.model<ILedgerEntry>('LedgerEntry', LedgerEntrySchema);
