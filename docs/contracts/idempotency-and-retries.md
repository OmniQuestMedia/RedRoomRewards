# Idempotency and Retry Handling

## Overview

RedRoomRewards implements robust idempotency and conflict handling to ensure reliable integration with merchant clients like XXXChatNow. This document defines the rules and behaviors for duplicate detection, conflict resolution, and replay protection.

## Core Principles

1. **Immutability**: Once a transaction is processed, its `transaction_id` becomes immutable and cannot be reused
2. **Idempotency**: Duplicate requests return the same response without side effects
3. **Conflict Detection**: System detects and reports conflicting transaction attempts
4. **Replay Protection**: Checksum validation prevents malicious or accidental replays

---

## Idempotency Keys

### Purpose
Idempotency keys allow clients to safely retry requests without creating duplicate transactions.

### Requirements
- **Required**: Every event must include an `idempotency_key` field
- **Format**: String, 1-256 characters
- **Uniqueness**: Must be unique per operation attempt
- **Lifetime**: Keys are stored for 24+ hours after initial processing

### Best Practices
```
idem_{user_id}_{timestamp}_{operation_type}
```

**Examples:**
- `idem_user12345_20240115_143000_purchase`
- `idem_user67890_20240115_150000_membership`
- `idem_user11223_20240115_163000_adjustment`

### Generation Guidelines
1. Include user/member identifier for traceability
2. Include timestamp for temporal ordering
3. Include operation type for categorization
4. Use URL-safe characters only
5. Make keys deterministic for the same logical operation

---

## Duplicate Detection

### HTTP Status Codes

#### 200 OK - Successful Duplicate
**When**: Exact duplicate of previously processed request

**Response**: Original transaction response

**Behavior**: No side effects; balance unchanged

**Example**:
```json
{
  "status": "success",
  "transaction_id": "txn_2024_purchase_abc123",
  "idempotency_key": "idem_user12345_20240115_143000_purchase",
  "message": "Transaction already processed",
  "duplicate": true,
  "original_timestamp": "2024-01-15T14:30:00.000Z",
  "balance": {
    "available": 12000,
    "escrow": 0,
    "total": 12000
  }
}
```

#### 409 Conflict - Valid Conflict
**When**: Same `transaction_id` with different data

**Response**: Error with conflict details

**Behavior**: Request rejected; no changes made

**Example**:
```json
{
  "status": "error",
  "error_code": "TRANSACTION_CONFLICT",
  "message": "Transaction ID already exists with different data",
  "transaction_id": "txn_2024_purchase_abc123",
  "conflict_type": "transaction_id_mismatch",
  "details": {
    "field": "tokens_purchased",
    "original_value": 10000,
    "attempted_value": 15000
  }
}
```

### Detection Logic

```
IF idempotency_key exists:
  IF request_data matches stored_request_data:
    RETURN 200 OK with original response
  ELSE:
    RETURN 409 CONFLICT with conflict details
    
IF transaction_id exists:
  IF request_data matches stored_transaction_data:
    RETURN 200 OK with original response
  ELSE:
    RETURN 409 CONFLICT with conflict details
    
ELSE:
  Process new transaction
  Store idempotency record
  RETURN 201 CREATED with transaction details
```

---

## Checksum Validation

### Purpose
Prevent replay attacks and detect data tampering during transmission.

### Implementation

#### Checksum Generation
```javascript
// Client-side: Generate SHA-256 hash of transaction data
const crypto = require('crypto');

function generateChecksum(transactionData) {
  // Sort keys for consistent hashing
  const sortedData = JSON.stringify(transactionData, Object.keys(transactionData).sort());
  
  // Generate SHA-256 hash
  return crypto
    .createHash('sha256')
    .update(sortedData)
    .digest('hex');
}

// Example
const transaction = {
  transaction_id: "txn_2024_purchase_abc123",
  event_type: "token_purchase",
  occurred_at: "2024-01-15T14:30:00.000Z",
  // ... other fields
};

const checksum = generateChecksum(transaction);
// Result: "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890"
```

#### Server-Side Validation
```javascript
function validateChecksum(receivedData, receivedChecksum) {
  // Remove checksum field from data before validation
  const { checksum, ...dataWithoutChecksum } = receivedData;
  
  // Recalculate checksum
  const calculatedChecksum = generateChecksum(dataWithoutChecksum);
  
  // Compare
  if (calculatedChecksum !== receivedChecksum) {
    throw new Error('CHECKSUM_VALIDATION_FAILED');
  }
  
  return true;
}
```

