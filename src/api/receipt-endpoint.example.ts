/**
 * Receipt Endpoint Integration Example
 *
 * Example showing how to integrate the receipt lookup endpoint
 * with HTTP framework (Express, Fastify, etc.) using the auth guard.
 *
 * This is a reference implementation - adapt to your HTTP framework.
 */

import { EventsController } from './events.controller';
import { checkAdminSupportAuth, withAdminSupportAuth, AuthGuardConfig } from './support-auth.guard';

/**
 * HTTP Request interface (framework-agnostic)
 */
interface HTTPRequest {
  headers: {
    authorization?: string;
  };
  query: {
    merchantId?: string;
    idempotencyKey?: string;
  };
}

/**
 * HTTP Response interface (framework-agnostic)
 */
interface HTTPResponse {
  status(code: number): HTTPResponse;
  json(data: any): void; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Configuration for receipt endpoint
 */
interface ReceiptEndpointConfig {
  authConfig: AuthGuardConfig;
  controller: EventsController;
}

/**
 * Receipt Endpoint Handler
 *
 * GET /v1/events/receipt?merchantId=...&idempotencyKey=...
 *
 * Protected by admin/support auth guard.
 * Returns event receipt with only approved fields.
 *
 * Example Usage with Express:
 * ```
 * app.get('/v1/events/receipt', async (req, res) => {
 *   await handleReceiptRequest(req, res, config);
 * });
 * ```
 *
 * Example Usage with Fastify:
 * ```
 * fastify.get('/v1/events/receipt', async (request, reply) => {
 *   await handleReceiptRequest(request, reply, config);
 * });
 * ```
 */
export async function handleReceiptRequest(
  req: HTTPRequest,
  res: HTTPResponse,
  config: ReceiptEndpointConfig,
): Promise<void> {
  // Validate query parameters
  const merchantId = req.query.merchantId;
  const idempotencyKey = req.query.idempotencyKey;

  if (!merchantId || !idempotencyKey) {
    res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'Both merchantId and idempotencyKey query parameters are required',
    });
    return;
  }

  // Check authentication and authorization
  const authResult = checkAdminSupportAuth(req.headers.authorization, config.authConfig);

  if (!authResult.authorized) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: authResult.reason || 'Authentication required',
    });
    return;
  }

  try {
    // Lookup receipt
    const receipt = await config.controller.getEventReceipt(merchantId, idempotencyKey);

    if (!receipt) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Event receipt not found',
      });
      return;
    }

    // Return receipt (only approved fields)
    res.status(200).json(receipt);
  } catch {
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve receipt',
    });
  }
}

/**
 * Alternative: Functional approach using withAdminSupportAuth helper
 */
export async function handleReceiptRequestFunctional(
  req: HTTPRequest,
  res: HTTPResponse,
  config: ReceiptEndpointConfig,
): Promise<void> {
  // Validate query parameters
  const merchantId = req.query.merchantId;
  const idempotencyKey = req.query.idempotencyKey;

  if (!merchantId || !idempotencyKey) {
    res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'Both merchantId and idempotencyKey query parameters are required',
    });
    return;
  }

  // Use auth wrapper helper
  const result = await withAdminSupportAuth(
    req.headers.authorization,
    config.authConfig,
    async () => config.controller.getEventReceipt(merchantId, idempotencyKey),
  );

  if (result.authorized === false) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: result.error,
    });
    return;
  }

  if (!result.data) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Event receipt not found',
    });
    return;
  }

  res.status(200).json(result.data);
}

/**
 * Example Express integration
 *
 * ```typescript
 * import express from 'express';
 * import { createEventsController } from './events.controller';
 * import { handleReceiptRequest } from './receipt-endpoint.example';
 *
 * const app = express();
 * const controller = createEventsController();
 * const config = {
 *   authConfig: {
 *     jwtSecret: process.env.JWT_SECRET,
 *     algorithm: 'HS256',
 *   },
 *   controller,
 * };
 *
 * // Internal support endpoint - protected by admin auth
 * app.get('/internal/v1/events/receipt', async (req, res) => {
 *   await handleReceiptRequest(req, res, config);
 * });
 * ```
 */

/**
 * Example Fastify integration
 *
 * ```typescript
 * import Fastify from 'fastify';
 * import { createEventsController } from './events.controller';
 * import { handleReceiptRequest } from './receipt-endpoint.example';
 *
 * const fastify = Fastify();
 * const controller = createEventsController();
 * const config = {
 *   authConfig: {
 *     jwtSecret: process.env.JWT_SECRET,
 *     algorithm: 'HS256',
 *   },
 *   controller,
 * };
 *
 * // Internal support endpoint - protected by admin auth
 * fastify.get('/internal/v1/events/receipt', async (request, reply) => {
 *   await handleReceiptRequest(request, reply, config);
 * });
 * ```
 */

/**
 * Security Notes:
 *
 * 1. Always use HTTPS in production
 * 2. Rate limit this endpoint to prevent abuse
 * 3. Log all access attempts with admin user ID for audit trail
 * 4. Never expose internal error details to clients
 * 5. Use environment variables for JWT secret
 * 6. Consider IP whitelisting for internal endpoints
 * 7. Regularly rotate JWT secrets
 * 8. Monitor for suspicious access patterns
 */
