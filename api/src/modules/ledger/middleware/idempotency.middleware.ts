/**
 * Idempotency Middleware
 * 
 * Express/NestJS middleware that automatically checks for duplicate requests
 * using idempotency keys and returns cached responses when duplicates are detected.
 * 
 * @module api/src/modules/ledger/middleware
 */

import { Request, Response, NextFunction } from 'express';
import { IIdempotencyService } from '../types/idempotency.types';
import { createIdempotencyService } from '../services/idempotency.service';

/**
 * Configuration for idempotency middleware
 */
export interface IdempotencyMiddlewareConfig {
  /** Service instance to use (creates default if not provided) */
  service?: IIdempotencyService;
  
  /** Operation type/scope for this middleware */
  operationType: string;
  
  /** Whether idempotency key is required */
  required?: boolean;
  
  /** Whether to log idempotency checks */
  enableLogging?: boolean;
}

/**
 * Creates Express/NestJS middleware for idempotency checking
 * 
 * This middleware:
 * 1. Extracts idempotency key from request
 * 2. Checks if key has been used before
 * 3. Returns cached response if duplicate
 * 4. Allows request to proceed if new
 * 5. Stores response after processing (via interceptor)
 * 
 * @param config - Configuration for the middleware
 * @returns Express middleware function
 */
export function createIdempotencyMiddleware(
  config: IdempotencyMiddlewareConfig
) {
  const {
    service = createIdempotencyService(),
    operationType,
    required = true,
    enableLogging = true,
  } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract idempotency key
      const idempotencyKey = service.extractIdempotencyKey(req.headers, req.body);

      // If key is required but not provided, reject request
      if (required && !idempotencyKey) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Idempotency-Key header is required for this operation',
          statusCode: 400,
        });
      }

      // If no key provided and not required, skip idempotency check
      if (!idempotencyKey) {
        return next();
      }

      // Validate UUID format
      const validation = service.validateUuid(idempotencyKey);
      if (!validation.isValid) {
        return res.status(400).json({
          error: 'BadRequest',
          message: `Invalid Idempotency-Key format: ${validation.errorMessage}`,
          statusCode: 400,
        });
      }

      // Check for duplicate request
      const checkResult = await service.checkIdempotency(
        idempotencyKey,
        operationType
      );

      if (checkResult.isDuplicate) {
        // Return cached response for duplicate request
        if (enableLogging) {
          console.log(
            `[Idempotency] Duplicate request detected: key=${idempotencyKey}, ` +
            `type=${operationType}, originalTime=${checkResult.originalTimestamp}`
          );
        }

        return res.status(checkResult.statusCode || 200).json(checkResult.storedResult);
      }

      // Store idempotency key in request for later use
      (req as any).idempotencyKey = idempotencyKey;
      (req as any).operationType = operationType;

      // Proceed to handler
      next();
    } catch (error) {
      if (enableLogging) {
        console.error(`[Idempotency] Error in middleware:`, error);
      }
      
      // Don't block request on idempotency errors
      // Log and continue to maintain availability
      next();
    }
  };
}

/**
 * Response interceptor to store idempotent operation results
 * 
 * This should be called after successful operation completion
 * to cache the response for future duplicate requests.
 * 
 * @param req - Express request object
 * @param result - Operation result to store
 * @param statusCode - HTTP status code
 * @param service - Idempotency service instance
 */
export async function storeIdempotentResponse(
  req: Request,
  result: any,
  statusCode: number,
  service?: IIdempotencyService
): Promise<void> {
  const idempotencyKey = (req as any).idempotencyKey;
  const operationType = (req as any).operationType;

  if (!idempotencyKey || !operationType) {
    // No idempotency key present, nothing to store
    return;
  }

  const idempotencyService = service || createIdempotencyService();

  try {
    await idempotencyService.storeResult({
      idempotencyKey,
      operationType,
      result,
      statusCode,
    });
  } catch (error) {
    // Log error but don't fail the request
    console.error('[Idempotency] Failed to store result:', error);
  }
}

/**
 * Utility to check if request has idempotency key
 * 
 * @param req - Express request object
 * @returns True if idempotency key is present
 */
export function hasIdempotencyKey(req: Request): boolean {
  return !!(req as any).idempotencyKey;
}

/**
 * Utility to get idempotency key from request
 * 
 * @param req - Express request object
 * @returns Idempotency key or null
 */
export function getIdempotencyKey(req: Request): string | null {
  return (req as any).idempotencyKey || null;
}
