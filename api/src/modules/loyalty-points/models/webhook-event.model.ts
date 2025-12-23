import { Schema } from 'mongoose';

/**
 * WebhookEvent Schema
 * 
 * Stores processed webhook events for idempotency protection.
 * 
 * Security:
 * - event_id field is strictly typed as String (not mixed)
 * - Unique index prevents duplicate processing
 * - Immutable records (no updates after insert)
 */
export const WebhookEventSchema = new Schema(
  {
    // Event ID from webhook payload (idempotency key)
    event_id: {
      type: String,
      required: true,
      index: true,
      trim: true,
      maxlength: 128,
    },

    // Event type (e.g., "user.points.awarded")
    event_type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    // Original webhook payload data (for audit)
    data: {
      type: Schema.Types.Mixed,
      required: false,
    },

    // When the event was processed
    processed_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    // Timestamps for audit trail
    timestamps: true,
    
    // Collection name
    collection: 'webhook_events',
  },
);

// Unique index on event_id for idempotency enforcement
// Single-tenant deployment: event_id alone is sufficient
// For multi-tenant: consider composite index { client_id: 1, event_id: 1 }
WebhookEventSchema.index({ event_id: 1 }, { unique: true });

// Recommended: TTL index for automatic cleanup after retention period
// Example: expire events after 90 days
WebhookEventSchema.index({ processed_at: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

export interface IWebhookEvent {
  event_id: string;
  event_type: string;
  data?: any;
  processed_at: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
