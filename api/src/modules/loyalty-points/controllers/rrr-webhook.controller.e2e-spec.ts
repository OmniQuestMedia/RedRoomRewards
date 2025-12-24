import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import * as request from 'supertest';
import * as crypto from 'crypto';
import { RRRWebhookController } from './rrr-webhook.controller';

/**
 * E2E Test Suite for RRR Webhook Controller
 * 
 * Tests the webhook endpoint via HTTP using SuperTest.
 * Focus: Security validation against NoSQL operator injection.
 * 
 * This test specifically validates that posting:
 *   { event_id: { "$ne": null } }
 * returns a 400 Bad Request, preventing MongoDB operator injection.
 */
describe('RRRWebhookController (e2e)', () => {
  let app: INestApplication;
  const WEBHOOK_SECRET = 'test-secret-key-e2e';

  beforeAll(async () => {
    // Set webhook secret for testing
    process.env.RRR_WEBHOOK_SECRET = WEBHOOK_SECRET;

    // Mock Mongoose model for e2e testing (no real DB needed)
    const mockWebhookEventModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
      updateOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
      }),
    };

    // Create minimal test module with mocked dependencies
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RRRWebhookController],
      providers: [
        {
          provide: getModelToken('WebhookEvent'),
          useValue: mockWebhookEventModel,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Helper: Generate valid HMAC signature for webhook payload
   */
  function generateSignature(payload: any): string {
    const bodyString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(bodyString)
      .digest('hex');
  }

  describe('POST /webhooks/rrr - NoSQL Injection Prevention', () => {
    /**
     * CRITICAL SECURITY TEST
     * 
     * Validates that the webhook endpoint rejects payloads where event_id
     * is a MongoDB operator object instead of a string.
     * 
     * Attack vector: { event_id: { "$ne": null } }
     * Expected: 400 Bad Request with validation error message
     */
    it('should return 400 when event_id is an object with $ne operator', async () => {
      // Malicious payload attempting NoSQL operator injection
      const maliciousPayload = {
        event_type: 'test.event',
        event_id: { $ne: null }, // MongoDB operator injection attempt
        data: { test: 'data' },
      };

      const signature = generateSignature(maliciousPayload);

      const response = await request(app.getHttpServer())
        .post('/webhooks/rrr')
        .set('x-rrr-signature', signature)
        .send(maliciousPayload)
        .expect(400);

      // Verify error message indicates validation failure
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('event_id must be a string');
    });

    /**
     * Additional security validation tests
     */
    it('should return 400 when event_id contains $ character', async () => {
      const payload = {
        event_type: 'test.event',
        event_id: '$malicious',
        data: {},
      };

      const signature = generateSignature(payload);

      const response = await request(app.getHttpServer())
        .post('/webhooks/rrr')
        .set('x-rrr-signature', signature)
        .send(payload)
        .expect(400);

      expect(response.body.message).toContain('illegal characters');
    });

    it('should return 400 when event_id is missing', async () => {
      const payload = {
        event_type: 'test.event',
        data: {},
      };

      const signature = generateSignature(payload);

      const response = await request(app.getHttpServer())
        .post('/webhooks/rrr')
        .set('x-rrr-signature', signature)
        .send(payload)
        .expect(400);

      expect(response.body.message).toContain('event_id must be a string');
    });

    /**
     * Positive test case: Valid payload should be accepted
     */
    it('should return 200 when event_id is a valid string', async () => {
      const validPayload = {
        event_type: 'test.event',
        event_id: 'evt-valid-12345',
        data: { test: 'data' },
      };

      const signature = generateSignature(validPayload);

      const response = await request(app.getHttpServer())
        .post('/webhooks/rrr')
        .set('x-rrr-signature', signature)
        .send(validPayload)
        .expect(201);

      expect(response.body).toHaveProperty('received', true);
    });
  });
});
