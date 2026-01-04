# Security Module

This module implements comprehensive security and compliance guardrails for the RedRoomRewards loyalty platform.

## Features

### 1. Signed Payload Verification

Implements webhook signature verification to prevent unauthorized and replayed requests.

**Components:**
- `SignatureVerificationService` - Validates X-Signature, X-Timestamp, and X-Nonce headers
- HMAC-SHA256/384/512 signature verification
- Timestamp validation (prevents old/future requests)
- Nonce tracking (prevents replay attacks)

**Usage:**
```typescript
import { SignatureVerificationService } from './security';

const service = new SignatureVerificationService({
  webhookSecret: 'your-secret-key',
  maxTimestampDriftSeconds: 300,
  nonceTTLSeconds: 3600,
  algorithm: 'sha256'
});

// Verify incoming request
const result = await service.verifyRequest(
  req.headers,
  req.body
);

if (!result.valid) {
  // Reject request
  return res.status(401).json({ error: result.error });
}
```

**Security Features:**
- Constant-time comparison (prevents timing attacks)
- Configurable time windows
- Automatic nonce cleanup
- Express middleware support

### 2. Two-Factor Authentication (2FA)

Implements TOTP (Time-based One-Time Password) authentication for admin users.

**Components:**
- `TwoFactorAuthService` - Manages 2FA setup, verification, and enforcement
- TOTP token generation and verification
- Backup codes for recovery
- Role-based 2FA requirements

**Usage:**
```typescript
import { TwoFactorAuthService } from './security';

const service = new TwoFactorAuthService(storage, {
  appName: 'RedRoomRewards',
  requiredRoles: ['admin', 'super_admin', 'merchant_admin']
});

// Setup 2FA for user
const setup = await service.setup(userId, userEmail);
// Returns: { secret, qrCodeUrl, backupCodes }

// Enable after user verifies
await service.enable(userId, totpToken);

// Verify during sensitive operations
const result = await service.verify(userId, token);
```

**Security Features:**
- TOTP standard (RFC 6238)
- Backup codes with secure hashing
- Time window tolerance
- Role-based enforcement

### 3. Audit Logging

Provides comprehensive audit logging for sensitive administrative operations.

**Components:**
- `AuditLogService` - Logs all admin actions and security events
- Immutable audit trail
- Query and filtering capabilities
- Sensitive data redaction

**Usage:**
```typescript
import { AuditLogService, AuditEventType, AuditSeverity } from './security';

const service = new AuditLogService(storage, {
  enabled: true,
  minSeverity: AuditSeverity.INFO,
  asyncLogging: true,
  redactSensitiveData: true
});

// Log admin operation
await service.logAdminPointAdjustment(
  actor,
  userId,
  amount,
  reason,
  requestId
);

// Log billing rule override
await service.logBillingRuleOverride(
  actor,
  ruleId,
  { before: oldRule, after: newRule },
  requestId
);

// Query audit logs
const result = await service.query({
  eventType: AuditEventType.ADMIN_POINT_ADJUSTMENT,
  severity: AuditSeverity.WARNING,
  startDate: new Date('2024-01-01'),
  limit: 50
});
```

**Logged Events:**
- Admin operations (point adjustments, refunds, corrections)
- Billing rule overrides
- Redemption cap adjustments
- Security events (unauthorized access, authentication failures)
- Data access and modifications
- Role changes

**Security Features:**
- Immutable audit trail
- Automatic sensitive data redaction
- Configurable severity levels
- Comprehensive metadata capture
- IP address and user agent tracking

## Integration

### Admin Operations

The `AdminOpsService` has been enhanced to automatically log all admin operations:

```typescript
import { createAdminOpsService } from './services/admin-ops.service';
import { createAuditLogService } from './security';

const auditLogService = createAuditLogService();
const adminOpsService = createAdminOpsService(
  ledgerService,
  walletService,
  config,
  auditLogService
);

// All admin operations are now automatically audited
await adminOpsService.manualAdjustment(request);
```

### Webhook Endpoints

Protect webhook endpoints with signature verification:

```typescript
import { createSignatureVerificationMiddleware } from './security';

const signatureMiddleware = createSignatureVerificationMiddleware(
  signatureService
);

app.post('/webhooks/points', 
  signatureMiddleware,
  pointsWebhookHandler
);
```

### Admin Authentication

Enforce 2FA for admin operations:

```typescript
import { TwoFactorAuthService } from './security';

const twoFactorService = new TwoFactorAuthService(storage);

// Validate 2FA requirement before sensitive operation
const result = await twoFactorService.validateRequirement(
  userId,
  userRoles,
  twoFactorToken
);

if (!result.valid) {
  throw new Error(result.error);
}
```

## Storage

All security services support custom storage implementations:

- **SignatureVerificationService**: `INonceStore` interface
- **TwoFactorAuthService**: `ITwoFactorStorage` interface
- **AuditLogService**: `IAuditLogStorage` interface

In-memory storage implementations are provided for development/testing. Production deployments should use:
- Redis for nonce store (distributed, high-performance)
- Encrypted database for 2FA data (security)
- Dedicated audit log database (compliance, retention)

## Testing

Comprehensive test suites are provided:
- `signature-verification.spec.ts` - 16 tests covering signature verification
- `two-factor-auth.service.spec.ts` - 27 tests covering 2FA functionality
- `audit-log.service.spec.ts` - 31 tests covering audit logging

Run tests:
```bash
npm test -- src/security
```

## Compliance

This module helps meet compliance requirements:
- **PCI DSS**: Audit logging, access control
- **SOC 2**: Security monitoring, access logs
- **GDPR**: Data access audit trail, PII minimization
- **Financial regulations**: Immutable audit trail, 7-year retention

## Security Considerations

1. **Secrets Management**: Store webhook secrets and JWT secrets in environment variables
2. **2FA Backup**: Securely store 2FA recovery codes
3. **Audit Retention**: Configure appropriate retention periods
4. **Rate Limiting**: Add rate limiting to prevent abuse
5. **Monitoring**: Alert on critical security events

## Future Enhancements

- Redis integration for production nonce store
- Database models for 2FA and audit log storage
- Webhook retry mechanism with exponential backoff
- Advanced fraud detection in audit logs
- Multi-device 2FA support
- Hardware token support (U2F/WebAuthn)
