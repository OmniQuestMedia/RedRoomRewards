/**
 * Audit Log Service
 * 
 * Provides comprehensive audit logging for sensitive administrative operations.
 * Logs include:
 * - Admin actions (billing rule overrides, redemption cap adjustments)
 * - Security events (authentication, authorization failures)
 * - Data access and modifications
 * 
 * All audit logs are immutable and retained for compliance requirements.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Audit event types
 */
export enum AuditEventType {
  // Admin operations
  ADMIN_LOGIN = 'admin.login',
  ADMIN_LOGOUT = 'admin.logout',
  ADMIN_2FA_ENABLED = 'admin.2fa.enabled',
  ADMIN_2FA_DISABLED = 'admin.2fa.disabled',
  ADMIN_2FA_VERIFIED = 'admin.2fa.verified',
  
  // Point operations
  ADMIN_POINT_ADJUSTMENT = 'admin.point.adjustment',
  ADMIN_POINT_REFUND = 'admin.point.refund',
  ADMIN_BALANCE_CORRECTION = 'admin.balance.correction',
  
  // Billing and rules
  BILLING_RULE_OVERRIDE = 'billing.rule.override',
  REDEMPTION_CAP_ADJUSTMENT = 'redemption.cap.adjustment',
  EXPIRATION_RULE_OVERRIDE = 'expiration.rule.override',
  PROMOTION_MULTIPLIER_OVERRIDE = 'promotion.multiplier.override',
  
  // Security events
  SECURITY_UNAUTHORIZED_ACCESS = 'security.unauthorized.access',
  SECURITY_AUTHENTICATION_FAILURE = 'security.authentication.failure',
  SECURITY_SIGNATURE_VERIFICATION_FAILURE = 'security.signature.verification.failure',
  SECURITY_RATE_LIMIT_EXCEEDED = 'security.rate.limit.exceeded',
  
  // Data access
  DATA_EXPORT = 'data.export',
  DATA_BULK_OPERATION = 'data.bulk.operation',
  
  // Role changes
  ROLE_ASSIGNED = 'role.assigned',
  ROLE_REVOKED = 'role.revoked',
  PERMISSION_CHANGED = 'permission.changed',
}

/**
 * Audit event severity levels
 */
export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Actor performing the action
 */
export interface AuditActor {
  /** Actor ID (user, admin, or system) */
  id: string;
  
  /** Actor type */
  type: 'user' | 'admin' | 'system' | 'service';
  
  /** Actor username/email */
  username?: string;
  
  /** Actor roles */
  roles?: string[];
  
  /** IP address */
  ipAddress?: string;
  
  /** User agent */
  userAgent?: string;
  
  /** Session ID */
  sessionId?: string;
}

/**
 * Target of the action
 */
export interface AuditTarget {
  /** Target ID */
  id: string;
  
  /** Target type */
  type: 'user' | 'wallet' | 'transaction' | 'rule' | 'setting' | 'role';
  
  /** Additional target context */
  metadata?: Record<string, any>;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  /** Unique audit log ID */
  auditId: string;
  
  /** Event type */
  eventType: AuditEventType;
  
  /** Severity level */
  severity: AuditSeverity;
  
  /** Actor performing the action */
  actor: AuditActor;
  
  /** Target of the action (optional) */
  target?: AuditTarget;
  
  /** Human-readable description */
  description: string;
  
  /** Changes made (before/after) */
  changes?: {
    before?: any;
    after?: any;
  };
  
  /** Additional metadata (no PII) */
  metadata?: Record<string, any>;
  
  /** Timestamp of the event */
  timestamp: Date;
  
  /** Request ID for tracing */
  requestId?: string;
  
  /** Result of the action */
  result: 'success' | 'failure' | 'partial';
  
  /** Error message if failed */
  error?: string;
}

/**
 * Audit log query filters
 */
export interface AuditLogQueryFilter {
  /** Filter by event type */
  eventType?: AuditEventType | AuditEventType[];
  
  /** Filter by severity */
  severity?: AuditSeverity | AuditSeverity[];
  
  /** Filter by actor ID */
  actorId?: string;
  
  /** Filter by actor type */
  actorType?: 'user' | 'admin' | 'system' | 'service';
  
  /** Filter by target ID */
  targetId?: string;
  
  /** Filter by target type */
  targetType?: string;
  
  /** Start date (inclusive) */
  startDate?: Date;
  
  /** End date (inclusive) */
  endDate?: Date;
  
  /** Filter by result */
  result?: 'success' | 'failure' | 'partial';
  
