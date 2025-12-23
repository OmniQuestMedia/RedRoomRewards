# CodeQL Alert Remediation: Database Query Built from User-Controlled Sources

## Summary

This implementation creates a secure RRR webhook controller that is **proactively designed** to prevent the CodeQL alert "Database query built from user-controlled sources." Rather than fixing an existing vulnerability, this code demonstrates best practices for secure webhook handling from the ground up.

## File: api/src/modules/loyalty-points/controllers/rrr-webhook.controller.ts

### Security Measures Implemented

#### 1. Input Validation with Type Enforcement

**Method: `getValidatedEventId(event_id: unknown): string`**

This validation helper implements multiple defensive layers:

```typescript
private getValidatedEventId(event_id: unknown): string {
  // Layer 1: Type guard - must be primitive string
  if (typeof event_id !== 'string') {
    throw new BadRequestException('Invalid webhook payload: event_id must be a string');
  }

  // Layer 2: Sanitization - trim whitespace
  const trimmed = event_id.trim();

  // Layer 3: Non-empty validation
  if (!trimmed) {
    throw new BadRequestException('Invalid webhook payload: event_id is required');
  }

  // Layer 4: Length validation (conservative limit)
  if (trimmed.length > 128) {
    throw new BadRequestException('Invalid webhook payload: event_id too long');
  }

  // Layer 5: Character hardening - reject MongoDB operators
  if (trimmed.includes('$') || trimmed.includes('.')) {
    throw new BadRequestException('Invalid webhook payload: event_id contains illegal characters');
  }

  return trimmed; // Now a validated primitive string
}
```

**Why this works for CodeQL:**
- CodeQL performs data flow analysis to track untrusted input from sources (webhook payload) to sinks (database queries)
- The validation helper breaks this data flow by:
  1. Taking `unknown` type (untrusted)
  2. Performing runtime type checking
  3. Returning `string` primitive (trusted)
- After validation, `event_id` is a primitive string that cannot carry MongoDB operators

#### 2. Explicit $eq Operator Usage

All database queries use the `$eq` operator explicitly:

```typescript
// In isEventProcessed()
await this.webhookEventModel
  .findOne({ event_id: { $eq: eventId } }, { _id: 1 })
  .lean()
  .exec();

// In markEventProcessed()
await this.webhookEventModel
  .updateOne(
    { event_id: { $eq: eventId } },
    { $setOnInsert: { event_id: eventId, event_type: eventType, data, processed_at: new Date() } },
    { upsert: true }
  )
  .exec();
```

**Why this prevents NoSQL injection:**
- MongoDB treats `{ field: value }` differently than `{ field: { $operator: value } }`
- Using `{ event_id: userInput }` is unsafe if `userInput = { $ne: null }`
- Using `{ event_id: { $eq: userInput } }` is safe because the operator is explicit
- Even if `userInput` is an object, it becomes the comparison value, not an operator

#### 3. Type-Safe Controller Signature

```typescript
@Post()
async handleWebhook(
  @Headers('x-rrr-signature') signature: string,
  @Body() payload: unknown, // Not 'any'!
): Promise<{ received: boolean }> {
  // ...
  const safeEventId = this.getValidatedEventId(event_id);
  // safeEventId is now a validated primitive string
}
```

**Benefits:**
- `unknown` type forces explicit type checking
- Prevents accidental unsafe operations
- Makes security boundary explicit

#### 4. Additional Security Features

**Signature Verification:**
```typescript
private verifySignature(signature: string, body: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', this.webhookSecret)
    .update(body)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Idempotency Protection:**
- Event ID uniqueness enforced at database level (unique index)
- Atomic `updateOne` with `upsert` prevents race conditions
- Prevents duplicate processing (replay attacks)

## File: api/src/modules/loyalty-points/models/webhook-event.model.ts

### Schema Hardening

```typescript
event_id: {
  type: String,        // Strictly typed as String (not Mixed)
  required: true,
  index: true,
  trim: true,
  maxlength: 128,
}
```

**Indexes:**
```typescript
// Idempotency enforcement
WebhookEventSchema.index({ event_id: 1 }, { unique: true });

