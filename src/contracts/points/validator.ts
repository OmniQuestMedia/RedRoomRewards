/**
 * Contract Validator
 * 
 * Strict validation with additionalProperties: false enforcement
 * Rejects unknown fields and validates all inputs
 */

import {
  ValidationOptions,
  ValidationResult,
  ValidationError,
  ContractValidationError,
  BasePointsRequest,
  ReservePointsRequest,
  CommitReservationRequest,
  ReleaseReservationRequest,
} from './types';

/**
 * Base validator class with strict validation support
 */
export class ContractValidator {
  /**
   * Validate an object against a schema with strict mode
   */
  static validate(
    data: unknown,
    options: ValidationOptions
  ): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Type check
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      errors.push({
        field: 'root',
        message: 'Data must be an object',
        code: 'INVALID_TYPE',
        value: data,
      });
      return { valid: false, errors };
    }
    
    const obj = data as Record<string, any>;
    const objKeys = Object.keys(obj);
    
    // Check required fields
    for (const field of options.requiredFields) {
      if (!(field in obj)) {
        errors.push({
          field,
          message: `Missing required field: ${field}`,
          code: 'MISSING_FIELD',
        });
      }
    }
    
    // Strict validation: reject unknown fields
    if (options.strictValidation) {
      const allowedFields = [
        ...options.requiredFields,
        ...(options.optionalFields || []),
      ];
      
      for (const key of objKeys) {
        if (!allowedFields.includes(key)) {
          errors.push({
            field: key,
            message: `Unknown field: ${key}`,
            code: 'UNKNOWN_FIELD',
            value: obj[key],
          });
        }
      }
    }
    
    // Custom validators
    if (options.customValidators) {
      for (const [field, validator] of Object.entries(options.customValidators)) {
        if (field in obj) {
          try {
            if (!validator(obj[field])) {
              errors.push({
                field,
                message: `Validation failed for field: ${field}`,
                code: 'VALIDATION_FAILED',
                value: obj[field],
              });
            }
          } catch (error) {
            errors.push({
              field,
              message: `Validation error for field: ${field}`,
              code: 'VALIDATION_FAILED',
              value: obj[field],
            });
          }
        }
      }
    }
    
    if (errors.length > 0) {
      return { valid: false, errors };
    }
    
    return { valid: true, errors: [], data: obj };
  }
  
  /**
   * Validate base points request fields
   */
  static validateBaseRequest(data: unknown): ValidationResult {
    return this.validate(data, {
      strictValidation: true,
      requiredFields: [
        'pointsIdempotencyKey',
        'eventScope',
        'requestId',
        'timestamp',
      ],
      customValidators: {
        pointsIdempotencyKey: (v) => typeof v === 'string' && v.length > 0 && v.length <= 128,
        eventScope: (v) => typeof v === 'string' && v.length > 0,
        requestId: (v) => typeof v === 'string' && v.length > 0,
        timestamp: (v) => v instanceof Date || typeof v === 'string',
      },
    });
  }
  
  /**
   * Validate reserve points request
   */
  static validateReserveRequest(data: unknown): ValidationResult {
    const result = this.validate(data, {
      strictValidation: true,
      requiredFields: [
        'pointsIdempotencyKey',
        'eventScope',
        'requestId',
        'timestamp',
        'userId',
        'amount',
        'reason',
      ],
      optionalFields: ['ttlSeconds', 'metadata'],
      customValidators: {
        pointsIdempotencyKey: (v) => typeof v === 'string' && v.length > 0 && v.length <= 128,
        eventScope: (v) => v === 'reserve',
        requestId: (v) => typeof v === 'string' && v.length > 0,
        timestamp: (v) => v instanceof Date || typeof v === 'string',
        userId: (v) => typeof v === 'string' && v.length > 0,
        amount: (v) => typeof v === 'number' && v > 0 && Number.isFinite(v),
        reason: (v) => typeof v === 'string' && v.length > 0,
        ttlSeconds: (v) => v === undefined || (typeof v === 'number' && v > 0 && v <= 3600),
        metadata: (v) => v === undefined || (typeof v === 'object' && v !== null && !Array.isArray(v)),
      },
    });
    
    return result;
  }
  
  /**
   * Validate commit reservation request
   */
  static validateCommitRequest(data: unknown): ValidationResult {
    return this.validate(data, {
      strictValidation: true,
      requiredFields: [
        'pointsIdempotencyKey',
        'eventScope',
        'requestId',
        'timestamp',
        'reservationId',
        'userId',
        'reason',
      ],
      optionalFields: ['recipientId', 'metadata'],
      customValidators: {
        pointsIdempotencyKey: (v) => typeof v === 'string' && v.length > 0 && v.length <= 128,
        eventScope: (v) => v === 'commit',
        requestId: (v) => typeof v === 'string' && v.length > 0,
        timestamp: (v) => v instanceof Date || typeof v === 'string',
        reservationId: (v) => typeof v === 'string' && v.length > 0,
        userId: (v) => typeof v === 'string' && v.length > 0,
        reason: (v) => typeof v === 'string' && v.length > 0,
        recipientId: (v) => v === undefined || (typeof v === 'string' && v.length > 0),
        metadata: (v) => v === undefined || (typeof v === 'object' && v !== null && !Array.isArray(v)),
      },
    });
  }
  
  /**
   * Validate release reservation request
   */
  static validateReleaseRequest(data: unknown): ValidationResult {
    return this.validate(data, {
      strictValidation: true,
      requiredFields: [
        'pointsIdempotencyKey',
        'eventScope',
        'requestId',
        'timestamp',
        'reservationId',
        'userId',
        'reason',
      ],
      optionalFields: ['metadata'],
      customValidators: {
        pointsIdempotencyKey: (v) => typeof v === 'string' && v.length > 0 && v.length <= 128,
        eventScope: (v) => v === 'release',
        requestId: (v) => typeof v === 'string' && v.length > 0,
        timestamp: (v) => v instanceof Date || typeof v === 'string',
        reservationId: (v) => typeof v === 'string' && v.length > 0,
        userId: (v) => typeof v === 'string' && v.length > 0,
        reason: (v) => typeof v === 'string' && v.length > 0,
        metadata: (v) => v === undefined || (typeof v === 'object' && v !== null && !Array.isArray(v)),
      },
    });
  }
  
  /**
   * Throw validation error if validation fails
   */
  static assertValid(result: ValidationResult): void {
    if (!result.valid) {
      throw new ContractValidationError(
        'Validation failed',
        result.errors,
        400
      );
    }
  }
}