  /** Pagination offset */
  offset?: number;
  
  /** Pagination limit */
  limit?: number;
}

/**
 * Audit log query result
 */
export interface AuditLogQueryResult {
  /** Matching audit log entries */
  entries: AuditLogEntry[];
  
  /** Total count of matching entries */
  totalCount: number;
  
  /** Pagination offset used */
  offset: number;
  
  /** Pagination limit used */
  limit: number;
  
  /** Whether more results exist */
  hasMore: boolean;
}

/**
 * Audit log storage interface
 */
export interface IAuditLogStorage {
  /**
   * Store an audit log entry
   */
  store(entry: AuditLogEntry): Promise<void>;
  
  /**
   * Query audit log entries
   */
  query(filter: AuditLogQueryFilter): Promise<AuditLogQueryResult>;
  
  /**
   * Get a specific audit log entry
   */
  getById(auditId: string): Promise<AuditLogEntry | null>;
}

/**
 * In-memory audit log storage (for development/testing)
 * Production should use a dedicated audit log database
 */
export class InMemoryAuditLogStorage implements IAuditLogStorage {
  private logs: AuditLogEntry[] = [];
  
  async store(entry: AuditLogEntry): Promise<void> {
    this.logs.push(entry);
  }
  
  async query(filter: AuditLogQueryFilter): Promise<AuditLogQueryResult> {
    let filtered = [...this.logs];
    
    // Apply filters
    if (filter.eventType) {
      const eventTypes = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType];
      filtered = filtered.filter(log => eventTypes.includes(log.eventType));
    }
    
    if (filter.severity) {
      const severities = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
      filtered = filtered.filter(log => severities.includes(log.severity));
    }
    
    if (filter.actorId) {
      filtered = filtered.filter(log => log.actor.id === filter.actorId);
    }
    
    if (filter.actorType) {
      filtered = filtered.filter(log => log.actor.type === filter.actorType);
    }
    
    if (filter.targetId) {
      filtered = filtered.filter(log => log.target?.id === filter.targetId);
    }
    
    if (filter.targetType) {
      filtered = filtered.filter(log => log.target?.type === filter.targetType);
    }
    
    if (filter.startDate) {
      filtered = filtered.filter(log => log.timestamp >= filter.startDate!);
    }
    
    if (filter.endDate) {
      filtered = filtered.filter(log => log.timestamp <= filter.endDate!);
    }
    
    if (filter.result) {
      filtered = filtered.filter(log => log.result === filter.result);
    }
    
    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    const totalCount = filtered.length;
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    
    const paginated = filtered.slice(offset, offset + limit);
    
    return {
      entries: paginated,
      totalCount,
      offset,
      limit,
      hasMore: offset + limit < totalCount,
    };
  }
  
  async getById(auditId: string): Promise<AuditLogEntry | null> {
    return this.logs.find(log => log.auditId === auditId) || null;
  }
}

/**
 * Audit Log Service Configuration
 */
export interface AuditLogConfig {
  /** Enable audit logging */
  enabled: boolean;
  
  /** Minimum severity level to log */
  minSeverity: AuditSeverity;
  
  /** Enable async logging (recommended for performance) */
  asyncLogging: boolean;
  
  /** Redact sensitive data in logs */
  redactSensitiveData: boolean;
}

/**
 * Audit Log Service
 */
export class AuditLogService {
  private config: AuditLogConfig;
  private storage: IAuditLogStorage;
  
  constructor(
    storage: IAuditLogStorage,
    config: Partial<AuditLogConfig> = {}
  ) {
    this.storage = storage;
    this.config = {
      enabled: true,
      minSeverity: AuditSeverity.INFO,
      asyncLogging: true,
      redactSensitiveData: true,
      ...config,
    };
  }
  
  /**
   * Log an audit event
   */
  async log(
    eventType: AuditEventType,
    actor: AuditActor,
    description: string,
    options: {
      severity?: AuditSeverity;
      target?: AuditTarget;
      changes?: { before?: any; after?: any };
      metadata?: Record<string, any>;
      requestId?: string;
      result?: 'success' | 'failure' | 'partial';
      error?: string;
    } = {}
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    const severity = options.severity || AuditSeverity.INFO;
    
    // Check if severity meets minimum threshold
    if (!this.shouldLog(severity)) {
      return;
    }
    
    const entry: AuditLogEntry = {
      auditId: uuidv4(),
      eventType,
      severity,
      actor: this.sanitizeActor(actor),
      target: options.target,
      description,
      changes: options.changes,
      metadata: this.config.redactSensitiveData 
        ? this.redactMetadata(options.metadata) 
        : options.metadata,
      timestamp: new Date(),
      requestId: options.requestId,
      result: options.result || 'success',
      error: options.error,
    };
    
    if (this.config.asyncLogging) {
      // Fire and forget (consider using a queue in production)
      this.storage.store(entry).catch(error => {
        console.error('Failed to store audit log:', error);
      });
    } else {
      await this.storage.store(entry);
    }
  }
  
