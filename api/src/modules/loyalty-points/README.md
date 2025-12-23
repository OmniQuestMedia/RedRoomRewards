# Loyalty Points Module

## Overview

This module handles loyalty points operations for the RedRoomRewards platform, including webhook processing from external systems.

## Security Measures

### CodeQL Compliance: Database Query Safety

The RRR Webhook Controller implements multiple security layers to prevent the CodeQL alert "Database query built from user-controlled sources":

#### 1. Input Validation Layer

**Method**: `getValidatedEventId(event_id: unknown): string`

- Enforces `typeof === 'string'` check (rejects objects, arrays, null)
- Trims whitespace
- Validates non-empty
- Enforces length limit (≤ 128 characters)
- Rejects MongoDB operator characters (`$`, `.`)

**Purpose**: Breaks the data flow in CodeQL analysis. The `event_id` becomes a validated primitive string BEFORE any database query, preventing operator injection.

#### 2. Explicit Operator Usage

All MongoDB queries use the `$eq` operator explicitly:

```typescript
// ✅ SAFE: Explicit $eq prevents operator injection
await this.webhookEventModel.findOne({ 
  event_id: { $eq: eventId } 
});

// ❌ UNSAFE: Could allow operator injection if eventId is an object
await this.webhookEventModel.findOne({ 
  event_id: eventId 
});
```

#### 3. Type Safety

- Controller method signature: `@Body() payload: unknown` (not `any`)
- Forces explicit type checking before use
- Prevents accidental unsafe operations

### Additional Security Features

#### Signature Verification

- HMAC-SHA256 signature verification
- Timing-safe comparison
- Prevents unauthorized webhook submissions

#### Idempotency Protection

- Event ID uniqueness enforced at database level
- Prevents duplicate processing (replay attacks)
- Uses atomic `updateOne` with `upsert` for race-condition safety

#### Schema Hardening

- `event_id` field typed as `String` (not `Mixed`)
- Unique index on `event_id`
- TTL index for automatic cleanup after retention period

## Files

- `controllers/rrr-webhook.controller.ts` - Main webhook handler
- `controllers/rrr-webhook.controller.spec.ts` - Comprehensive test suite
- `models/webhook-event.model.ts` - Mongoose schema for webhook events
- `loyalty-points.module.ts` - NestJS module configuration

## Testing

Run tests with:

```bash
npm test -- rrr-webhook.controller.spec.ts
```

### Critical Test Cases

1. **Operator Injection Prevention**: `event_id: { $ne: null }` → 400 Bad Request
2. **Special Character Rejection**: `event_id: "$test"` → 400 Bad Request
3. **Signature Verification**: Invalid signature → 400 Bad Request
4. **Idempotency**: Duplicate event_id → Skip processing, return 200
5. **Valid Request**: Proper signature + valid event_id → Process and return 200

## Configuration

Set the webhook secret via environment variable:

```bash
RRR_WEBHOOK_SECRET=your-secret-key-here
```

**⚠️ CRITICAL**: Never commit secrets to source control. Use environment variables or secret management systems.

## Database Indexes

Ensure the following indexes exist:

```javascript
// Idempotency enforcement
db.webhook_events.createIndex({ "event_id": 1 }, { unique: true });

// TTL for automatic cleanup (90 days)
db.webhook_events.createIndex({ "processed_at": 1 }, { expireAfterSeconds: 7776000 });
```

For multi-tenant deployments, use composite index:

```javascript
db.webhook_events.createIndex({ "client_id": 1, "event_id": 1 }, { unique: true });
```

## Architecture Alignment

This implementation follows the RedRoomRewards architectural principles:

- **Server-side authority**: All validation happens server-side
- **Immutable audit trail**: Webhook events are write-once records
- **Security-first design**: Multiple defensive layers
- **Idempotent operations**: Safe retries via event_id uniqueness
- **No legacy patterns**: Built from scratch per modern standards

See `/docs/UNIVERSAL_ARCHITECTURE.md` for complete architectural guidelines.

## References

- [OWASP NoSQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html)
- [MongoDB Security Checklist](https://www.mongodb.com/docs/manual/administration/security-checklist/)
- [NestJS Guards and Validation](https://docs.nestjs.com/guards)
- [CodeQL Database Query Detection](https://codeql.github.com/codeql-query-help/javascript/js-sql-injection/)
