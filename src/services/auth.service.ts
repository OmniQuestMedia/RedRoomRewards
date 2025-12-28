/**
 * Authentication and Authorization Service
 * 
 * Provides JWT-based authentication and authorization for queue operations.
 * Implements role-based access control (RBAC) and token management.
 */

import * as jwt from 'jsonwebtoken';
import {
  QueueSettlementAuthorization,
  QueueRefundAuthorization,
  QueuePartialSettlementAuthorization,
} from '../services/types';
import { TransactionReason } from '../wallets/types';

/**
 * Authentication service configuration
 */
export interface AuthServiceConfig {
  jwtSecret: string;
  tokenExpirySeconds: number;
  algorithm: 'HS256' | 'HS384' | 'HS512';
}

/**
 * User roles for RBAC
 */
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODEL = 'model',
  QUEUE_SERVICE = 'queue_service',
  SYSTEM = 'system',
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  sub: string; // Subject (user/service ID)
  role: UserRole;
  iat: number; // Issued at
  exp: number; // Expiration
  type: string; // Token type
}

/**
 * Authorization token payload for queue operations
 */
export interface QueueAuthorizationPayload extends JWTPayload {
  type: 'queue_settlement' | 'queue_refund' | 'queue_partial_settlement';
  queueItemId: string;
  escrowId: string;
  userId?: string;
  modelId?: string;
  amount: number;
  refundAmount?: number;
  settleAmount?: number;
  reason: TransactionReason;
}

/**
 * Authentication Service
 */
export class AuthService {
  private config: AuthServiceConfig;

  constructor(config: AuthServiceConfig) {
    this.config = config;
  }

  /**
   * Generate queue settlement authorization token
   */
  generateSettlementAuthorization(
    queueItemId: string,
    escrowId: string,
    modelId: string,
    amount: number,
    reason: TransactionReason
  ): QueueSettlementAuthorization {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + this.config.tokenExpirySeconds * 1000);

    const payload: QueueAuthorizationPayload = {
      sub: 'queue_service',
      role: UserRole.QUEUE_SERVICE,
      iat: Math.floor(issuedAt.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      type: 'queue_settlement',
      queueItemId,
      escrowId,
      modelId,
      amount,
      reason,
    };

    const token = jwt.sign(payload, this.config.jwtSecret, {
      algorithm: this.config.algorithm,
    });

    return {
      queueItemId,
      token,
      escrowId,
      modelId,
      amount,
      reason,
      issuedAt,
      expiresAt,
    };
  }

  /**
   * Generate queue refund authorization token
   */
  generateRefundAuthorization(
    queueItemId: string,
    escrowId: string,
    userId: string,
    amount: number,
    reason: TransactionReason
  ): QueueRefundAuthorization {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + this.config.tokenExpirySeconds * 1000);

    const payload: QueueAuthorizationPayload = {
      sub: 'queue_service',
      role: UserRole.QUEUE_SERVICE,
      iat: Math.floor(issuedAt.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      type: 'queue_refund',
      queueItemId,
      escrowId,
      userId,
      amount,
      reason,
    };

    const token = jwt.sign(payload, this.config.jwtSecret, {
      algorithm: this.config.algorithm,
    });

    return {
      queueItemId,
      token,
      escrowId,
      userId,
      amount,
      reason,
      issuedAt,
      expiresAt,
    };
  }

  /**
   * Generate queue partial settlement authorization token
   */
  generatePartialSettlementAuthorization(
    queueItemId: string,
    escrowId: string,
    userId: string,
    modelId: string,
    refundAmount: number,
    settleAmount: number,
    reason: TransactionReason
  ): QueuePartialSettlementAuthorization {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + this.config.tokenExpirySeconds * 1000);

    const payload: QueueAuthorizationPayload = {
      sub: 'queue_service',
      role: UserRole.QUEUE_SERVICE,
      iat: Math.floor(issuedAt.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      type: 'queue_partial_settlement',
      queueItemId,
      escrowId,
      userId,
      modelId,
      refundAmount,
      settleAmount,
      amount: refundAmount + settleAmount,
      reason,
    };

    const token = jwt.sign(payload, this.config.jwtSecret, {
      algorithm: this.config.algorithm,
    });

    return {
      queueItemId,
      token,
      escrowId,
      userId,
      modelId,
      refundAmount,
      settleAmount,
      reason,
      issuedAt,
      expiresAt,
    };
  }