  /**
   * Log admin point adjustment
   */
  async logAdminPointAdjustment(
    actor: AuditActor,
    userId: string,
    amount: number,
    reason: string,
    requestId: string,
    result: 'success' | 'failure' = 'success',
    error?: string
  ): Promise<void> {
    await this.log(
      AuditEventType.ADMIN_POINT_ADJUSTMENT,
      actor,
      `Admin adjusted user points: ${amount > 0 ? '+' : ''}${amount}`,
      {
        severity: AuditSeverity.WARNING,
        target: { id: userId, type: 'user' },
        changes: { after: { amount, reason } },
        requestId,
        result,
        error,
        metadata: { amount, reason },
      }
    );
  }
  
  /**
   * Log billing rule override
   */
  async logBillingRuleOverride(
    actor: AuditActor,
    ruleId: string,
    changes: { before: any; after: any },
    requestId: string,
    result: 'success' | 'failure' = 'success',
    error?: string
  ): Promise<void> {
    await this.log(
      AuditEventType.BILLING_RULE_OVERRIDE,
      actor,
      `Admin overrode billing rule: ${ruleId}`,
      {
        severity: AuditSeverity.CRITICAL,
        target: { id: ruleId, type: 'rule' },
        changes,
        requestId,
        result,
        error,
      }
    );
  }
  
  /**
   * Log redemption cap adjustment
   */
  async logRedemptionCapAdjustment(
    actor: AuditActor,
    targetId: string,
    targetType: 'user' | 'rule',
    changes: { before: any; after: any },
    requestId: string,
    result: 'success' | 'failure' = 'success',
    error?: string
  ): Promise<void> {
    await this.log(
      AuditEventType.REDEMPTION_CAP_ADJUSTMENT,
      actor,
      `Admin adjusted redemption cap for ${targetType}: ${targetId}`,
      {
        severity: AuditSeverity.CRITICAL,
        target: { id: targetId, type: targetType },
        changes,
        requestId,
        result,
        error,
      }
    );
  }
  
  /**
   * Log security event
   */
  async logSecurityEvent(
    eventType: AuditEventType,
    actor: AuditActor,
    description: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log(
      eventType,
      actor,
      description,
      {
        severity: AuditSeverity.WARNING,
        result: 'failure',
        metadata,
      }
    );
  }
  
  /**
   * Query audit logs
   */
  async query(filter: AuditLogQueryFilter): Promise<AuditLogQueryResult> {
    return this.storage.query(filter);
  }
  
  /**
   * Get audit log by ID
   */
  async getById(auditId: string): Promise<AuditLogEntry | null> {
    return this.storage.getById(auditId);
  }
  
  /**
   * Check if severity should be logged
   */
  private shouldLog(severity: AuditSeverity): boolean {
    const severityOrder = {
      [AuditSeverity.INFO]: 0,
      [AuditSeverity.WARNING]: 1,
      [AuditSeverity.ERROR]: 2,
      [AuditSeverity.CRITICAL]: 3,
    };
    
    return severityOrder[severity] >= severityOrder[this.config.minSeverity];
  }
  
  /**
   * Sanitize actor to remove PII if needed
   */
  private sanitizeActor(actor: AuditActor): AuditActor {
    if (!this.config.redactSensitiveData) {
      return actor;
    }
    
    return {
      ...actor,
      // Keep username for audit trail but could be hashed if needed
      username: actor.username,
    };
  }
  
  /**
   * Redact sensitive data from metadata
   */
  private redactMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
    if (!metadata) {
      return undefined;
    }
    
    const redacted = { ...metadata };
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'ssn'];
    
    for (const field of sensitiveFields) {
      if (redacted[field]) {
        redacted[field] = '[REDACTED]';
      }
    }
    
    return redacted;
  }
}

/**
 * Factory function to create audit log service
 */
export function createAuditLogService(
  storage?: IAuditLogStorage,
  config?: Partial<AuditLogConfig>
): AuditLogService {
  return new AuditLogService(
    storage || new InMemoryAuditLogStorage(),
    config
  );
}
