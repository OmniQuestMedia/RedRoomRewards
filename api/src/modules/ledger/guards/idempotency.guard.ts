/**
 * Idempotency Guard
 * 
 * NestJS guard that enforces idempotency requirements on controller endpoints.
 * Checks for duplicate requests and returns cached responses when detected.
 * 
 * @module api/src/modules/ledger/guards
 */

import { Injectable, CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IIdempotencyService } from '../types/idempotency.types';
import { createIdempotencyService } from '../services/idempotency.service';

/**
 * Metadata key for idempotency decorator
 */
export const IDEMPOTENCY_KEY = 'idempotency';

/**
 * Idempotency metadata
 */
export interface IdempotencyMetadata {
  /** Operation type/scope */
  operationType: string;
  
  /** Whether idempotency key is required */
  required?: boolean;
}

/**
 * Decorator to mark endpoints as requiring idempotency
 * 
 * Usage:
 * ```typescript
 * @Idempotent({ operationType: 'ledger_transaction', required: true })
 * async createTransaction() { ... }
 * ```
 */
export const Idempotent = (metadata: IdempotencyMetadata) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(IDEMPOTENCY_KEY, metadata, descriptor.value);
    return descriptor;
  };
};

/**
 * NestJS Guard for idempotency enforcement
 * 
 * This guard:
 * 1. Checks for @Idempotent decorator on endpoints
 * 2. Validates idempotency keys
 * 3. Prevents duplicate request processing
 * 4. Returns cached responses for duplicates
 */
@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly service: IIdempotencyService;

  constructor(
    private readonly reflector: Reflector,
    service?: IIdempotencyService
  ) {
    this.service = service || createIdempotencyService();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get idempotency metadata from decorator
    const metadata = this.reflector.get<IdempotencyMetadata>(
      IDEMPOTENCY_KEY,
      context.getHandler()
    );

    // If no metadata, endpoint doesn't require idempotency
    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Extract idempotency key
    const idempotencyKey = this.service.extractIdempotencyKey(
      request.headers,
      request.body
    );

    // Check if key is required
    if (metadata.required && !idempotencyKey) {
      throw new BadRequestException(
        'Idempotency-Key header is required for this operation'
      );
    }

    // If no key provided and not required, allow request
    if (!idempotencyKey) {
      return true;
    }

    // Validate UUID format
    const validation = this.service.validateUuid(idempotencyKey);
    if (!validation.isValid) {
      throw new BadRequestException(
        `Invalid Idempotency-Key format: ${validation.errorMessage}`
      );
    }

    // Check for duplicate request
    const checkResult = await this.service.checkIdempotency(
      idempotencyKey,
      metadata.operationType
    );

    if (checkResult.isDuplicate) {
      // Return cached response for duplicate
      console.log(
        `[Idempotency] Duplicate request detected: key=${idempotencyKey}, ` +
        `type=${metadata.operationType}`
      );

      response
        .status(checkResult.statusCode || 200)
        .json(checkResult.storedResult);
      
      return false; // Block request from proceeding
    }

    // Store metadata for interceptor to use later
    request.idempotencyKey = idempotencyKey;
    request.operationType = metadata.operationType;

    return true; // Allow request to proceed
  }
}

/**
 * Utility to get idempotency metadata from handler
 */
export function getIdempotencyMetadata(
  reflector: Reflector,
  handler: Function
): IdempotencyMetadata | undefined {
  return reflector.get<IdempotencyMetadata>(IDEMPOTENCY_KEY, handler);
}