  /**
   * Verify and decode authorization token
   */
  verifyAuthorizationToken(token: string): QueueAuthorizationPayload {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret, {
        algorithms: [this.config.algorithm],
      }) as QueueAuthorizationPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Authorization token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid authorization token');
      }
      throw error;
    }
  }

  /**
   * Validate settlement authorization
   */
  validateSettlementAuthorization(
    authorization: QueueSettlementAuthorization,
    expectedQueueItemId: string,
    expectedEscrowId: string
  ): void {
    const payload = this.verifyAuthorizationToken(authorization.token);

    if (payload.type !== 'queue_settlement') {
      throw new Error('Invalid authorization type');
    }

    if (payload.role !== UserRole.QUEUE_SERVICE) {
      throw new Error('Invalid authorization role');
    }

    if (payload.queueItemId !== expectedQueueItemId) {
      throw new Error('Queue item ID mismatch');
    }

    if (payload.escrowId !== expectedEscrowId) {
      throw new Error('Escrow ID mismatch');
    }

    if (authorization.queueItemId !== expectedQueueItemId) {
      throw new Error('Authorization queue item ID mismatch');
    }

    if (authorization.escrowId !== expectedEscrowId) {
      throw new Error('Authorization escrow ID mismatch');
    }
  }

  /**
   * Validate refund authorization
   */
  validateRefundAuthorization(
    authorization: QueueRefundAuthorization,
    expectedQueueItemId: string,
    expectedEscrowId: string
  ): void {
    const payload = this.verifyAuthorizationToken(authorization.token);

    if (payload.type !== 'queue_refund') {
      throw new Error('Invalid authorization type');
    }

    if (payload.role !== UserRole.QUEUE_SERVICE) {
      throw new Error('Invalid authorization role');
    }

    if (payload.queueItemId !== expectedQueueItemId) {
      throw new Error('Queue item ID mismatch');
    }

    if (payload.escrowId !== expectedEscrowId) {
      throw new Error('Escrow ID mismatch');
    }

    if (authorization.queueItemId !== expectedQueueItemId) {
      throw new Error('Authorization queue item ID mismatch');
    }

    if (authorization.escrowId !== expectedEscrowId) {
      throw new Error('Authorization escrow ID mismatch');
    }
  }

  /**
   * Validate partial settlement authorization
   */
  validatePartialSettlementAuthorization(
    authorization: QueuePartialSettlementAuthorization,
    expectedQueueItemId: string,
    expectedEscrowId: string
  ): void {
    const payload = this.verifyAuthorizationToken(authorization.token);

    if (payload.type !== 'queue_partial_settlement') {
      throw new Error('Invalid authorization type');
    }

    if (payload.role !== UserRole.QUEUE_SERVICE) {
      throw new Error('Invalid authorization role');
    }

    if (payload.queueItemId !== expectedQueueItemId) {
      throw new Error('Queue item ID mismatch');
    }

    if (payload.escrowId !== expectedEscrowId) {
      throw new Error('Escrow ID mismatch');
    }

    if (authorization.queueItemId !== expectedQueueItemId) {
      throw new Error('Authorization queue item ID mismatch');
    }

    if (authorization.escrowId !== expectedEscrowId) {
      throw new Error('Authorization escrow ID mismatch');
    }
  }

  /**
   * Check if user has required role
   */
  hasRole(payload: JWTPayload, requiredRole: UserRole): boolean {
    // Admin has access to all roles
    if (payload.role === UserRole.ADMIN) {
      return true;
    }

    return payload.role === requiredRole;
  }

  /**
   * Check if user has any of the required roles
   */
  hasAnyRole(payload: JWTPayload, requiredRoles: UserRole[]): boolean {
    // Admin has access to all roles
    if (payload.role === UserRole.ADMIN) {
      return true;
    }

    return requiredRoles.includes(payload.role);
  }
}

/**
 * Factory function to create auth service instance
 */
export function createAuthService(config: AuthServiceConfig): AuthService {
  return new AuthService(config);
}
