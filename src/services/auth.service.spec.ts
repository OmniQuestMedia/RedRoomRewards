/**
 * Authentication Service Tests
 */

import { AuthService, UserRole, AuthServiceConfig } from './auth.service';
import { TransactionReason } from '../wallets/types';

describe('AuthService', () => {
  let service: AuthService;
  const config: AuthServiceConfig = {
    jwtSecret: 'test-secret-key',
    tokenExpirySeconds: 3600,
    algorithm: 'HS256',
  };

  beforeEach(() => {
    service = new AuthService(config);
  });

  describe('generateSettlementAuthorization', () => {
    it('should generate valid settlement authorization token', () => {
      const authorization = service.generateSettlementAuthorization(
        'queue-123',
        'escrow-456',
        'model-789',
        1000,
        TransactionReason.PERFORMANCE_COMPLETED
      );

      expect(authorization.queueItemId).toBe('queue-123');
      expect(authorization.escrowId).toBe('escrow-456');
      expect(authorization.modelId).toBe('model-789');
      expect(authorization.amount).toBe(1000);
      expect(authorization.reason).toBe(TransactionReason.PERFORMANCE_COMPLETED);
      expect(authorization.token).toBeTruthy();
      expect(authorization.issuedAt).toBeInstanceOf(Date);
      expect(authorization.expiresAt).toBeInstanceOf(Date);
    });

    it('should generate token that can be verified', () => {
      const authorization = service.generateSettlementAuthorization(
        'queue-123',
        'escrow-456',
        'model-789',
        1000,
        TransactionReason.PERFORMANCE_COMPLETED
      );

      const decoded = service.verifyAuthorizationToken(authorization.token);

      expect(decoded.type).toBe('queue_settlement');
      expect(decoded.role).toBe(UserRole.QUEUE_SERVICE);
      expect(decoded.queueItemId).toBe('queue-123');
      expect(decoded.escrowId).toBe('escrow-456');
      expect(decoded.modelId).toBe('model-789');
      expect(decoded.amount).toBe(1000);
    });

    it('should generate token with expiration', () => {
      const authorization = service.generateSettlementAuthorization(
        'queue-123',
        'escrow-456',
        'model-789',
        1000,
        TransactionReason.PERFORMANCE_COMPLETED
      );

      const decoded = service.verifyAuthorizationToken(authorization.token);
      const now = Math.floor(Date.now() / 1000);

      expect(decoded.exp).toBeGreaterThan(now);
      expect(decoded.exp).toBeLessThanOrEqual(now + config.tokenExpirySeconds + 1);
    });
  });

  describe('generateRefundAuthorization', () => {
    it('should generate valid refund authorization token', () => {
      const authorization = service.generateRefundAuthorization(
        'queue-abc',
        'escrow-def',
        'user-ghi',
        500,
        TransactionReason.PERFORMANCE_ABANDONED
      );

      expect(authorization.queueItemId).toBe('queue-abc');
      expect(authorization.escrowId).toBe('escrow-def');
      expect(authorization.userId).toBe('user-ghi');
      expect(authorization.amount).toBe(500);
      expect(authorization.reason).toBe(TransactionReason.PERFORMANCE_ABANDONED);
      expect(authorization.token).toBeTruthy();
    });

    it('should generate token that can be verified', () => {
      const authorization = service.generateRefundAuthorization(
        'queue-abc',
        'escrow-def',
        'user-ghi',
        500,
        TransactionReason.PERFORMANCE_ABANDONED
      );

      const decoded = service.verifyAuthorizationToken(authorization.token);

      expect(decoded.type).toBe('queue_refund');
      expect(decoded.role).toBe(UserRole.QUEUE_SERVICE);
      expect(decoded.queueItemId).toBe('queue-abc');
      expect(decoded.escrowId).toBe('escrow-def');
      expect(decoded.userId).toBe('user-ghi');
      expect(decoded.amount).toBe(500);
    });
  });

  describe('generatePartialSettlementAuthorization', () => {
    it('should generate valid partial settlement authorization token', () => {
      const authorization = service.generatePartialSettlementAuthorization(
        'queue-xyz',
        'escrow-uvw',
        'user-rst',
        'model-opq',
        200,
        800,
        TransactionReason.PARTIAL_PERFORMANCE
      );

      expect(authorization.queueItemId).toBe('queue-xyz');
      expect(authorization.escrowId).toBe('escrow-uvw');
      expect(authorization.userId).toBe('user-rst');
      expect(authorization.modelId).toBe('model-opq');
      expect(authorization.refundAmount).toBe(200);
      expect(authorization.settleAmount).toBe(800);
      expect(authorization.reason).toBe(TransactionReason.PARTIAL_PERFORMANCE);
      expect(authorization.token).toBeTruthy();
    });

    it('should generate token that can be verified', () => {
      const authorization = service.generatePartialSettlementAuthorization(
        'queue-xyz',
        'escrow-uvw',
        'user-rst',
        'model-opq',
        200,
        800,
        TransactionReason.PARTIAL_PERFORMANCE
      );

      const decoded = service.verifyAuthorizationToken(authorization.token);

      expect(decoded.type).toBe('queue_partial_settlement');
      expect(decoded.role).toBe(UserRole.QUEUE_SERVICE);
      expect(decoded.queueItemId).toBe('queue-xyz');
      expect(decoded.escrowId).toBe('escrow-uvw');
      expect(decoded.userId).toBe('user-rst');
      expect(decoded.modelId).toBe('model-opq');
      expect(decoded.refundAmount).toBe(200);
      expect(decoded.settleAmount).toBe(800);
      expect(decoded.amount).toBe(1000);
    });
  });

  describe('verifyAuthorizationToken', () => {
    it('should reject expired token', () => {
      // Create service with very short expiry
      const shortExpiryService = new AuthService({
        ...config,
        tokenExpirySeconds: -1, // Already expired
      });

      const authorization = shortExpiryService.generateSettlementAuthorization(
        'queue-123',
        'escrow-456',
        'model-789',
        1000,
        TransactionReason.PERFORMANCE_COMPLETED
      );

      expect(() => {
        service.verifyAuthorizationToken(authorization.token);
      }).toThrow('Authorization token expired');
    });

    it('should reject invalid token', () => {
      expect(() => {
        service.verifyAuthorizationToken('invalid-token');
      }).toThrow('Invalid authorization token');
    });

    it('should reject token with wrong secret', () => {
      const otherService = new AuthService({
        ...config,
        jwtSecret: 'different-secret',
      });

      const authorization = otherService.generateSettlementAuthorization(
        'queue-123',
        'escrow-456',
        'model-789',
        1000,
        TransactionReason.PERFORMANCE_COMPLETED
      );

      expect(() => {
        service.verifyAuthorizationToken(authorization.token);
      }).toThrow('Invalid authorization token');
    });
  });

  describe('validateSettlementAuthorization', () => {
    it('should validate correct settlement authorization', () => {
      const authorization = service.generateSettlementAuthorization(
        'queue-123',
        'escrow-456',
        'model-789',
        1000,
        TransactionReason.PERFORMANCE_COMPLETED
      );

      expect(() => {
        service.validateSettlementAuthorization(authorization, 'queue-123', 'escrow-456');
      }).not.toThrow();
    });

    it('should reject settlement authorization with wrong queue item ID', () => {
      const authorization = service.generateSettlementAuthorization(
        'queue-123',
        'escrow-456',
        'model-789',
        1000,
        TransactionReason.PERFORMANCE_COMPLETED
      );

      expect(() => {
        service.validateSettlementAuthorization(authorization, 'queue-wrong', 'escrow-456');
      }).toThrow('Queue item ID mismatch');
    });

    it('should reject settlement authorization with wrong escrow ID', () => {
      const authorization = service.generateSettlementAuthorization(
        'queue-123',
        'escrow-456',
        'model-789',
        1000,
        TransactionReason.PERFORMANCE_COMPLETED
      );

      expect(() => {
        service.validateSettlementAuthorization(authorization, 'queue-123', 'escrow-wrong');
      }).toThrow('Escrow ID mismatch');
    });

    it('should reject refund authorization used for settlement', () => {
      const authorization = service.generateRefundAuthorization(
        'queue-123',
        'escrow-456',
        'user-789',
        1000,
        TransactionReason.PERFORMANCE_ABANDONED
      );

      expect(() => {
        service.validateSettlementAuthorization(authorization as any, 'queue-123', 'escrow-456');
      }).toThrow('Invalid authorization type');
    });
  });

  describe('validateRefundAuthorization', () => {
    it('should validate correct refund authorization', () => {
      const authorization = service.generateRefundAuthorization(
        'queue-abc',
        'escrow-def',
        'user-ghi',
        500,
        TransactionReason.PERFORMANCE_ABANDONED
      );

      expect(() => {
        service.validateRefundAuthorization(authorization, 'queue-abc', 'escrow-def');
      }).not.toThrow();
    });

    it('should reject refund authorization with wrong queue item ID', () => {
      const authorization = service.generateRefundAuthorization(
        'queue-abc',
        'escrow-def',
        'user-ghi',
        500,
        TransactionReason.PERFORMANCE_ABANDONED
      );

      expect(() => {
        service.validateRefundAuthorization(authorization, 'queue-wrong', 'escrow-def');
      }).toThrow('Queue item ID mismatch');
    });
  });

  describe('hasRole', () => {
    it('should return true for matching role', () => {
      const payload = {
        sub: 'queue-service',
        role: UserRole.QUEUE_SERVICE,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        type: 'test',
      };

      expect(service.hasRole(payload, UserRole.QUEUE_SERVICE)).toBe(true);
    });

    it('should return false for non-matching role', () => {
      const payload = {
        sub: 'user-123',
        role: UserRole.USER,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        type: 'test',
      };

      expect(service.hasRole(payload, UserRole.ADMIN)).toBe(false);
    });

    it('should return true for admin accessing any role', () => {
      const payload = {
        sub: 'admin-123',
        role: UserRole.ADMIN,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        type: 'test',
      };

      expect(service.hasRole(payload, UserRole.USER)).toBe(true);
      expect(service.hasRole(payload, UserRole.MODEL)).toBe(true);
      expect(service.hasRole(payload, UserRole.QUEUE_SERVICE)).toBe(true);
    });
  });

  describe('hasAnyRole', () => {
    it('should return true if user has one of the required roles', () => {
      const payload = {
        sub: 'user-123',
        role: UserRole.USER,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        type: 'test',
      };

      expect(service.hasAnyRole(payload, [UserRole.USER, UserRole.MODEL])).toBe(true);
    });

    it('should return false if user does not have any of the required roles', () => {
      const payload = {
        sub: 'user-123',
        role: UserRole.USER,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        type: 'test',
      };

      expect(service.hasAnyRole(payload, [UserRole.MODEL, UserRole.ADMIN])).toBe(false);
    });

    it('should return true for admin accessing any role', () => {
      const payload = {
        sub: 'admin-123',
        role: UserRole.ADMIN,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        type: 'test',
      };

      expect(service.hasAnyRole(payload, [UserRole.USER, UserRole.MODEL])).toBe(true);
    });
  });
});
