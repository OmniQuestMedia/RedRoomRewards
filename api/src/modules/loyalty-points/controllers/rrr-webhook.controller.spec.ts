import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { RRRWebhookController } from './rrr-webhook.controller';
import * as crypto from 'crypto';

/**
 * Test suite for RRR Webhook Controller
 * 
 * Focus areas:
 * 1. Input validation (prevents injection attacks)
 * 2. Signature verification
 * 3. Idempotency protection
 * 4. CodeQL compliance (validated primitives before DB queries)
 */
describe('RRRWebhookController', () => {
  let controller: RRRWebhookController;
  let mockWebhookEventModel: any;

  // Mock webhook secret for testing
  const WEBHOOK_SECRET = 'test-secret-key';

  beforeEach(async () => {
    // Mock Mongoose model
    mockWebhookEventModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
      updateOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
      }),
    };

    // Set environment variable for webhook secret
    process.env.RRR_WEBHOOK_SECRET = WEBHOOK_SECRET;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RRRWebhookController],
      providers: [
        {
          provide: getModelToken('WebhookEvent'),
          useValue: mockWebhookEventModel,
        },
      ],
    }).compile();

    controller = module.get<RRRWebhookController>(RRRWebhookController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper: Generate valid HMAC signature
   */
  function generateSignature(payload: any): string {
    const bodyString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(bodyString)
      .digest('hex');
  }

  describe('Security: Input Validation', () => {
    it('should reject payload with event_id as object (operator injection attempt)', async () => {
      // CRITICAL TEST: Prevents NoSQL operator injection
      const maliciousPayload = {
        event_type: 'test.event',
        event_id: { $ne: null }, // Attack: MongoDB operator
        data: {},
      };

      const signature = generateSignature(maliciousPayload);

      await expect(
        controller.handleWebhook(signature, maliciousPayload),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.handleWebhook(signature, maliciousPayload),
      ).rejects.toThrow('event_id must be a string');

      // Verify no database query was made
      expect(mockWebhookEventModel.findOne).not.toHaveBeenCalled();
    });

    it('should reject payload with event_id containing $ character', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: '$malicious',
        data: {},
      };

      const signature = generateSignature(payload);

      await expect(
        controller.handleWebhook(signature, payload),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.handleWebhook(signature, payload),
      ).rejects.toThrow('illegal characters');
    });

    it('should reject payload with event_id containing . character', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: 'event.with.dots',
        data: {},
      };

      const signature = generateSignature(payload);

      await expect(
        controller.handleWebhook(signature, payload),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.handleWebhook(signature, payload),
      ).rejects.toThrow('illegal characters');
    });

    it('should reject empty event_id', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: '   ',
        data: {},
      };

      const signature = generateSignature(payload);

      await expect(
        controller.handleWebhook(signature, payload),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.handleWebhook(signature, payload),
      ).rejects.toThrow('event_id is required');
    });

    it('should reject event_id that is too long', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: 'a'.repeat(129), // Over 128 character limit
        data: {},
      };

      const signature = generateSignature(payload);

      await expect(
        controller.handleWebhook(signature, payload),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.handleWebhook(signature, payload),
      ).rejects.toThrow('event_id too long');
    });

    it('should reject payload with missing event_id', async () => {
      const payload = {
        event_type: 'test.event',
        data: {},
      };

      const signature = generateSignature(payload);

      await expect(
        controller.handleWebhook(signature, payload),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.handleWebhook(signature, payload),
      ).rejects.toThrow('event_id must be a string');
    });
  });

  describe('Security: Signature Verification', () => {
    it('should reject webhook with invalid signature', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: 'evt-12345',
        data: {},
      };

      const invalidSignature = 'invalid-signature';

      await expect(
        controller.handleWebhook(invalidSignature, payload),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.handleWebhook(invalidSignature, payload),
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('should reject webhook with missing signature', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: 'evt-12345',
        data: {},
      };

      await expect(
        controller.handleWebhook(undefined as any, payload),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept webhook with valid signature', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: 'evt-12345',
        data: { userId: 'user-123', points: 100 },
      };

      const signature = generateSignature(payload);

      const result = await controller.handleWebhook(signature, payload);

      expect(result).toEqual({ received: true });
      expect(mockWebhookEventModel.updateOne).toHaveBeenCalled();
    });
  });

  describe('Idempotency Protection', () => {
    it('should process new event successfully', async () => {
      const payload = {
        event_type: 'points.awarded',
        event_id: 'evt-new-12345',
        data: { userId: 'user-123', points: 50 },
      };

      const signature = generateSignature(payload);

      // Mock: event not found (new event)
      mockWebhookEventModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await controller.handleWebhook(signature, payload);

      expect(result).toEqual({ received: true });
      expect(mockWebhookEventModel.findOne).toHaveBeenCalledWith(
        { event_id: { $eq: 'evt-new-12345' } },
        { _id: 1 },
      );
      expect(mockWebhookEventModel.updateOne).toHaveBeenCalledWith(
        { event_id: { $eq: 'evt-new-12345' } },
        expect.objectContaining({
          $setOnInsert: expect.objectContaining({
            event_id: 'evt-new-12345',
            event_type: 'points.awarded',
          }),
        }),
        { upsert: true },
      );
    });

    it('should skip processing duplicate event (idempotency)', async () => {
      const payload = {
        event_type: 'points.awarded',
        event_id: 'evt-duplicate-12345',
        data: { userId: 'user-123', points: 50 },
      };

      const signature = generateSignature(payload);

      // Mock: event already exists
      mockWebhookEventModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ _id: 'some-id' }),
        }),
      });

      const result = await controller.handleWebhook(signature, payload);

      expect(result).toEqual({ received: true });
      expect(mockWebhookEventModel.findOne).toHaveBeenCalledWith(
        { event_id: { $eq: 'evt-duplicate-12345' } },
        { _id: 1 },
      );
      // Should NOT call updateOne for duplicate
      expect(mockWebhookEventModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('CodeQL Compliance', () => {
    it('should use $eq operator in database queries', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: 'evt-codeql-test',
        data: {},
      };

      const signature = generateSignature(payload);

      await controller.handleWebhook(signature, payload);

      // Verify findOne uses $eq operator
      expect(mockWebhookEventModel.findOne).toHaveBeenCalledWith(
        { event_id: { $eq: 'evt-codeql-test' } },
        expect.any(Object),
      );

      // Verify updateOne uses $eq operator
      expect(mockWebhookEventModel.updateOne).toHaveBeenCalledWith(
        { event_id: { $eq: 'evt-codeql-test' } },
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should validate input before any database operation', async () => {
      const maliciousPayload = {
        event_type: 'test.event',
        event_id: { $gt: '' }, // Attack attempt
        data: {},
      };

      const signature = generateSignature(maliciousPayload);

      await expect(
        controller.handleWebhook(signature, maliciousPayload),
      ).rejects.toThrow();

      // Confirm no database queries were executed
      expect(mockWebhookEventModel.findOne).not.toHaveBeenCalled();
      expect(mockWebhookEventModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle event_id with whitespace (trim)', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: '  evt-whitespace-123  ',
        data: {},
      };

      const signature = generateSignature(payload);

      const result = await controller.handleWebhook(signature, payload);

      expect(result).toEqual({ received: true });
      
      // Verify trimmed event_id is used in database query
      expect(mockWebhookEventModel.findOne).toHaveBeenCalledWith(
        { event_id: { $eq: 'evt-whitespace-123' } },
        expect.any(Object),
      );
    });

    it('should accept valid event_id at maximum length', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: 'a'.repeat(128), // Exactly 128 characters
        data: {},
      };

      const signature = generateSignature(payload);

      const result = await controller.handleWebhook(signature, payload);

      expect(result).toEqual({ received: true });
    });

    it('should handle UUID-format event_id', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: '550e8400-e29b-41d4-a716-446655440000',
        data: {},
      };

      const signature = generateSignature(payload);

      const result = await controller.handleWebhook(signature, payload);

      expect(result).toEqual({ received: true });
    });
  });
});
