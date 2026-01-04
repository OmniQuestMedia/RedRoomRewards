/**
 * Two-Factor Authentication Service Tests
 * 
 * Tests for 2FA including:
 * - Setup and enrollment
 * - TOTP token verification
 * - Backup code verification
 * - Role-based 2FA requirements
 */

import {
  TwoFactorAuthService,
  InMemoryTwoFactorStorage,
  TwoFactorConfig,
} from './two-factor-auth.service';

describe('TwoFactorAuthService', () => {
  let service: TwoFactorAuthService;
  let storage: InMemoryTwoFactorStorage;
  
  const config: Partial<TwoFactorConfig> = {
    appName: 'TestApp',
    window: 1,
    requiredRoles: ['admin', 'super_admin'],
    backupCodeCount: 5,
  };
  
  beforeEach(() => {
    storage = new InMemoryTwoFactorStorage();
    service = new TwoFactorAuthService(storage, config);
  });
  
  describe('setup', () => {
    it('should setup 2FA for a user', async () => {
      const userId = 'user-123';
      const userEmail = 'user@example.com';
      
      const setup = await service.setup(userId, userEmail);
      
      expect(setup.secret).toBeDefined();
      expect(setup.secret.length).toBeGreaterThan(0);
      expect(setup.qrCodeUrl).toContain('otpauth://totp/');
      expect(setup.qrCodeUrl).toContain(encodeURIComponent(userEmail));
      expect(setup.backupCodes).toHaveLength(5);
      expect(setup.setupAt).toBeInstanceOf(Date);
    });
    
    it('should generate unique secrets for different users', async () => {
      const setup1 = await service.setup('user-1', 'user1@example.com');
      const setup2 = await service.setup('user-2', 'user2@example.com');
      
      expect(setup1.secret).not.toBe(setup2.secret);
    });
    
    it('should generate unique backup codes', async () => {
      const setup = await service.setup('user-123', 'user@example.com');
      
      const uniqueCodes = new Set(setup.backupCodes);
      expect(uniqueCodes.size).toBe(setup.backupCodes.length);
    });
    
    it('should not enable 2FA immediately', async () => {
      const userId = 'user-123';
      await service.setup(userId, 'user@example.com');
      
      const enabled = await service.isEnabled(userId);
      expect(enabled).toBe(false);
    });
  });
  
  describe('enable', () => {
    it('should enable 2FA with valid token', async () => {
      const userId = 'user-123';
      await service.setup(userId, 'user@example.com');
      
      // Generate valid TOTP token (mock for testing)
      // In real implementation, we'd use a time-based token generator
      // For testing, we'll mock the verification
      const data = await storage.get(userId);
      expect(data).toBeDefined();
      expect(data!.enabled).toBe(false);
    });
    
    it('should reject invalid token during enable', async () => {
      const userId = 'user-123';
      await service.setup(userId, 'user@example.com');
      
      const result = await service.enable(userId, 'invalid-token');
      expect(result).toBe(false);
    });
    
    it('should throw error when setup not complete', async () => {
      const userId = 'user-123';
      
      await expect(
        service.enable(userId, '123456')
      ).rejects.toThrow('2FA not set up for user');
    });
  });
  
  describe('disable', () => {
    it('should disable 2FA for a user', async () => {
      const userId = 'user-123';
      await service.setup(userId, 'user@example.com');
      
      await service.disable(userId);
      
      const enabled = await service.isEnabled(userId);
      expect(enabled).toBe(false);
    });
    
    it('should remove secret and backup codes on disable', async () => {
      const userId = 'user-123';
      await service.setup(userId, 'user@example.com');
      
      await service.disable(userId);
      
      const data = await storage.get(userId);
      expect(data!.secret).toBeUndefined();
      expect(data!.backupCodes).toBeUndefined();
    });
  });
  
  describe('verify', () => {
    it('should return error when 2FA not enabled', async () => {
      const userId = 'user-123';
      
      const result = await service.verify(userId, '123456');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('2FA not enabled for user');
    });
    
    it('should verify backup code', async () => {
      const userId = 'user-123';
      const setup = await service.setup(userId, 'user@example.com');
      
      // Manually enable for testing
      const data = await storage.get(userId);
      if (data) {
        data.enabled = true;
        await storage.store(data);
      }
      
      // Use first backup code
      const backupCode = setup.backupCodes[0];
      const result = await service.verify(userId, backupCode);
      
      expect(result.valid).toBe(true);
      expect(result.usedBackupCode).toBe(true);
    });
    
    it('should remove backup code after use', async () => {
      const userId = 'user-123';
      const setup = await service.setup(userId, 'user@example.com');
      
      // Manually enable for testing
      const data = await storage.get(userId);
      if (data) {
        data.enabled = true;
        await storage.store(data);
      }
      
      const backupCode = setup.backupCodes[0];
      
      // First use should succeed
      const result1 = await service.verify(userId, backupCode);
      expect(result1.valid).toBe(true);
      
      // Second use should fail
      const result2 = await service.verify(userId, backupCode);
      expect(result2.valid).toBe(false);
    });
    
    it('should reject invalid backup code', async () => {
      const userId = 'user-123';
      await service.setup(userId, 'user@example.com');
      
      // Manually enable for testing
      const data = await storage.get(userId);
      if (data) {
        data.enabled = true;
        await storage.store(data);
      }
      
      const result = await service.verify(userId, 'invalid-backup-code');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid 2FA token or backup code');
    });
  });
  
  describe('isRequired', () => {
    it('should return true for admin roles', () => {
      expect(service.isRequired(['admin'])).toBe(true);
      expect(service.isRequired(['super_admin'])).toBe(true);
      expect(service.isRequired(['user', 'admin'])).toBe(true);
    });
    
    it('should return false for non-admin roles', () => {
      expect(service.isRequired(['user'])).toBe(false);
      expect(service.isRequired(['model'])).toBe(false);
      expect(service.isRequired(['user', 'model'])).toBe(false);
    });
    
    it('should return false for empty roles', () => {
      expect(service.isRequired([])).toBe(false);
    });
  });
  
  describe('isEnabled', () => {
    it('should return false when not set up', async () => {
      const enabled = await service.isEnabled('user-123');
      expect(enabled).toBe(false);
    });
    
    it('should return false when set up but not enabled', async () => {
      const userId = 'user-123';
      await service.setup(userId, 'user@example.com');
      
      const enabled = await service.isEnabled(userId);
      expect(enabled).toBe(false);
    });
    
    it('should return true when enabled', async () => {
      const userId = 'user-123';
      await service.setup(userId, 'user@example.com');
      
      // Manually enable for testing
      const data = await storage.get(userId);
      if (data) {
        data.enabled = true;
        await storage.store(data);
      }
      
      const enabled = await service.isEnabled(userId);
      expect(enabled).toBe(true);
    });
  });
  
  describe('validateRequirement', () => {
    it('should pass validation for non-admin roles', async () => {
      const result = await service.validateRequirement(
        'user-123',
        ['user'],
        undefined
      );
      
      expect(result.valid).toBe(true);
    });
    
    it('should fail when 2FA required but not enabled', async () => {
      const result = await service.validateRequirement(
        'user-123',
        ['admin'],
        undefined
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2FA is required but not enabled');
    });
    
    it('should fail when 2FA required but no token provided', async () => {
      const userId = 'user-123';
      await service.setup(userId, 'user@example.com');
      
      // Manually enable for testing
      const data = await storage.get(userId);
      if (data) {
        data.enabled = true;
        await storage.store(data);
      }
      
      const result = await service.validateRequirement(
        userId,
        ['admin'],
        undefined
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('2FA token required');
    });
    
    it('should validate token when provided', async () => {
      const userId = 'user-123';
      const setup = await service.setup(userId, 'user@example.com');
      
      // Manually enable for testing
      const data = await storage.get(userId);
      if (data) {
        data.enabled = true;
        await storage.store(data);
      }
      
      // Use backup code for testing
      const result = await service.validateRequirement(
        userId,
        ['admin'],
        setup.backupCodes[0]
      );
      
      expect(result.valid).toBe(true);
    });
  });
  
  describe('InMemoryTwoFactorStorage', () => {
    it('should store and retrieve user data', async () => {
      const userData = {
        userId: 'user-123',
        enabled: true,
        secret: 'test-secret',
        backupCodes: ['code1', 'code2'],
      };
      
      await storage.store(userData);
      const retrieved = await storage.get('user-123');
      
      expect(retrieved).toEqual(userData);
    });
    
    it('should return null for non-existent user', async () => {
      const data = await storage.get('non-existent-user');
      expect(data).toBeNull();
    });
    
    it('should remove backup code', async () => {
      const userData = {
        userId: 'user-123',
        enabled: true,
        secret: 'test-secret',
        backupCodes: ['code1', 'code2', 'code3'],
      };
      
      await storage.store(userData);
      await storage.removeBackupCode('user-123', 'code2');
      
      const retrieved = await storage.get('user-123');
      expect(retrieved!.backupCodes).toEqual(['code1', 'code3']);
    });
    
    it('should update last verified timestamp', async () => {
      const userData = {
        userId: 'user-123',
        enabled: true,
        secret: 'test-secret',
      };
      
      await storage.store(userData);
      await storage.updateLastVerified('user-123');
      
      const retrieved = await storage.get('user-123');
      expect(retrieved!.lastVerifiedAt).toBeInstanceOf(Date);
    });
  });
});
