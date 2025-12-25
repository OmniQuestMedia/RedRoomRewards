/**
 * Ingest Service Tests
 * 
 * Tests DLQ capture, replay safety, and validation
 */

import { IngestService, EventHandler } from '../../src/ingest/service';
import { EventStatus } from '../../src/ingest/types';

describe('IngestService', () => {
  let service: IngestService;
  
  beforeEach(() => {
    service = new IngestService();
  });
  
  afterEach(() => {
    service.stopProcessing();
  });
  
  describe('Event Validation and Rejection', () => {
    it('should reject events with missing userId', async () => {
      // Register handler (should not be called)
      const handler: EventHandler = jest.fn();
      service.registerHandler('points.award', handler);
      
      // Ingest invalid event
      const event = await service.ingest('points.award', {
        // Missing userId
        amount: 100,
      });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check event was rejected
      const processedEvent = await service.getEvent(event.eventId);
      expect(processedEvent?.status).toBe(EventStatus.REJECTED);
      expect(processedEvent?.validationErrors).toContain('Missing userId in payload');
      
      // Handler should not have been called
      expect(handler).not.toHaveBeenCalled();
    });
    
    it('should reject events with invalid amount', async () => {
      const handler: EventHandler = jest.fn();
      service.registerHandler('points.deduct', handler);
      
      const event = await service.ingest('points.deduct', {
        userId: 'user-1',
        amount: 'not-a-number', // Invalid
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const processedEvent = await service.getEvent(event.eventId);
      expect(processedEvent?.status).toBe(EventStatus.REJECTED);
      expect(processedEvent?.validationErrors).toContain('Missing or invalid amount in payload');
      expect(handler).not.toHaveBeenCalled();
    });
    
    it('should accept valid events', async () => {
      const handler: EventHandler = jest.fn().mockResolvedValue({ success: true });
      service.registerHandler('points.award', handler);
      
      const event = await service.ingest('points.award', {
        userId: 'user-1',
        amount: 100,
        reason: 'test',
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const processedEvent = await service.getEvent(event.eventId);
      expect(processedEvent?.status).toBe(EventStatus.PROCESSED);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('DLQ Capture', () => {
    it('should move failed events to DLQ after max retries', async () => {
      // Handler that always fails
      const handler: EventHandler = jest.fn().mockRejectedValue(new Error('Processing failed'));
      service.registerHandler('points.award', handler);
      
      const event = await service.ingest('points.award', {
        userId: 'user-1',
        amount: 100,
      });
      
      // Wait for retries to complete (3 retries + initial attempt)
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Check event moved to DLQ
      const processedEvent = await service.getEvent(event.eventId);
      expect(processedEvent?.status).toBe(EventStatus.DLQ);
      expect(processedEvent?.retryCount).toBe(3);
      
      // Check DLQ contains the event
      const dlq = await service.getDLQ();
      const dlqEntry = dlq.find(e => e.event.eventId === event.eventId);
      expect(dlqEntry).toBeDefined();
      expect(dlqEntry?.reason).toContain('Processing failed');
      expect(dlqEntry?.replayable).toBe(true);
    }, 10000);
    
    it('should retry failed events with exponential backoff', async () => {
      let attemptCount = 0;
      const handler: EventHandler = jest.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Retry me');
        }
        return { success: true };
      });
      
      service.registerHandler('points.award', handler);
      
      const event = await service.ingest('points.award', {
        userId: 'user-1',
        amount: 100,
      });
      
      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Should have succeeded on third attempt
      expect(attemptCount).toBe(3);
      const processedEvent = await service.getEvent(event.eventId);
      expect(processedEvent?.status).toBe(EventStatus.PROCESSED);
    }, 6000);
  });
  
  describe('DLQ Replay', () => {
    it('should replay events from DLQ', async () => {
      let callCount = 0;
      const handler: EventHandler = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First attempt fails');
        }
        // Second attempt (replay) succeeds
        return { success: true };
      });
      
      service.registerHandler('points.award', handler);
      
      // Ingest event that will fail
      const event = await service.ingest('points.award', {
        userId: 'user-1',
        amount: 100,
      });
      
      // Wait for it to move to DLQ
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Verify it's in DLQ
      const dlq1 = await service.getDLQ();
      expect(dlq1.length).toBeGreaterThan(0);
      
      // Replay DLQ
      const replayResult = await service.replayDLQ();
      
      expect(replayResult.replayed).toBeGreaterThan(0);
      expect(replayResult.successes).toBeGreaterThan(0);
      expect(replayResult.successIds).toContain(event.eventId);
      
      // Check event is now processed
      const processedEvent = await service.getEvent(event.eventId);
      expect(processedEvent?.status).toBe(EventStatus.PROCESSED);
    }, 10000);
    
    it('should filter replay by event type', async () => {
      const handler1: EventHandler = jest.fn().mockRejectedValue(new Error('Fail'));
      const handler2: EventHandler = jest.fn().mockRejectedValue(new Error('Fail'));
      
      service.registerHandler('points.award', handler1);
      service.registerHandler('points.deduct', handler2);
      
      // Create two events of different types
      const event1 = await service.ingest('points.award', {
        userId: 'user-1',
        amount: 100,
      });
      
      const event2 = await service.ingest('points.deduct', {
        userId: 'user-1',
        amount: 50,
      });
      
      // Wait for DLQ
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Replay only award events
      const replayResult = await service.replayDLQ({
        eventType: 'points.award',
      });
      
      // Should only replay one type
      expect(replayResult.failureIds).toContain(event1.eventId);
      // event2 should not be replayed
      expect(replayResult.failureIds).not.toContain(event2.eventId);
      expect(replayResult.successIds).not.toContain(event2.eventId);
    }, 10000);
    
    it('should track replay status', async () => {
      const handler: EventHandler = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({ success: true });
      
      service.registerHandler('points.award', handler);
      
      const event = await service.ingest('points.award', {
        userId: 'user-1',
        amount: 100,
      });
      
      // Wait for DLQ
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Get DLQ entry before replay
      const dlq1 = await service.getDLQ();
      const entry1 = dlq1.find(e => e.event.eventId === event.eventId);
      expect(entry1?.replayedAt).toBeUndefined();
      
      // Replay
      await service.replayDLQ();
      
      // Get DLQ entry after replay
      const dlq2 = await service.getDLQ();
      const entry2 = dlq2.find(e => e.event.eventId === event.eventId);
      expect(entry2?.replayedAt).toBeDefined();
      expect(entry2?.replayResult).toBe('success');
    }, 10000);
  });
  
  describe('Statistics', () => {
    it('should track ingestion statistics', async () => {
      const handler: EventHandler = jest.fn().mockResolvedValue({ success: true });
      service.registerHandler('points.award', handler);
      
      // Ingest multiple events
      await service.ingest('points.award', { userId: 'user-1', amount: 100 });
      await service.ingest('points.award', { userId: 'user-2', amount: 200 });
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const stats = await service.getStatistics();
      
      expect(stats.totalIngested).toBe(2);
      expect(stats.totalProcessed).toBe(2);
      expect(stats.totalRejected).toBe(0);
      expect(stats.totalDLQ).toBe(0);
    });
  });
});
