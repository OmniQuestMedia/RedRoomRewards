/**
 * Escrow Item Model
 *
 * Tracks individual escrow holds for performance queue items.
 * Links user funds held in escrow to specific queue items.
 * Collection: escrow_items
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IEscrowItem extends Document {
  // Program-tenant isolation boundary. Required (RRR-#2 Phase C). escrowId stays
  // the unique key (globally-unique UUID), so no composite-unique change here.
  tenant_id: string;
  escrowId: string;
  userId: string;
  amount: number;
  status: 'held' | 'settled' | 'refunded';
  queueItemId: string;
  featureType: string;
  reason: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  processedAt?: Date;
  modelId?: string;
}

const EscrowItemSchema = new Schema<IEscrowItem>(
  {
    // Program isolation boundary. Required (RRR-#2 Phase C). escrowId (below)
    // stays the unique key, so no composite-unique change here.
    tenant_id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    escrowId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0, // Schema-level constraint: no negative amounts
    },
    status: {
      type: String,
      required: true,
      enum: ['held', 'settling', 'settled', 'refunding', 'refunded', 'partial_settling'],
      default: 'held',
      index: true,
    },
    queueItemId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    featureType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    processedAt: {
      type: Date,
      required: false,
    },
    modelId: {
      type: String,
      required: false,
      trim: true,
      maxlength: 128,
      index: true,
    },
  },
  {
    timestamps: false, // We manage createdAt manually
    collection: 'escrow_items',
  },
);

// Unique index on escrowId
EscrowItemSchema.index({ escrowId: 1 }, { unique: true });

// Unique index on queueItemId (one escrow per queue item)
EscrowItemSchema.index({ queueItemId: 1 }, { unique: true });

// Program-tenant scoped lookup (Phase A: non-unique). escrowId remains the
// unique key; tenant_id is defense-in-depth for user/status queries.
EscrowItemSchema.index({ tenant_id: 1, userId: 1, status: 1 });

// Compound indexes for common queries
EscrowItemSchema.index({ userId: 1, status: 1, createdAt: -1 });
EscrowItemSchema.index({ modelId: 1, status: 1, processedAt: -1 }, { sparse: true });
EscrowItemSchema.index({ status: 1, createdAt: 1 });

// Index for feature tracking
EscrowItemSchema.index({ featureType: 1, status: 1 });

export const EscrowItemModel = mongoose.model<IEscrowItem>('EscrowItem', EscrowItemSchema);
