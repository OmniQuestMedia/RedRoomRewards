/**
 * Lightweight Metrics Logger
 *
 * Simple console-based metrics logging for M1 production hardening.
 * Emits structured JSON to stdout/stderr so external collection
 * (CloudWatch, Datadog, Better Stack) can parse on its own — this is
 * intentional and predates the pino migration in D-001.
 *
 * Follow-up tracked in CLEANUP.md: replace these console.* writes with
 * pino while preserving the AlertSeverity / MetricEventType routing.
 * The route table here doesn't map cleanly onto pino's level scheme
 * (info/warn/error), so the migration needs explicit mapping rather
 * than a sed-and-pray.
 */

import { MetricData, AlertData, MetricEventType, AlertSeverity } from './types';

/**
 * Simple metrics logger using console output
 * Designed for easy integration with external monitoring systems
 */
export class MetricsLogger {
  /**
   * Log a metric event
   */
  static logMetric(data: MetricData): void {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_METRICS_LOGS === '1') return;

    const logEntry = {
      level: 'METRIC',
      type: data.type,
      value: data.value,
      timestamp: data.timestamp.toISOString(),
      metadata: data.metadata,
    };

    console.log(JSON.stringify(logEntry));
  }

  /**
   * Log an alert
   */
  static logAlert(data: AlertData): void {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_METRICS_LOGS === '1') return;

    const logEntry = {
      level: 'ALERT',
      severity: data.severity,
      message: data.message,
      metricType: data.metricType,
      timestamp: data.timestamp.toISOString(),
      metadata: data.metadata,
    };

    // Use appropriate console method based on severity
    switch (data.severity) {
      case AlertSeverity.CRITICAL:
      case AlertSeverity.ERROR:
        console.error(JSON.stringify(logEntry));
        break;
      case AlertSeverity.WARNING:
        console.warn(JSON.stringify(logEntry));
        break;
      default:
        console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Helper to log a simple counter metric
   */
  static incrementCounter(type: MetricEventType, metadata?: Record<string, unknown>): void {
    MetricsLogger.logMetric({
      type,
      value: 1,
      timestamp: new Date(),
      metadata,
    });
  }

  /**
   * Helper to log a duration metric (in milliseconds)
   */
  static recordDuration(
    type: MetricEventType,
    durationMs: number,
    metadata?: Record<string, unknown>,
  ): void {
    MetricsLogger.logMetric({
      type,
      value: durationMs,
      timestamp: new Date(),
      metadata,
    });
  }
}
