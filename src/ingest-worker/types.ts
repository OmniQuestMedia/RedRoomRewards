/**
 * Ingest Worker Types
 * 
 * Type definitions for the ingest worker and event processing
 */

export enum ProcessingResult {
  SUCCESS = 'SUCCESS',
  RETRYABLE_FAILURE = 'RETRYABLE_FAILURE',
  NON_RETRYABLE_FAILURE = 'NON_RETRYABLE_FAILURE',
}

export interface EventProcessingContext {
  eventId: string;
  eventType?: string;
  eventScope?: string;
  payload?: Record<string, any>;
  attempts: number;
}

export interface ProcessingResponse {
  result: ProcessingResult;
  errorCode?: string;
  errorMessage?: string;
}

export type EventHandler = (
  context: EventProcessingContext
) => Promise<ProcessingResponse>;

export interface WorkerConfig {
  pollIntervalMs: number;
  maxConcurrentJobs: number;
  maxRetryAttempts: number;
  initialRetryDelayMs: number;
  maxRetryDelayMs: number;
  retryBackoffMultiplier: number;
}

export interface ReplayOptions {
  eventId?: string;
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  maxEvents?: number;
}

export interface ReplayResult {
  totalReplayed: number;
  successful: number;
  failed: number;
  skipped: number;
}
