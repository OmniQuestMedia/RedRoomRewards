/**
 * DLQ Replay Controller
 * 
 * Provides replay functionality for DLQ events with safety checks
 */

import {
  DLQEventModel,
  IngestEventModel,
  IngestEventStatus,
  IdempotencyRecordModel,
} from '../db/models';
import { ReplayOptions, ReplayResult } from './types';
import { MetricsLogger, MetricEventType, AlertSeverity } from '../metrics';

export class ReplayController {
  /**
   * Replay events from DLQ based on options
   */
  async replay(options: ReplayOptions): Promise<ReplayResult> {
    const startTime = Date.now();
    
    const result: ReplayResult = {
      totalReplayed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
    };
    
    // Log replay start
    MetricsLogger.incrementCounter(MetricEventType.DLQ_REPLAY_STARTED, {
      options,
    });

    // Build query based on options
    const query: any = {};

    if (options.eventId) {
      query.eventId = options.eventId;
    }

    if (options.eventType) {
      query.eventType = options.eventType;
    }

    if (options.startDate || options.endDate) {
      query.movedToDLQAt = {};
      if (options.startDate) {
        query.movedToDLQAt.$gte = options.startDate;
      }
      if (options.endDate) {
        query.movedToDLQAt.$lte = options.endDate;
      }
    }

    // Find events to replay
    let dlqQuery = DLQEventModel.find(query).sort({ movedToDLQAt: 1 });

    if (options.maxEvents) {
      dlqQuery = dlqQuery.limit(options.maxEvents);
    }

    const dlqEvents = await dlqQuery.exec();

    // Replay each event
    for (const dlqEvent of dlqEvents) {
      try {
        // Safety check: verify idempotency before replay
        const isProcessed = await this.checkIdempotency(dlqEvent.eventId);
        if (isProcessed) {
          result.skipped++;
          
          // Log double-processing prevention
          MetricsLogger.incrementCounter(MetricEventType.DLQ_DOUBLE_PROCESS_PREVENTED, {
            eventId: dlqEvent.eventId,
            eventType: dlqEvent.eventType,
          });
          
          // Log alert for double-processing attempt (operational safety)
          MetricsLogger.logAlert({
            severity: AlertSeverity.INFO,
            message: `Replay skipped - event already processed: ${dlqEvent.eventId}`,
            metricType: MetricEventType.DLQ_DOUBLE_PROCESS_PREVENTED,
            timestamp: new Date(),
            metadata: {
              eventId: dlqEvent.eventId,
              eventType: dlqEvent.eventType,
            },
          });
          
          continue;
        }

        // Check if event already exists in ingest_events
        const existingEvent = await IngestEventModel.findOne({
          eventId: dlqEvent.eventId,
        });

        if (existingEvent) {
          // Update existing event to QUEUED
          await IngestEventModel.updateOne(
            { _id: existingEvent._id },
            {
              $set: {
                status: IngestEventStatus.QUEUED,
                attempts: 0,
                nextAttemptAt: new Date(),
              },
              $unset: { lastErrorCode: '', lastErrorAt: '' },
            }
          );
        } else {
          // Create new ingest event
          await IngestEventModel.create({
            eventId: dlqEvent.eventId,
            eventType: dlqEvent.eventType,
            receivedAt: new Date(),
            status: IngestEventStatus.QUEUED,
            attempts: 0,
            payloadSnapshot: dlqEvent.payloadSnapshot,
            replayable: dlqEvent.replayable,
          });
        }

        result.successful++;
        result.totalReplayed++;
        
        // Log successful replay
        MetricsLogger.incrementCounter(MetricEventType.DLQ_REPLAY_SUCCESS, {
          eventId: dlqEvent.eventId,
          eventType: dlqEvent.eventType,
        });
      } catch (error) {
        console.error(`Failed to replay event ${dlqEvent.eventId}:`, error);
        result.failed++;
        result.totalReplayed++;
        
        // Log failed replay
        MetricsLogger.incrementCounter(MetricEventType.DLQ_REPLAY_FAILED, {
          eventId: dlqEvent.eventId,
          eventType: dlqEvent.eventType,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    // Log skipped events
    if (result.skipped > 0) {
      MetricsLogger.incrementCounter(MetricEventType.DLQ_REPLAY_SKIPPED, {
        count: result.skipped,
      });
    }
    
    // Record duration metric
    const duration = Date.now() - startTime;
    MetricsLogger.recordDuration(MetricEventType.DLQ_REPLAY_STARTED, duration, {
      totalReplayed: result.totalReplayed,
      successful: result.successful,
      failed: result.failed,
      skipped: result.skipped,
    });

    return result;
  }

  /**
   * Replay a single event by ID
   */
  async replayById(eventId: string): Promise<boolean> {
    const result = await this.replay({ eventId, maxEvents: 1 });
    return result.successful > 0;
  }

  /**
   * Replay events by type
   */
  async replayByEventType(eventType: string, maxEvents?: number): Promise<ReplayResult> {
    return this.replay({ eventType, maxEvents });
  }

  /**
   * Replay events by date range
   */
  async replayByDateRange(
    startDate: Date,
    endDate: Date,
    maxEvents?: number
  ): Promise<ReplayResult> {
    return this.replay({ startDate, endDate, maxEvents });
  }

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<{
    totalEvents: number;
    replayableEvents: number;
    eventsByType: Record<string, number>;
  }> {
    const totalEvents = await DLQEventModel.countDocuments();
    const replayableEvents = await DLQEventModel.countDocuments({ replayable: true });

    // Get counts by event type
    const eventTypeAgg = await DLQEventModel.aggregate([
      {
        $group: {
          _id: '$eventType',
          count: { $sum: 1 },
        },
      },
    ]);

    const eventsByType: Record<string, number> = {};
    for (const item of eventTypeAgg) {
      eventsByType[item._id || 'unknown'] = item.count;
    }

    return {
      totalEvents,
      replayableEvents,
      eventsByType,
    };
  }

  /**
   * Check if event was already processed (idempotency)
   */
  private async checkIdempotency(eventId: string): Promise<boolean> {
    const record = await IdempotencyRecordModel.findOne({
      pointsIdempotencyKey: eventId,
      eventScope: 'ingest_event',
    });

    return record !== null;
  }
}
