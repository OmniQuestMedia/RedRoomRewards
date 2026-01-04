# Security Best Practices for Developers

**Last Updated**: 2026-01-04  
**Status**: Authoritative  
**Audience**: All developers working on RedRoomRewards

---

## Overview

This document provides practical security guidelines for developers. These practices are **mandatory** for all code contributions and are enforced through code review and automated scanning.

---

## 1. Secrets Management

### ❌ NEVER DO THIS

```typescript
// WRONG: Hardcoded secret
const apiKey = 'sk_live_1234567890abcdef';

// WRONG: Default fallback to insecure value
const secret = process.env.SECRET || 'changeme';

// WRONG: Committed to git
const password = 'mypassword123';
```

### ✅ DO THIS INSTEAD

```typescript
// CORRECT: Require environment variable
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable is required');
}

// CORRECT: Validate secret strength
const secret = process.env.SECRET;
if (!secret || secret.length < 32) {
  throw new Error('SECRET must be at least 32 characters');
}

// CORRECT: Use environment validator
import { assertValidEnvironment, COMMON_ENV_RULES } from './config/env-validator';
assertValidEnvironment(COMMON_ENV_RULES);
```

### Secret Requirements

- **Minimum Length**: 32 characters for all secrets (256 bits)
- **Randomness**: Use cryptographically secure random generation
- **Storage**: Environment variables in production, never in code
- **Rotation**: Quarterly or immediately on compromise

### Generating Secure Secrets

```bash
# Generate a 32-character random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use OpenSSL
openssl rand -hex 32
```

---

## 2. Logging Security

### ❌ NEVER LOG THESE

- Passwords, API keys, tokens, secrets
- Full credit card numbers
- Social security numbers  
- Session tokens or JWTs
- PII beyond user IDs
- Database connection strings
- Private keys

### ✅ SAFE TO LOG

- User IDs (pseudonymous identifiers)
- Request IDs (X-Request-ID headers)
- Timestamps
- Actions performed
- Results (success/failure)
- Error codes (not sensitive details)
- Performance metrics

### ❌ NEVER DO THIS

```typescript
// WRONG: console.log in production code
console.log('User logged in:', user);

// WRONG: Logging sensitive data
logger.info('Password:', password);

// WRONG: Logging full error with secrets
console.error('Database error:', error);  // May contain connection string
```

### ✅ DO THIS INSTEAD

```typescript
// CORRECT: Use structured logger
import { MetricsLogger, AlertSeverity } from '../metrics';

MetricsLogger.logAlert({
  severity: AlertSeverity.INFO,
  message: 'User logged in',
  metricType: 'user_login',
  timestamp: new Date(),
  metadata: {
    userId: user.id,  // User ID only, no PII
    requestId: req.headers['x-request-id'],
  },
});

// CORRECT: Log error without sensitive details
MetricsLogger.logAlert({
  severity: AlertSeverity.ERROR,
  message: 'Database connection failed',
  metricType: 'database_error',
  timestamp: new Date(),
  metadata: {
    errorType: error.name,  // Error type only
    // Do NOT log error.message which may contain connection string
  },
});
```

---

## 3. Input Validation

### Always Validate User Input

Every user input must be validated **server-side** (never trust client validation alone).

### ✅ Validation Checklist

- [ ] Type validation (string, number, boolean)
- [ ] Length validation (min/max)
- [ ] Format validation (regex, enum)
- [ ] Range validation (for numbers)
- [ ] Sanitization (trim whitespace, remove special characters)

### Example: Secure Input Validation

```typescript
// CORRECT: Comprehensive validation
function validateUserId(input: unknown): string {
  // Type check
  if (typeof input !== 'string') {
    throw new Error('User ID must be a string');
  }
  
  // Sanitize
  const sanitized = input.trim();
  
  // Length check
  if (!sanitized || sanitized.length > 128) {
    throw new Error('User ID must be 1-128 characters');
  }
  
  // Format check (alphanumeric, dash, underscore only)
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    throw new Error('User ID contains invalid characters');
  }
  
  return sanitized;
}
```

### MongoDB Query Safety

Always use `$eq` operator to prevent NoSQL injection:

```typescript
// WRONG: Direct value can be exploited
const user = await UserModel.findOne({ userId: untrustedInput });

// CORRECT: Use $eq operator
const user = await UserModel.findOne({ userId: { $eq: validatedInput } });
```

---

## 4. Authentication & Authorization

### JWT Tokens

```typescript
// CORRECT: JWT configuration
import * as jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET!;  // Validated at startup
const expirySeconds = 900;  // 15 minutes

const token = jwt.sign(
  {
    userId: user.id,
    role: user.role,
  },
  secret,
  {
    expiresIn: expirySeconds,
    algorithm: 'HS256',
  }
);
```

### Token Requirements

- **Algorithm**: HS256 or RS256 (never 'none')
- **Expiry**: 5-15 minutes for access tokens
- **Refresh**: Separate refresh tokens (7-30 days)
- **Claims**: Minimal (user_id, role, exp, iat, jti)

### Authorization Checks

```typescript
// CORRECT: Check authorization for every operation
function checkAdminAuth(user: User): void {
  const requiredRoles = ['admin', 'super_admin', 'finance_admin'];
  
  if (!user.roles || !user.roles.some(r => requiredRoles.includes(r))) {
    throw new Error('Insufficient permissions');
  }
}
```

---

## 5. Idempotency

All financial operations **must** be idempotent to prevent double-spend and race conditions.

### ✅ Idempotency Pattern

