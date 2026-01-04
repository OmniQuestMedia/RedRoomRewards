/**
 * Audit Log Service Tests
 * 
 * Tests for audit logging including:
 * - Logging admin operations
 * - Querying audit logs
 * - Sensitive data redaction
 * - Security event logging
 */

import {
  AuditLogService,
  InMemoryAuditLogStorage,
  AuditEventType,
  AuditSeverity,
  AuditActor,
} from './audit-log.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let storage: InMemoryAuditLogStorage;
  
  const mockAdminActor: AuditActor = {
    id: 'admin-123',
    type: 'admin',
    username: 'admin@example.com',
    roles: ['admin'],
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    sessionId: 'session-123',
  };
  
  beforeEach(() => {
    storage = new InMemoryAuditLogStorage();
    service = new AuditLogService(storage, {
      enabled: true,
      minSeverity: AuditSeverity.INFO,
      asyncLogging: false,
      redactSensitiveData: true,
    });
  });
  
  describe('log', () => {
    it('should log audit event', async () => {
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Admin logged in successfully'
      );
      
      const result = await storage.query({});
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].eventType).toBe(AuditEventType.ADMIN_LOGIN);
      expect(result.entries[0].description).toBe('Admin logged in successfully');
    });
    
    it('should generate unique audit IDs', async () => {
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Login 1'
      );
      
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Login 2'
      );
      
      const result = await storage.query({});
      expect(result.entries[0].auditId).not.toBe(result.entries[1].auditId);
    });
    
    it('should include timestamp', async () => {
      const before = new Date();
      
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Admin logged in'
      );
      
      const after = new Date();
      const result = await storage.query({});
      
      expect(result.entries[0].timestamp).toBeInstanceOf(Date);
      expect(result.entries[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.entries[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
    
    it('should include actor information', async () => {
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Admin logged in'
      );
      
      const result = await storage.query({});
      const entry = result.entries[0];
      
      expect(entry.actor.id).toBe('admin-123');
      expect(entry.actor.type).toBe('admin');
      expect(entry.actor.username).toBe('admin@example.com');
      expect(entry.actor.ipAddress).toBe('192.168.1.1');
    });
    
    it('should include target information when provided', async () => {
      await service.log(
        AuditEventType.ADMIN_POINT_ADJUSTMENT,
        mockAdminActor,
        'Adjusted user points',
        {
          target: { id: 'user-456', type: 'user' },
        }
      );
      
      const result = await storage.query({});
      expect(result.entries[0].target).toEqual({
        id: 'user-456',
        type: 'user',
      });
    });
    
    it('should include changes when provided', async () => {
      await service.log(
        AuditEventType.BILLING_RULE_OVERRIDE,
        mockAdminActor,
        'Overrode billing rule',
        {
          changes: {
            before: { rate: 0.1 },
            after: { rate: 0.15 },
          },
        }
      );
      
      const result = await storage.query({});
      expect(result.entries[0].changes).toEqual({
        before: { rate: 0.1 },
        after: { rate: 0.15 },
      });
    });
    
    it('should redact sensitive data in metadata', async () => {
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Admin logged in',
        {
          metadata: {
            username: 'admin@example.com',
            password: 'secret123',
            token: 'auth-token-xyz',
            normalData: 'visible',
          },
        }
      );
      
      const result = await storage.query({});
      const metadata = result.entries[0].metadata;
      
      expect(metadata!.password).toBe('[REDACTED]');
      expect(metadata!.token).toBe('[REDACTED]');
      expect(metadata!.normalData).toBe('visible');
    });
    
    it('should not log when disabled', async () => {
      const disabledService = new AuditLogService(storage, {
        enabled: false,
      });
      
      await disabledService.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Admin logged in'
      );
      
      const result = await storage.query({});
      expect(result.entries).toHaveLength(0);
    });
    
    it('should respect minimum severity level', async () => {
      const warningService = new AuditLogService(storage, {
        enabled: true,
        minSeverity: AuditSeverity.WARNING,
      });
      
      // INFO level should not be logged
      await warningService.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Info message',
        { severity: AuditSeverity.INFO }
      );
      
      // WARNING level should be logged
      await warningService.log(
        AuditEventType.ADMIN_POINT_ADJUSTMENT,
        mockAdminActor,
        'Warning message',
        { severity: AuditSeverity.WARNING }
      );
      
      const result = await storage.query({});
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].severity).toBe(AuditSeverity.WARNING);
    });
  });
  
  describe('logAdminPointAdjustment', () => {
    it('should log point adjustment with correct severity', async () => {
      await service.logAdminPointAdjustment(
        mockAdminActor,
        'user-456',
        100,
        'Customer compensation',
        'req-123'
      );
      
      const result = await storage.query({});
      expect(result.entries[0].eventType).toBe(AuditEventType.ADMIN_POINT_ADJUSTMENT);
      expect(result.entries[0].severity).toBe(AuditSeverity.WARNING);
      expect(result.entries[0].target!.id).toBe('user-456');
    });
    
    it('should include amount and reason in metadata', async () => {
      await service.logAdminPointAdjustment(
        mockAdminActor,
        'user-456',
        100,
        'Test reason',
        'req-123'
      );
      
      const result = await storage.query({});
      expect(result.entries[0].metadata!.amount).toBe(100);
      expect(result.entries[0].metadata!.reason).toBe('Test reason');
    });
    
    it('should log failure with error message', async () => {
      await service.logAdminPointAdjustment(
        mockAdminActor,
        'user-456',
        100,
        'Test reason',
        'req-123',
        'failure',
        'Insufficient balance'
      );
      
      const result = await storage.query({});
      expect(result.entries[0].result).toBe('failure');
      expect(result.entries[0].error).toBe('Insufficient balance');
    });
  });
  
  describe('logBillingRuleOverride', () => {
    it('should log with critical severity', async () => {
      await service.logBillingRuleOverride(
        mockAdminActor,
        'rule-123',
        {
          before: { rate: 0.1 },
          after: { rate: 0.15 },
        },
        'req-123'
      );
      
      const result = await storage.query({});
      expect(result.entries[0].eventType).toBe(AuditEventType.BILLING_RULE_OVERRIDE);
      expect(result.entries[0].severity).toBe(AuditSeverity.CRITICAL);
    });
    
    it('should include before and after changes', async () => {
      const changes = {
        before: { rate: 0.1, enabled: true },
        after: { rate: 0.15, enabled: false },
      };
      
      await service.logBillingRuleOverride(
        mockAdminActor,
        'rule-123',
        changes,
        'req-123'
      );
      
      const result = await storage.query({});
      expect(result.entries[0].changes).toEqual(changes);
    });
  });
  
  describe('logRedemptionCapAdjustment', () => {
    it('should log with critical severity', async () => {
      await service.logRedemptionCapAdjustment(
        mockAdminActor,
        'user-456',
        'user',
        {
          before: { dailyCap: 1000 },
          after: { dailyCap: 2000 },
        },
        'req-123'
      );
      
      const result = await storage.query({});
      expect(result.entries[0].eventType).toBe(AuditEventType.REDEMPTION_CAP_ADJUSTMENT);
      expect(result.entries[0].severity).toBe(AuditSeverity.CRITICAL);
    });
    
    it('should support different target types', async () => {
      await service.logRedemptionCapAdjustment(
        mockAdminActor,
        'rule-123',
        'rule',
        { before: {}, after: {} },
        'req-123'
      );
      
      const result = await storage.query({});
      expect(result.entries[0].target!.type).toBe('rule');
    });
  });
  
  describe('logSecurityEvent', () => {
    it('should log security events with warning severity', async () => {
      await service.logSecurityEvent(
        AuditEventType.SECURITY_UNAUTHORIZED_ACCESS,
        mockAdminActor,
        'Unauthorized access attempt',
        { endpoint: '/admin/sensitive' }
      );
      
      const result = await storage.query({});
      expect(result.entries[0].severity).toBe(AuditSeverity.WARNING);
      expect(result.entries[0].result).toBe('failure');
    });
    
    it('should include metadata for context', async () => {
      await service.logSecurityEvent(
        AuditEventType.SECURITY_RATE_LIMIT_EXCEEDED,
        mockAdminActor,
        'Rate limit exceeded',
        { endpoint: '/api/points', attempts: 100 }
      );
      
      const result = await storage.query({});
      expect(result.entries[0].metadata!.endpoint).toBe('/api/points');
      expect(result.entries[0].metadata!.attempts).toBe(100);
    });
  });
  
  describe('query', () => {
    beforeEach(async () => {
      // Add multiple audit entries
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Login 1',
        { severity: AuditSeverity.INFO }
      );
      
      await service.log(
        AuditEventType.ADMIN_POINT_ADJUSTMENT,
        mockAdminActor,
        'Adjustment 1',
        { severity: AuditSeverity.WARNING }
      );
      
      await service.log(
        AuditEventType.BILLING_RULE_OVERRIDE,
        mockAdminActor,
        'Override 1',
        { severity: AuditSeverity.CRITICAL }
      );
    });
    
    it('should query all entries', async () => {
      const result = await service.query({});
      expect(result.entries).toHaveLength(3);
    });
    
    it('should filter by event type', async () => {
      const result = await service.query({
        eventType: AuditEventType.ADMIN_LOGIN,
      });
      
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].eventType).toBe(AuditEventType.ADMIN_LOGIN);
    });
    
    it('should filter by multiple event types', async () => {
      const result = await service.query({
        eventType: [AuditEventType.ADMIN_LOGIN, AuditEventType.ADMIN_POINT_ADJUSTMENT],
      });
      
      expect(result.entries).toHaveLength(2);
    });
    
    it('should filter by severity', async () => {
      const result = await service.query({
        severity: AuditSeverity.CRITICAL,
      });
      
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].severity).toBe(AuditSeverity.CRITICAL);
    });
    
    it('should filter by actor ID', async () => {
      const result = await service.query({
        actorId: 'admin-123',
      });
      
      expect(result.entries).toHaveLength(3);
    });
    
    it('should support pagination', async () => {
      const result = await service.query({
        offset: 1,
        limit: 1,
      });
      
      expect(result.entries).toHaveLength(1);
      expect(result.offset).toBe(1);
      expect(result.limit).toBe(1);
      expect(result.hasMore).toBe(true);
    });
    
    it('should return correct pagination metadata', async () => {
      const result = await service.query({
        offset: 0,
        limit: 10,
      });
      
      expect(result.totalCount).toBe(3);
      expect(result.hasMore).toBe(false);
    });
  });
  
  describe('getById', () => {
    it('should get audit log by ID', async () => {
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Test login'
      );
      
      const result = await storage.query({});
      const auditId = result.entries[0].auditId;
      
      const entry = await service.getById(auditId);
      expect(entry).not.toBeNull();
      expect(entry!.auditId).toBe(auditId);
    });
    
    it('should return null for non-existent ID', async () => {
      const entry = await service.getById('non-existent-id');
      expect(entry).toBeNull();
    });
  });
  
  describe('InMemoryAuditLogStorage', () => {
    it('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Login today'
      );
      
      const result = await storage.query({
        startDate: yesterday,
        endDate: tomorrow,
      });
      
      expect(result.entries).toHaveLength(1);
    });
    
    it('should filter by result', async () => {
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Success',
        { result: 'success' }
      );
      
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Failure',
        { result: 'failure' }
      );
      
      const result = await storage.query({
        result: 'success',
      });
      
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].result).toBe('success');
    });
    
    it('should sort by timestamp descending', async () => {
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'First'
      );
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await service.log(
        AuditEventType.ADMIN_LOGIN,
        mockAdminActor,
        'Second'
      );
      
      const result = await storage.query({});
      
      expect(result.entries[0].description).toBe('Second');
      expect(result.entries[1].description).toBe('First');
    });
  });
});