### Checksum Mismatch Response

**HTTP Status**: 400 Bad Request

**Response**:
```json
{
  "status": "error",
  "error_code": "CHECKSUM_VALIDATION_FAILED",
  "message": "Data integrity check failed",
  "details": {
    "received_checksum": "a1b2c3d4e5...",
    "calculated_checksum": "b2c3d4e5f6...",
    "mismatch": true
  }
}
```

---

## Retry Strategy

### Client Retry Guidelines

#### When to Retry
- Network timeouts
- HTTP 5xx server errors
- HTTP 429 rate limit errors

#### When NOT to Retry
- HTTP 4xx client errors (except 429)
- HTTP 409 conflict errors
- HTTP 200/201 success responses

### Retry Implementation

```javascript
async function submitEventWithRetry(eventData, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000
  } = options;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await submitEvent(eventData);
      
      // Success - return response
      if (response.status >= 200 && response.status < 300) {
        return response;
      }
      
      // Don't retry client errors (except rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`Client error: ${response.status}`);
      }
      
      // Retry on 5xx or 429
      if (attempt < maxAttempts) {
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt - 1),
          maxDelayMs
        );
        await sleep(delay);
        continue;
      }
      
      throw new Error(`Max retry attempts reached: ${maxAttempts}`);
      
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs
      );
      await sleep(delay);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Exponential Backoff

| Attempt | Delay      | Cumulative Time |
|---------|------------|-----------------|
| 1       | 0ms        | 0ms             |
| 2       | 1000ms     | 1000ms          |
| 3       | 2000ms     | 3000ms          |
| 4       | 4000ms     | 7000ms          |
| 5       | 8000ms     | 15000ms         |
| 6+      | 30000ms    | varies          |

---

## System Consistency Guarantees

### Transaction Processing

1. **Atomic Operations**: All database updates for a transaction occur atomically
2. **Ledger Immutability**: Once written, ledger entries are never modified
3. **Balance Consistency**: User balances always reflect ledger entry totals
4. **Idempotency Storage**: Idempotency records stored before processing transactions

### Failure Scenarios

#### Network Failure Mid-Request
- Client times out but server may have processed
- Client retries with same `idempotency_key`
- Server returns 200 with original response if processed
- Server processes as new if not received

#### Database Failure During Transaction
- Transaction rolled back atomically
- No partial updates applied
- Client receives 500 error
- Client retries with same `idempotency_key`
- Server processes as new transaction

#### Concurrent Requests
- Optimistic locking prevents duplicate processing
- First request wins; second gets conflict error or duplicate response
- Wallet version numbers prevent race conditions

### Race Condition Prevention

```javascript
// Example: Wallet update with optimistic locking
async function updateWallet(userId, amount, currentVersion) {
  const result = await WalletModel.findOneAndUpdate(
    {
      userId: userId,
      version: currentVersion  // Only update if version matches
    },
    {
      $inc: { availableBalance: amount, version: 1 },
      $set: { updatedAt: new Date() }
    },
    { new: true }
  );
  
  if (!result) {
    // Version mismatch - concurrent update detected
    throw new Error('CONCURRENT_MODIFICATION_DETECTED');
  }
  
  return result;
}
```

---

## Best Practices Summary

### For Merchant Clients

1. **Always Include Idempotency Keys**: Never reuse keys across different operations
2. **Implement Retry Logic**: Use exponential backoff for transient failures
3. **Handle 200 and 201 Identically**: Both indicate successful processing
4. **Don't Retry 4xx Errors**: Fix the request instead
5. **Log All Requests**: Include `transaction_id` and `idempotency_key` for debugging
6. **Generate Checksums**: Include SHA-256 checksum for all events
7. **Store Transaction IDs**: Keep local records for reconciliation

### For RedRoomRewards

1. **Validate Before Processing**: Check idempotency before modifying state
2. **Store Idempotency Records**: Persist for 24+ hours
3. **Use Optimistic Locking**: Prevent concurrent modification issues
4. **Emit Events**: Publish to event bus for audit trail
5. **Log Everything**: Comprehensive logging for troubleshooting
6. **Monitor Duplicates**: Track duplicate rate for system health
7. **Alert on Conflicts**: High conflict rate indicates integration issues

---

## Error Code Reference

| Error Code | HTTP Status | Meaning | Retry? |
|------------|-------------|---------|--------|
| `SUCCESS` | 200 | Operation successful | No |
| `DUPLICATE_REQUEST` | 200 | Idempotent duplicate | No |
| `CREATED` | 201 | New transaction created | No |
| `INVALID_REQUEST` | 400 | Validation failed | No |
| `CHECKSUM_VALIDATION_FAILED` | 400 | Checksum mismatch | No |
| `UNAUTHORIZED` | 401 | Authentication failed | No |
| `FORBIDDEN` | 403 | Authorization failed | No |
| `NOT_FOUND` | 404 | Resource not found | No |
| `TRANSACTION_CONFLICT` | 409 | Transaction ID conflict | No |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Yes |
| `INTERNAL_SERVER_ERROR` | 500 | Server error | Yes |
| `SERVICE_UNAVAILABLE` | 503 | Service down/overloaded | Yes |
| `GATEWAY_TIMEOUT` | 504 | Upstream timeout | Yes |

---

## Examples

### Example 1: First Request (Success)
```http
POST /api/events/ingest
Content-Type: application/json