```typescript
// CORRECT: Check idempotency before processing
async function processPayment(request: PaymentRequest): Promise<PaymentResponse> {
  // 1. Check idempotency
  const existing = await checkIdempotency(request.idempotencyKey, 'payment');
  if (existing) {
    // Return cached result, do not reprocess
    return existing.result;
  }
  
  // 2. Process operation
  const result = await executePayment(request);
  
  // 3. Store idempotency record
  await storeIdempotency(request.idempotencyKey, 'payment', result);
  
  return result;
}
```

### Idempotency Key Requirements

- **Format**: UUID v4 or similar unique identifier
- **Scope**: Operation type + key (e.g., 'payment:uuid')
- **TTL**: 24+ hours minimum
- **Uniqueness**: Enforced at database level

---

## 6. Race Condition Prevention

Use optimistic locking for concurrent operations on shared resources.

### ✅ Optimistic Locking Pattern

```typescript
// CORRECT: Optimistic locking with version field
async function updateWallet(userId: string, amount: number): Promise<Wallet> {
  const wallet = await WalletModel.findOne({ userId });
  const currentVersion = wallet.version;
  
  // Attempt update with version check
  const updated = await WalletModel.findOneAndUpdate(
    {
      userId: { $eq: userId },
      version: { $eq: currentVersion },  // Only update if version matches
    },
    {
      $inc: {
        balance: amount,
        version: 1,  // Increment version
      },
    },
    { new: true }
  );
  
  if (!updated) {
    // Version mismatch - someone else updated, retry
    return updateWallet(userId, amount);
  }
  
  return updated;
}
```

---

## 7. Error Handling

### ❌ NEVER DO THIS

```typescript
// WRONG: Exposing internal details
throw new Error(`Database error: ${connectionString}`);

// WRONG: Stack traces in production
res.status(500).json({ error: error.stack });
```

### ✅ DO THIS INSTEAD

```typescript
// CORRECT: Generic error messages
throw new Error('Unable to process request');

// CORRECT: Log detailed errors internally, return generic message
try {
  await processPayment(request);
} catch (error) {
  // Log full error internally
  MetricsLogger.logAlert({
    severity: AlertSeverity.ERROR,
    message: 'Payment processing failed',
    metricType: 'payment_error',
    timestamp: new Date(),
    metadata: {
      userId: request.userId,
      errorType: error instanceof Error ? error.name : 'Unknown',
      // Do NOT log sensitive details
    },
  });
  
  // Return generic error to client
  throw new Error('Payment processing failed');
}
```

---

## 8. Dependencies

### Before Adding a Dependency

1. **Security Audit**: Check for known vulnerabilities (CVE database)
2. **Maintenance**: Is it actively maintained?
3. **License**: Compatible with project license?
4. **Size**: Is it lightweight or bloated?
5. **Alternatives**: Can we use an existing dependency instead?

### Using gh-advisory-database Tool

```bash
# Always check dependencies for vulnerabilities
# The tool will be automatically invoked during PR review
```

### Updating Dependencies

- **Security patches**: Apply immediately
- **Minor updates**: Weekly or bi-weekly
- **Major updates**: Quarterly with full testing

---

## 9. Database Security

### Connection Security

```typescript
// CORRECT: Secure MongoDB connection
const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  ssl: true,  // TLS 1.3 encryption
  authSource: 'admin',
  retryWrites: true,
};

await mongoose.connect(process.env.MONGODB_URI!, mongoOptions);
```

### Query Security

```typescript
// CORRECT: Parameterized queries with $eq
const user = await UserModel.findOne({
  email: { $eq: validatedEmail },
  status: { $eq: 'active' },
});

// CORRECT: Validate before using in queries
const safeUserId = validateUserId(untrustedInput);
const wallet = await WalletModel.findOne({ userId: { $eq: safeUserId } });
```

---

## 10. Code Review Checklist

Before submitting a PR, verify:

- [ ] No hardcoded secrets or credentials
- [ ] No console.log in production code (use MetricsLogger)
- [ ] All inputs validated server-side
- [ ] MongoDB queries use $eq operator
- [ ] Financial operations are idempotent
- [ ] Race conditions prevented with optimistic locking
- [ ] No PII in logs or error messages
- [ ] JWT tokens properly configured
- [ ] Authorization checks on sensitive operations
- [ ] Error handling doesn't leak sensitive information
- [ ] Dependencies checked for vulnerabilities
- [ ] Tests cover security scenarios

---

## 11. Common Vulnerabilities to Avoid

### SQL/NoSQL Injection

```typescript
// WRONG
db.query(`SELECT * FROM users WHERE id = ${userId}`);
Model.findOne({ userId: untrustedInput });

// CORRECT
db.query('SELECT * FROM users WHERE id = ?', [userId]);
Model.findOne({ userId: { $eq: validatedInput } });
```

### XSS (Cross-Site Scripting)

```typescript
// WRONG
res.send(`<div>${userInput}</div>`);

// CORRECT: Structured JSON responses only
res.json({ message: 'Success', data: sanitizedData });
```

### CSRF (Cross-Site Request Forgery)

```typescript
// CORRECT: Use CSRF tokens for state-changing operations
// Implement in API layer with express-csrf or similar
```

---

## 12. Emergency Contacts

**Security Incidents**: security@omniquestmedia.com  
**Vulnerability Reports**: security@omniquestmedia.com  

---

## 13. References

- [SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md](../SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md) - Complete security policy
- [OWASP Top 10](https://owasp.org/Top10/) - Common vulnerabilities
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [MongoDB Security Checklist](https://docs.mongodb.com/manual/administration/security-checklist/)

---

**Remember**: Security is everyone's responsibility. When in doubt, ask for a security review!
