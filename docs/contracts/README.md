# Data Contracts

## Overview

This directory contains canonical data contracts for integrations between RedRoomRewards and its merchant clients (e.g., XXXChatNow).

## Contents

### Schema Definition
- **[xxx-events.schema.json](./xxx-events.schema.json)** - JSON Schema for event ingestion
  - Defines structure for `token_purchase`, `membership_purchase`, `adjustment`, and `reversal` events
  - Enforces validation rules for required fields
  - Supports multiple event types with conditional validation

### Example Payloads
- **[examples/token_purchase.json](./examples/token_purchase.json)** - Token purchase event example
- **[examples/membership_purchase.json](./examples/membership_purchase.json)** - Membership purchase event example
- **[examples/adjustment_cs_award.json](./examples/adjustment_cs_award.json)** - Customer service adjustment example

### Documentation
- **[idempotency-and-retries.md](./idempotency-and-retries.md)** - Comprehensive guide to:
  - Idempotency key usage
  - Duplicate detection (200 vs 409 responses)
  - Checksum validation for replay protection
  - Retry strategies and exponential backoff
  - System consistency guarantees

## Quick Start

### Validate Example Payloads

```bash
# Install dependencies (if not already installed)
npm install

# Run validation script
npm run validate:schema

# Or run directly
node validate-schema.js
```

### Using the Schema

#### In JavaScript/Node.js
```javascript
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('./docs/contracts/xxx-events.schema.json');

const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

const validate = ajv.compile(schema);

const event = {
  transaction_id: "txn_2024_001",
  event_type: "token_purchase",
  occurred_at: "2024-01-15T14:30:00.000Z",
  source_system: "xxxchatnow",
  merchant_id: "xxxchatnow-prod",
  loyalty_member_id: "user-123",
  gross_amount: 99.99,
  tokens_purchased: 10000,
  idempotency_key: "idem_user123_20240115_001"
};

if (validate(event)) {
  console.log('Valid event!');
} else {
  console.error('Validation errors:', validate.errors);
}
```

#### In Python
```python
import jsonschema
import json

# Load schema
with open('docs/contracts/xxx-events.schema.json', 'r') as f:
    schema = json.load(f)

# Load event
event = {
    "transaction_id": "txn_2024_001",
    "event_type": "token_purchase",
    "occurred_at": "2024-01-15T14:30:00.000Z",
    "source_system": "xxxchatnow",
    "merchant_id": "xxxchatnow-prod",
    "loyalty_member_id": "user-123",
    "gross_amount": 99.99,
    "tokens_purchased": 10000,
    "idempotency_key": "idem_user123_20240115_001"
}

# Validate
try:
    jsonschema.validate(instance=event, schema=schema)
    print("Valid event!")
except jsonschema.exceptions.ValidationError as e:
    print(f"Validation error: {e.message}")
```

## Event Types

### 1. Token Purchase
Purchase of loyalty tokens/points by a user.

**Required Fields:**
- `transaction_id` (immutable)
- `event_type`: `"token_purchase"`
- `occurred_at` (ISO 8601)
- `source_system`, `merchant_id`, `loyalty_member_id`
- `gross_amount` (> 0)
- `tokens_purchased` (> 0)

**Optional Fields:**
- `promo_id`, `promo_bonus_tokens`
- `net_amount`, `currency`
- `metadata`, `idempotency_key`, `checksum`

### 2. Membership Purchase
Purchase or upgrade of a membership tier.

**Required Fields:**
- `transaction_id` (immutable)
- `event_type`: `"membership_purchase"`
- `occurred_at` (ISO 8601)
- `source_system`, `merchant_id`, `loyalty_member_id`
- `gross_amount` (> 0)
- `membership_tier` (basic|premium|vip|elite)
- `membership_duration_days` (> 0)

**Optional Fields:**
- `tokens_purchased` (bonus tokens with membership)
- `net_amount`, `currency`
- `metadata`, `idempotency_key`, `checksum`

### 3. Adjustment
Manual adjustment of token balance (credit or debit).

**Required Fields:**
- `transaction_id` (immutable)
- `event_type`: `"adjustment"`
- `occurred_at` (ISO 8601)
- `source_system`, `merchant_id`, `loyalty_member_id`
- `adjustment_reason` (customer_service_award|compensation|correction|bonus|technical_issue|chargeback|fraud)
- `adjustment_amount` (non-zero integer, positive=credit, negative=debit)

**Optional Fields:**
- `currency`
- `metadata`, `idempotency_key`, `checksum`

### 4. Reversal
Reversal of a previous transaction.

**Required Fields:**
- `transaction_id` (immutable)
- `event_type`: `"reversal"`
- `occurred_at` (ISO 8601)
- `source_system`, `merchant_id`, `loyalty_member_id`
- `reversal_reason` (chargeback|fraud|duplicate|user_request|system_error)
- `original_transaction_id` (reference to transaction being reversed)

**Optional Fields:**
- `metadata`, `idempotency_key`, `checksum`

## Key Concepts

### Transaction ID Immutability
Once a `transaction_id` is used, it becomes immutable:
- Cannot be reused with different data (409 Conflict)
- Can be replayed with identical data (200 OK, duplicate)
- Forms the foundation of audit trail

### Idempotency
All operations are idempotent:
- Same `idempotency_key` + same data = 200 OK with original response
- Same `idempotency_key` + different data = 409 Conflict
- Different `idempotency_key` + same `transaction_id` + same data = 200 OK
- Different `idempotency_key` + same `transaction_id` + different data = 409 Conflict

### Checksum Validation
Optional but recommended:
- SHA-256 hash of transaction data
- Detects data tampering
- Prevents replay attacks
- Mismatch results in 400 Bad Request

## Testing

### Validation Tests
All example payloads are automatically validated against the schema:

```bash
npm run validate:schema
```

Expected output:
```
=== JSON Schema Validation ===

✅ token_purchase.json: VALID
✅ membership_purchase.json: VALID
✅ adjustment_cs_award.json: VALID

=== Validation Summary ===
✅ All examples are valid!
```

### Integration Testing
For integration testing with your merchant client:

1. Generate test events using the examples as templates
2. Submit to RedRoomRewards ingestion endpoint
3. Verify idempotency by resubmitting identical events
4. Test conflict detection with modified data
5. Validate checksum implementation

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01-15 | Initial schema and documentation |

## Support

For questions or issues:
- Review the schema and examples in this directory
- Consult [idempotency-and-retries.md](./idempotency-and-retries.md)
- Check the main [RedRoomRewards documentation](/docs/)
- Open an issue on GitHub

---

**Schema Owner**: RedRoomRewards Engineering Team  
**Last Updated**: 2024-01-15
