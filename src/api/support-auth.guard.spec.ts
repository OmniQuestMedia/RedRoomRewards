/**
 * Support Auth Guard Tests
 */

import { checkAdminSupportAuth, withAdminSupportAuth, AuthGuardConfig } from './support-auth.guard';
import { UserRole, JWTPayload } from '../services/auth.service';
import * as jwt from 'jsonwebtoken';

describe('Support Auth Guard', () => {
  const config: AuthGuardConfig = {
    jwtSecret: 'test-secret-key-for-testing',
    algorithm: 'HS256',
  };

  const mockPayload: JWTPayload = {
    sub: 'admin-123',
    role: UserRole.ADMIN,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    type: 'access',
  };

  describe('checkAdminSupportAuth', () => {
    it('should reject request without auth header', () => {
      const result = checkAdminSupportAuth(undefined, config);

      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('Missing authorization header');
    });

    it('should reject request with invalid header format', () => {
      const result = checkAdminSupportAuth('InvalidFormat', config);

      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('Invalid authorization header format');
    });

    it('should reject request with non-Bearer scheme', () => {
      const result = checkAdminSupportAuth('Basic abc123', config);

      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('Invalid authorization header format');
    });

    it('should accept valid admin token', () => {
      const token = jwt.sign(mockPayload, config.jwtSecret, { algorithm: config.algorithm });
      const result = checkAdminSupportAuth(`Bearer ${token}`, config);

      expect(result.authorized).toBe(true);
      expect(result.payload?.role).toBe(UserRole.ADMIN);
    });

    it('should reject token without admin role', () => {
      const userPayload: JWTPayload = {
        ...mockPayload,
        role: UserRole.USER,
      };

      const token = jwt.sign(userPayload, config.jwtSecret, { algorithm: config.algorithm });
      const result = checkAdminSupportAuth(`Bearer ${token}`, config);

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('Insufficient permissions');
    });

    it('should accept system role', () => {
      const systemPayload: JWTPayload = {
        ...mockPayload,
        role: UserRole.SYSTEM,
      };

      const token = jwt.sign(systemPayload, config.jwtSecret, { algorithm: config.algorithm });
      const result = checkAdminSupportAuth(`Bearer ${token}`, config);

      expect(result.authorized).toBe(true);
      expect(result.payload?.role).toBe(UserRole.SYSTEM);
    });

    it('should reject expired token', () => {
      const expiredPayload: JWTPayload = {
        ...mockPayload,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };

      const token = jwt.sign(expiredPayload, config.jwtSecret, { algorithm: config.algorithm });
      const result = checkAdminSupportAuth(`Bearer ${token}`, config);

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should reject invalid token', () => {
      const result = checkAdminSupportAuth('Bearer invalid-token', config);

      expect(result.authorized).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it('should reject token with wrong secret', () => {
      const token = jwt.sign(mockPayload, 'wrong-secret', { algorithm: config.algorithm });
      const result = checkAdminSupportAuth(`Bearer ${token}`, config);

      expect(result.authorized).toBe(false);
      expect(result.reason).toBeTruthy();
    });
  });

  describe('withAdminSupportAuth', () => {
    it('should execute handler with valid auth', async () => {
      const token = jwt.sign(mockPayload, config.jwtSecret, { algorithm: config.algorithm });
      const mockHandler = jest.fn().mockResolvedValue({ data: 'test' });

      const result = await withAdminSupportAuth(
        `Bearer ${token}`,
        config,
        mockHandler
      );

      expect(result).toEqual({
        authorized: true,
        data: { data: 'test' },
      });
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should not execute handler with invalid auth', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ data: 'test' });

      const result = await withAdminSupportAuth(
        undefined,
        config,
        mockHandler
      );

      expect(result).toEqual({
        authorized: false,
        error: 'Missing authorization header',
      });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should not execute handler without admin role', async () => {
      const userPayload: JWTPayload = {
        ...mockPayload,
        role: UserRole.USER,
      };
      const token = jwt.sign(userPayload, config.jwtSecret, { algorithm: config.algorithm });
      const mockHandler = jest.fn().mockResolvedValue({ data: 'test' });

      const result = await withAdminSupportAuth(
        `Bearer ${token}`,
        config,
        mockHandler
      );

      expect(result.authorized).toBe(false);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should propagate handler errors', async () => {
      const token = jwt.sign(mockPayload, config.jwtSecret, { algorithm: config.algorithm });
      const mockHandler = jest.fn().mockRejectedValue(new Error('Handler error'));

      await expect(
        withAdminSupportAuth(`Bearer ${token}`, config, mockHandler)
      ).rejects.toThrow('Handler error');
    });
  });
});