// TTL for automatic cleanup
WebhookEventSchema.index({ processed_at: 1 }, { expireAfterSeconds: 7776000 });
```

## File: api/src/modules/loyalty-points/controllers/rrr-webhook.controller.spec.ts

### Test Coverage for Security

**Critical test cases:**

1. **Operator Injection Prevention:**
```typescript
it('should reject payload with event_id as object (operator injection attempt)', async () => {
  const maliciousPayload = {
    event_type: 'test.event',
    event_id: { $ne: null }, // Attack: MongoDB operator
    data: {},
  };
  
  await expect(controller.handleWebhook(signature, maliciousPayload))
    .rejects.toThrow('event_id must be a string');
  
  // Verify no database query was made
  expect(mockWebhookEventModel.findOne).not.toHaveBeenCalled();
});
```

2. **Special Character Rejection:**
```typescript
it('should reject payload with event_id containing $ character', async () => {
  const payload = { event_id: '$malicious' };
  await expect(controller.handleWebhook(signature, payload))
    .rejects.toThrow('illegal characters');
});
```

3. **CodeQL Compliance Verification:**
```typescript
it('should use $eq operator in database queries', async () => {
  await controller.handleWebhook(signature, validPayload);
  
  expect(mockWebhookEventModel.findOne).toHaveBeenCalledWith(
    { event_id: { $eq: 'evt-codeql-test' } },
    expect.any(Object)
  );
});
```

## Attack Vectors Mitigated

### 1. NoSQL Operator Injection
**Attack:** `event_id: { $ne: null }`  
**Defense:** Type validation rejects non-string values before any DB query

### 2. Special Character Injection
**Attack:** `event_id: "$admin.system"`  
**Defense:** Character validation rejects `$` and `.` characters

### 3. Replay Attacks
**Attack:** Submitting same webhook multiple times  
**Defense:** Idempotency check via unique event_id prevents duplicate processing

### 4. Signature Bypass
**Attack:** Submitting webhook without valid signature  
**Defense:** HMAC-SHA256 verification rejects unauthorized requests

### 5. Timing Attacks
**Attack:** Using signature comparison timing to guess valid signatures  
**Defense:** `crypto.timingSafeEqual()` prevents timing-based attacks

## CodeQL Analysis Flow

### Before Validation (Unsafe)
```
Source: @Body() payload → event_id (untrusted)
↓
Sink: findOne({ event_id: event_id }) ← ALERT!
```

### After Validation (Safe)
```
Source: @Body() payload → event_id (untrusted)
↓
Validation: getValidatedEventId(event_id)
  - typeof check
  - trim/sanitize
  - length check
  - character filter
↓
Trusted: safeEventId (primitive string)
↓
Sink: findOne({ event_id: { $eq: safeEventId } }) ← NO ALERT
```

**Data flow is broken** because:
1. Validation function creates a new string primitive
2. CodeQL recognizes type guard and sanitization
3. Output is no longer tainted by original input
4. `$eq` operator provides additional safety layer

## Compliance & Best Practices

### OWASP Guidelines Met
- ✅ Input validation on all untrusted data
- ✅ Whitelist validation (strict type checking)
- ✅ Output encoding (explicit operators)
- ✅ Principle of least privilege (minimal query surface)

### MongoDB Security Checklist Met
- ✅ Use typed schemas
- ✅ Use explicit operators ($eq, $setOnInsert)
- ✅ Validate input types
- ✅ Use indexes for query optimization
- ✅ Enable authentication (webhook signature)

### NestJS Best Practices Met
- ✅ Type-safe decorators
- ✅ Validation pipes (manual implementation)
- ✅ Exception filters (BadRequestException)
- ✅ Dependency injection
- ✅ Unit test coverage

## Deployment Checklist

Before deploying to production:

1. **Set webhook secret:**
   ```bash
   export RRR_WEBHOOK_SECRET=<strong-random-secret>
   ```

2. **Create database indexes:**
   ```javascript
   db.webhook_events.createIndex({ "event_id": 1 }, { unique: true });
   db.webhook_events.createIndex({ "processed_at": 1 }, { expireAfterSeconds: 7776000 });
   ```

3. **Run tests:**
   ```bash
   npm test -- rrr-webhook.controller.spec.ts
   ```

4. **Verify CodeQL passes:**
   ```bash
   # Check CodeQL results in GitHub Actions
   # Should show 0 alerts for database query issues
   ```

## Conclusion

This implementation demonstrates **defense in depth**:
- Multiple validation layers
- Type safety at compile time and runtime
- Explicit operators prevent injection
- Idempotency prevents replay attacks
- Signature verification prevents unauthorized access
- Comprehensive tests verify security properties

The code is **CodeQL-compliant by design**, not by patching. It follows security best practices from the ground up and provides a template for future webhook handlers in the RedRoomRewards platform.
