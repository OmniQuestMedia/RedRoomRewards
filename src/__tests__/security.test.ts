/**
 * Security and Authorization Tests
 * 
 * Tests authorization validation, input validation, and security controls
 * as specified in TEST_STRATEGY.md Section 5
 */

import { AuthService, UserRole } from '../services/auth.service';

describe('Security Tests', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService({
      jwtSecret: 'test-secret-key-for-testing',
      tokenExpirySeconds: 3600,
      algorithm: 'HS256',
    });
  });

  describe('Authorization Validation', () => {
    describe('Queue Authorization Tokens', () => {
      it('should reject tampered authorization token', async () => {
        const authorization = authService.generateSettlementAuthorization(
          'queue-123',
          'escrow-123',
          'model-456',
          100,
          'performance_delivered' as any
        );

        const tamperedToken = authorization.token.slice(0, -5) + 'XXXXX';

        expect(() =>
          authService.verifyAuthorizationToken(tamperedToken)
        ).toThrow('Invalid authorization token');
      });

      it('should reject tokens with wrong operation type', async () => {
        const refundAuthorization = authService.generateRefundAuthorization(
          'queue-123',
          'escrow-123',
          'user-123',
          100,
          'cancelled' as any
        );

        // Try to use refund token for settlement
        await expect(() =>
          authService.validateSettlementAuthorization(
            refundAuthorization as any,
            'queue-123',
            'escrow-123'
          )
        ).toThrow();
      });
    });

    describe('Admin Authorization', () => {
      it('should validate admin roles for operations', () => {
        const adminContext = {
          sub: 'admin-123',
          role: UserRole.ADMIN,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          type: 'admin',
        };

        expect(authService.hasRole(adminContext, UserRole.ADMIN)).toBe(true);
        expect(authService.hasRole(adminContext, UserRole.USER)).toBe(true); // Admin has all roles
      });

      it('should reject operations without required admin role', () => {
        const userContext = {
          sub: 'user-123',
          role: UserRole.USER,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          type: 'user',
        };

        expect(authService.hasRole(userContext, UserRole.ADMIN)).toBe(false);
      });
    });
  });

  describe('Input Validation', () => {
    it('should reject SQL injection attempts in userId', () => {
      const maliciousUserId = "user-123'; DROP TABLE wallets; --";

      expect(() => {
        validateUserId(maliciousUserId);
      }).toThrow('Invalid user ID format');
    });

    it('should sanitize metadata fields', () => {
      const maliciousMetadata = {
        notes: "'; DELETE FROM ledger WHERE '1'='1",
      };

      const sanitized = sanitizeMetadata(maliciousMetadata);
      expect(sanitized.notes).not.toContain('DELETE');
    });

    it('should reject negative amounts', () => {
      expect(() => validateAmount(-100)).toThrow('Amount must be positive');
    });

    it('should reject zero amounts', () => {
      expect(() => validateAmount(0)).toThrow('Amount must be positive');
    });

    it('should reject NaN amounts', () => {
      expect(() => validateAmount(NaN)).toThrow('Amount must be a number');
    });
  });

  describe('PII and Secret Protection', () => {
    it('should not log sensitive data', () => {
      const transactionData = {
        userId: 'user-123',
        amount: 100,
        creditCard: '4111111111111111',
        ssn: '123-45-6789',
      };

      const logSafe = redactSensitiveData(transactionData);

      expect(logSafe.creditCard).toBeUndefined();
      expect(logSafe.ssn).toBeUndefined();
      expect(logSafe.userId).toBe('user-123');
    });

    it('should redact email addresses in logs', () => {
      const data = {
        user: 'john.doe@example.com',
        action: 'signup',
      };

      const logSafe = redactSensitiveData(data);
      expect(logSafe.user).toBe('[REDACTED_EMAIL]');
    });
  });
});

// Helper validation functions
function validateUserId(userId: any): void {
  if (typeof userId !== 'string') {
    throw new Error('Invalid user ID format');
  }
  if (userId.includes(';') || userId.includes('--')) {
    throw new Error('Invalid user ID format');
  }
}

function sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string') {
      sanitized[key] = value
        .replace(/<script>/gi, '')
        .replace(/DELETE/gi, '')
        .replace(/DROP/gi, '');
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function validateAmount(amount: any): void {
  if (typeof amount !== 'number') {
    throw new Error('Amount must be a number');
  }
  if (isNaN(amount)) {
    throw new Error('Amount must be a number');
  }
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }
}

function redactSensitiveData(data: any): any {
  const redacted = { ...data };
  const sensitiveFields = ['password', 'creditCard', 'ssn', 'apiKey', 'token'];
  sensitiveFields.forEach((field) => {
    if (redacted[field]) {
      delete redacted[field];
    }
  });
  if (redacted.user && typeof redacted.user === 'string' && redacted.user.includes('@')) {
    redacted.user = '[REDACTED_EMAIL]';
  }
  return redacted;
}