{
  "transaction_id": "txn_2024_001",
  "event_type": "token_purchase",
  "occurred_at": "2024-01-15T14:30:00.000Z",
  "source_system": "xxxchatnow",
  "merchant_id": "xxxchatnow-prod",
  "loyalty_member_id": "user-123",
  "gross_amount": 99.99,
  "tokens_purchased": 10000,
  "idempotency_key": "idem_user123_20240115_001",
  "checksum": "a1b2c3..."
}

Response: 201 Created
{
  "status": "success",
  "transaction_id": "txn_2024_001",
  "balance": {
    "available": 10000,
    "escrow": 0,
    "total": 10000
  }
}
```

### Example 2: Duplicate Request (Idempotent)
```http
POST /api/events/ingest
[Same payload as Example 1]

Response: 200 OK
{
  "status": "success",
  "transaction_id": "txn_2024_001",
  "duplicate": true,
  "original_timestamp": "2024-01-15T14:30:00.000Z",
  "balance": {
    "available": 10000,
    "escrow": 0,
    "total": 10000
  }
}
```

### Example 3: Conflict (Different Data)
```http
POST /api/events/ingest
{
  "transaction_id": "txn_2024_001",  // Same ID
  "event_type": "token_purchase",
  "occurred_at": "2024-01-15T14:30:00.000Z",
  "source_system": "xxxchatnow",
  "merchant_id": "xxxchatnow-prod",
  "loyalty_member_id": "user-123",
  "gross_amount": 99.99,
  "tokens_purchased": 15000,  // DIFFERENT AMOUNT
  "idempotency_key": "idem_user123_20240115_002",  // Different key
  "checksum": "b2c3d4..."
}

Response: 409 Conflict
{
  "status": "error",
  "error_code": "TRANSACTION_CONFLICT",
  "message": "Transaction ID already exists with different data",
  "transaction_id": "txn_2024_001",
  "conflict_details": {
    "field": "tokens_purchased",
    "original_value": 10000,
    "attempted_value": 15000
  }
}
```

---

## Monitoring and Observability

### Key Metrics

1. **Duplicate Rate**: Percentage of requests that are duplicates
2. **Conflict Rate**: Percentage of requests resulting in 409 conflicts
3. **Checksum Failure Rate**: Percentage of checksum validation failures
4. **Retry Success Rate**: Percentage of retries that succeed
5. **Idempotency Hit Rate**: Percentage of requests with idempotency key matches

### Alerting Thresholds

- **Critical**: Conflict rate > 1%
- **Warning**: Duplicate rate > 10%
- **Warning**: Checksum failure rate > 0.1%
- **Info**: Retry rate > 5%

---

## Compliance and Audit

### Audit Trail Requirements

Every transaction must log:
1. Original request payload
2. Idempotency key
3. Transaction ID
4. Checksum
5. Processing timestamp
6. Response status
7. Any conflicts or errors

### Retention Policy

- **Idempotency records**: 24 hours minimum, 7 days recommended
- **Transaction logs**: 7+ years (compliance requirement)
- **Audit trails**: 7+ years (compliance requirement)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01-15 | Initial release |

---

**Document Owner**: RedRoomRewards Engineering Team  
**Last Updated**: 2024-01-15  
**Next Review**: 2024-04-15
