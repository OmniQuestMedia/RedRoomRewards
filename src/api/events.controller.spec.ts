/**
 * Events Controller Tests
 * 
 * Unit tests for the events controller
 */

import { EventsController, PostEventRequest } from './events.controller';
import { IngestEventModel, IngestEventStatus, IdempotencyRecordModel } from '../db/models';
import { MetricsLogger } from '../metrics';

// Mock dependencies
jest.mock('../db/models');
jest.mock('../metrics');

describe('EventsController', () => {
  let controller: EventsController;

  beforeEach(() => {
    controller = new EventsController();
    jest.clearAllMocks();
  });

  describe('postEvent', () => {
    const validRequest: PostEventRequest = {
      eventType: 'user.signup',
      payload: { userId: 'user-123', email: 'test@example.com' },
      idempotencyKey: 'idempotency-key-123',
      requestId: 'request-id-456',
      replayable: true,
    };

    it('should successfully queue a new event', async () => {
      // Mock idempotency check - not a duplicate
      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(null);

      // Mock idempotency storage
      (IdempotencyRecordModel.create as jest.Mock).mockResolvedValue({});

      // Mock event creation
      const mockEvent = {
        _id: 'mongo-id-123',
        eventId: 'evt_test-uuid',
        eventType: 'user.signup',
        receivedAt: new Date(),
        status: IngestEventStatus.QUEUED,
      };
      (IngestEventModel.create as jest.Mock).mockResolvedValue(mockEvent);

      // Mock queue position count
      (IngestEventModel.countDocuments as jest.Mock).mockResolvedValue(5);

      const response = await controller.postEvent(validRequest);

      expect(response.status).toBe('queued');
      expect(response.message).toBe('Event queued for processing');
      expect(response.eventId).toBeDefined();
      expect(response.queuePosition).toBe(6);
      expect(response.requestId).toBe(validRequest.requestId);

      // Verify event was created
      expect(IngestEventModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: validRequest.eventType,
          status: IngestEventStatus.QUEUED,
          payloadSnapshot: validRequest.payload,
          replayable: true,
        })
      );
    });

    it('should detect and handle duplicate requests', async () => {
      // Mock idempotency check - is a duplicate
      const existingRecord = {
        pointsIdempotencyKey: validRequest.idempotencyKey,
        eventScope: 'event_ingestion',
        resultHash: 'existing-event-id',
      };
      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(existingRecord);

      const response = await controller.postEvent(validRequest);

      expect(response.status).toBe('duplicate');
      expect(response.message).toBe('Event already processed or queued');

      // Verify event was NOT created
      expect(IngestEventModel.create).not.toHaveBeenCalled();

      // Verify idempotency hit was logged
      expect(MetricsLogger.incrementCounter).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          idempotencyKey: validRequest.idempotencyKey,
        })
      );
    });

    it('should generate event ID if not provided', async () => {
      const requestWithoutEventId = { ...validRequest };
      delete requestWithoutEventId.eventId;

      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(null);
      (IdempotencyRecordModel.create as jest.Mock).mockResolvedValue({});
      (IngestEventModel.create as jest.Mock).mockResolvedValue({
        eventId: 'generated-id',
        receivedAt: new Date(),
      });
      (IngestEventModel.countDocuments as jest.Mock).mockResolvedValue(0);

      const response = await controller.postEvent(requestWithoutEventId);

      expect(response.eventId).toBeDefined();
      expect(response.eventId).toMatch(/^evt_/);
    });

    it('should generate request ID if not provided', async () => {
      const requestWithoutRequestId = { ...validRequest };
      delete requestWithoutRequestId.requestId;

      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(null);
      (IdempotencyRecordModel.create as jest.Mock).mockResolvedValue({});
      (IngestEventModel.create as jest.Mock).mockResolvedValue({
        eventId: 'evt-123',
        receivedAt: new Date(),
      });
      (IngestEventModel.countDocuments as jest.Mock).mockResolvedValue(0);

      const response = await controller.postEvent(requestWithoutRequestId);

      expect(response.requestId).toBeDefined();
      expect(response.requestId).toMatch(/^req_/);
    });

    it('should default replayable to true if not provided', async () => {
      const requestWithoutReplayable = { ...validRequest };
      delete requestWithoutReplayable.replayable;

      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(null);
      (IdempotencyRecordModel.create as jest.Mock).mockResolvedValue({});
      (IngestEventModel.create as jest.Mock).mockResolvedValue({
        eventId: 'evt-123',
        receivedAt: new Date(),
      });
      (IngestEventModel.countDocuments as jest.Mock).mockResolvedValue(0);

      await controller.postEvent(requestWithoutReplayable);

      expect(IngestEventModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          replayable: true,
        })
      );
    });
  });

  describe('validation', () => {
    it('should reject request without idempotency key', async () => {
      const invalidRequest = {
        eventType: 'user.signup',
        payload: { userId: 'user-123' },
      } as unknown as PostEventRequest;

      await expect(controller.postEvent(invalidRequest)).rejects.toThrow('Validation failed');
    });

    it('should reject request with empty idempotency key', async () => {
      const invalidRequest: PostEventRequest = {
        eventType: 'user.signup',
        payload: { userId: 'user-123' },
        idempotencyKey: '',
      };

      await expect(controller.postEvent(invalidRequest)).rejects.toThrow('Validation failed');
    });

    it('should reject request with idempotency key too long', async () => {
      const invalidRequest: PostEventRequest = {
        eventType: 'user.signup',
        payload: { userId: 'user-123' },
        idempotencyKey: 'a'.repeat(257),
      };

      await expect(controller.postEvent(invalidRequest)).rejects.toThrow('Validation failed');
    });

    it('should reject request without event type', async () => {
      const invalidRequest = {
        payload: { userId: 'user-123' },
        idempotencyKey: 'idem-123',
      } as unknown as PostEventRequest;

      await expect(controller.postEvent(invalidRequest)).rejects.toThrow('Validation failed');
    });

    it('should reject request with event type too long', async () => {
      const invalidRequest: PostEventRequest = {
        eventType: 'a'.repeat(129),
        payload: { userId: 'user-123' },
        idempotencyKey: 'idem-123',
      };

      await expect(controller.postEvent(invalidRequest)).rejects.toThrow('Validation failed');
    });

    it('should reject request without payload', async () => {
      const invalidRequest = {
        eventType: 'user.signup',
        idempotencyKey: 'idem-123',
      } as unknown as PostEventRequest;

      await expect(controller.postEvent(invalidRequest)).rejects.toThrow('Validation failed');
    });

    it('should reject request with array payload', async () => {
      const invalidRequest = {
        eventType: 'user.signup',
        payload: ['not', 'an', 'object'],
        idempotencyKey: 'idem-123',
      } as any;

      await expect(controller.postEvent(invalidRequest)).rejects.toThrow('Validation failed');
    });

    it('should reject request with invalid replayable type', async () => {
      const invalidRequest = {
        eventType: 'user.signup',
        payload: { userId: 'user-123' },
        idempotencyKey: 'idem-123',
        replayable: 'yes',
      } as any;

      await expect(controller.postEvent(invalidRequest)).rejects.toThrow('Validation failed');
    });

    it('should reject request with event ID too long', async () => {
      const invalidRequest: PostEventRequest = {
        eventId: 'a'.repeat(257),
        eventType: 'user.signup',
        payload: { userId: 'user-123' },
        idempotencyKey: 'idem-123',
      };

      await expect(controller.postEvent(invalidRequest)).rejects.toThrow('Validation failed');
    });

    it('should provide validation error details', async () => {
      const invalidRequest = {
        payload: { userId: 'user-123' },
      } as unknown as PostEventRequest;

      try {
        await controller.postEvent(invalidRequest);
        fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error.validationErrors).toBeDefined();
        expect(Array.isArray(error.validationErrors)).toBe(true);
        expect(error.validationErrors.length).toBeGreaterThan(0);
        
        // Check structure of validation errors
        const validationError = error.validationErrors[0];
        expect(validationError).toHaveProperty('field');
        expect(validationError).toHaveProperty('message');
        expect(validationError).toHaveProperty('code');
      }
    });
  });

  describe('idempotency', () => {
    const validRequest: PostEventRequest = {
      eventType: 'user.signup',
      payload: { userId: 'user-123' },
      idempotencyKey: 'idem-key-abc',
    };

    it('should store idempotency record on success', async () => {
      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(null);
      (IdempotencyRecordModel.create as jest.Mock).mockResolvedValue({});
      (IngestEventModel.create as jest.Mock).mockResolvedValue({
        eventId: 'evt-123',
        receivedAt: new Date(),
      });
      (IngestEventModel.countDocuments as jest.Mock).mockResolvedValue(0);

      await controller.postEvent(validRequest);

      expect(IdempotencyRecordModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pointsIdempotencyKey: validRequest.idempotencyKey,
          eventScope: 'event_ingestion',
        })
      );
    });

    it('should handle idempotency record race condition', async () => {
      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue(null);
      
      // Simulate duplicate key error (race condition)
      const duplicateKeyError = new Error('Duplicate key');
      (duplicateKeyError as any).code = 11000;
      (IdempotencyRecordModel.create as jest.Mock).mockRejectedValue(duplicateKeyError);

      (IngestEventModel.create as jest.Mock).mockResolvedValue({
        eventId: 'evt-123',
        receivedAt: new Date(),
      });
      (IngestEventModel.countDocuments as jest.Mock).mockResolvedValue(0);

      // Should not throw error
      const response = await controller.postEvent(validRequest);
      expect(response.status).toBe('queued');
    });
  });

  describe('metrics', () => {
    const validRequest: PostEventRequest = {
      eventType: 'user.signup',
      payload: { userId: 'user-123' },
      idempotencyKey: 'idem-123',
    };

    it('should log idempotency hit on duplicate', async () => {
      (IdempotencyRecordModel.findOne as jest.Mock).mockResolvedValue({
        pointsIdempotencyKey: validRequest.idempotencyKey,
      });

      await controller.postEvent(validRequest);

      expect(MetricsLogger.incrementCounter).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          idempotencyKey: validRequest.idempotencyKey,
          eventType: validRequest.eventType,
        })
      );
    });
  });
});
