/**
 * Acknowledgment Service Tests
 * 
 * Tests ack retries and delivery state tracking
 */

import { AckService, DeliveryFunction } from '../../src/acks/service';
import { DeliveryState } from '../../src/acks/types';

describe('AckService', () => {
  describe('Delivery and Retry', () => {
    it('should deliver acknowledgment successfully', async () => {
      const deliveryFn: DeliveryFunction = jest.fn().mockResolvedValue({ delivered: true });
      const service = new AckService(deliveryFn);
      
      const ack = await service.createAck('target-1', 'event-1', { data: 'test' });
      
      // Wait for delivery
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const updatedAck = await service.getAck(ack.ackId);
      expect(updatedAck?.state).toBe(DeliveryState.DELIVERED);
      expect(updatedAck?.deliveredAt).toBeDefined();
      expect(deliveryFn).toHaveBeenCalledTimes(1);
    });
    
    it('should retry failed deliveries', async () => {
      let attemptCount = 0;
      const deliveryFn: DeliveryFunction = jest.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Delivery failed');
        }
        return { delivered: true };
      });
      
      const service = new AckService(deliveryFn);
      
      const ack = await service.createAck('target-1', 'event-1', { data: 'test' });
      
      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      expect(attemptCount).toBe(3);
      const updatedAck = await service.getAck(ack.ackId);
      expect(updatedAck?.state).toBe(DeliveryState.DELIVERED);
      expect(updatedAck?.retryCount).toBe(2);
    }, 6000);
    
    it('should mark as failed permanent after max retries', async () => {
      const deliveryFn: DeliveryFunction = jest.fn().mockRejectedValue(new Error('Always fails'));
      const service = new AckService(deliveryFn);
      
      const ack = await service.createAck('target-1', 'event-1', { data: 'test' });
      
      // Wait for all retries
      await new Promise(resolve => setTimeout(resolve, 35000));
      
      const updatedAck = await service.getAck(ack.ackId);
      expect(updatedAck?.state).toBe(DeliveryState.FAILED_PERMANENT);
      expect(updatedAck?.retryCount).toBe(5);
      expect(updatedAck?.errorMessage).toContain('Always fails');
    }, 40000);
    
    it('should use exponential backoff for retries', async () => {
      const attempts: number[] = [];
      let startTime: number;
      
      const deliveryFn: DeliveryFunction = jest.fn().mockImplementation(async () => {
        if (attempts.length === 0) {
          startTime = Date.now();
        }
        attempts.push(Date.now() - startTime);
        throw new Error('Retry');
      });
      
      const service = new AckService(deliveryFn);
      
      await service.createAck('target-1', 'event-1', { data: 'test' });
      
      // Wait for several retries
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Check that delays increase (exponential backoff)
      expect(attempts.length).toBeGreaterThan(2);
      // Second retry should be ~2x delay of first
      // Third retry should be ~4x delay of first, etc.
      if (attempts.length >= 3) {
        expect(attempts[1]).toBeGreaterThan(attempts[0] * 1.5);
        expect(attempts[2]).toBeGreaterThan(attempts[1] * 1.5);
      }
    }, 10000);
  });
  
  describe('Delivery State Tracking', () => {
    it('should track pending state initially', async () => {
      const deliveryFn: DeliveryFunction = jest.fn().mockImplementation(async () => {
        // Delay to keep it pending
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { delivered: true };
      });
      
      const service = new AckService(deliveryFn);
      
      const ack = await service.createAck('target-1', 'event-1', { data: 'test' });
      
      // Check immediately - should be pending or delivering
      expect(ack.state).toBe(DeliveryState.PENDING);
    });
    
    it('should track delivering state during delivery', async () => {
      let resolveDelivery: () => void;
      const deliveryPromise = new Promise<void>(resolve => {
        resolveDelivery = resolve;
      });
      
      const deliveryFn: DeliveryFunction = jest.fn().mockImplementation(async () => {
        await deliveryPromise;
        return { delivered: true };
      });
      
      const service = new AckService(deliveryFn);
      
      const ack = await service.createAck('target-1', 'event-1', { data: 'test' });
      
      // Wait a bit for delivery to start
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const updatedAck = await service.getAck(ack.ackId);
      expect(updatedAck?.state).toBe(DeliveryState.DELIVERING);
      
      // Finish delivery
      resolveDelivery!();
    });
    
    it('should track failed state on retry', async () => {
      let callCount = 0;
      const deliveryFn: DeliveryFunction = jest.fn().mockImplementation(async () => {
        callCount++;
        throw new Error('Fail');
      });
      
      const service = new AckService(deliveryFn);
      
      const ack = await service.createAck('target-1', 'event-1', { data: 'test' });
      
      // Wait for first failure
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const updatedAck = await service.getAck(ack.ackId);
      expect(updatedAck?.state).toBe(DeliveryState.FAILED);
      expect(updatedAck?.nextRetryAt).toBeDefined();
      expect(updatedAck?.errorMessage).toBeDefined();
    });
    
    it('should update last attempt timestamp', async () => {
      let callCount = 0;
      const deliveryFn: DeliveryFunction = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Fail once');
        }
        return { delivered: true };
      });
      
      const service = new AckService(deliveryFn);
      
      const ack = await service.createAck('target-1', 'event-1', { data: 'test' });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const afterFirst = await service.getAck(ack.ackId);
      const firstAttempt = afterFirst?.lastAttemptAt;
      
      // Wait for retry
      await new Promise(resolve => setTimeout(resolve, 2000));
      const afterRetry = await service.getAck(ack.ackId);
      const secondAttempt = afterRetry?.lastAttemptAt;
      
      expect(secondAttempt).toBeDefined();
      expect(secondAttempt!.getTime()).toBeGreaterThan(firstAttempt!.getTime());
    }, 3000);
  });
  
  describe('Manual Retry', () => {
    it('should allow manual retry of failed ack', async () => {
      let callCount = 0;
      const deliveryFn: DeliveryFunction = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Fail first time');
        }
        return { delivered: true };
      });
      
      const service = new AckService(deliveryFn);
      
      const ack = await service.createAck('target-1', 'event-1', { data: 'test' });
      
      // Wait for initial failure
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Manual retry
      const retryResult = await service.retryAck(ack.ackId);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(retryResult.success).toBe(true);
      const updatedAck = await service.getAck(ack.ackId);
      expect(updatedAck?.state).toBe(DeliveryState.DELIVERED);
    });
  });
  
  describe('Statistics', () => {
    it('should track delivery statistics', async () => {
      const deliveryFn: DeliveryFunction = jest.fn()
        .mockResolvedValueOnce({ delivered: true })
        .mockResolvedValueOnce({ delivered: true })
        .mockRejectedValueOnce(new Error('Fail'));
      
      const service = new AckService(deliveryFn);
      
      await service.createAck('target-1', 'event-1', { data: 'test1' });
      await service.createAck('target-2', 'event-2', { data: 'test2' });
      await service.createAck('target-3', 'event-3', { data: 'test3' });
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const stats = await service.getStatistics();
      
      expect(stats.totalCreated).toBe(3);
      expect(stats.totalDelivered).toBe(2);
      expect(stats.totalFailed).toBeGreaterThan(0);
    });
  });
});
