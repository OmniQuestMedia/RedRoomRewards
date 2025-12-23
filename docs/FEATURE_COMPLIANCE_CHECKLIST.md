# Feature Module Compliance Checklist

**Document Type**: Compliance Guide  
**Status**: Authoritative  
**Date**: 2025-12-23  
**Applies To**: All new features integrating with RedRoomRewards

---

## Purpose

This checklist ensures that all new feature modules comply with the established wallet and escrow architecture. Features that fail this checklist must not be deployed to production.

**Reference**: See `/docs/WALLET_ESCROW_ARCHITECTURE.md` for detailed architecture.

---

## Checklist

### 1. Escrow-First Flow

**Required**: All interactive purchases must use escrow

- [ ] **Feature deducts to escrow**, not directly to model
- [ ] **Feature never settles funds directly**
- [ ] **Feature never refunds directly**
- [ ] **Escrow hold happens atomically** with balance check
- [ ] **Feature validates balance before requesting escrow hold**

**Verification**:
```typescript
// ✅ CORRECT
const escrowResponse = await walletService.holdInEscrow({
  userId,
  amount,
  reason: TransactionReason.CHIP_MENU_PURCHASE,
  queueItemId,
  featureType: 'chip_menu',
  idempotencyKey,
  requestId
});

// ❌ INCORRECT - never do this
const modelBalance = await walletService.creditModel(modelId, amount);
```

---

### 2. Queue Integration

**Required**: All escrow holds must emit queue intake events

- [ ] **Feature emits queue intake event** after successful escrow hold
- [ ] **Queue intake includes all required fields**
- [ ] **Event includes escrow ID for linkage**
- [ ] **Feature never calls settlement directly**

**Verification**:
```typescript
// ✅ CORRECT
const queueItem = await queueService.enqueue({
  userId,
  modelId,
  escrowId: escrowResponse.escrowId,
  amount,
  featureType: 'chip_menu'
});

// ❌ INCORRECT - never do this
await walletService.settleEscrow(...); // Features cannot settle
```

---

### 3. Idempotency

**Required**: All operations must be idempotent

- [ ] **Feature generates unique idempotency key** per operation
- [ ] **Idempotency key is UUID or similar**
- [ ] **Same key returns same result** without side effects
- [ ] **Feature handles 200 (duplicate) responses** correctly
- [ ] **Feature handles retry scenarios**

**Verification**:
```typescript
// ✅ CORRECT
const idempotencyKey = uuidv4();
const response = await walletService.holdInEscrow({
  // ... other fields
  idempotencyKey
});

// Handle duplicate detection
if (response.status === 200) {
  // Already processed, use cached result
}

// ❌ INCORRECT - never do this
const response = await walletService.holdInEscrow({
  // ... no idempotency key
});
```

---

### 4. Error Handling

**Required**: Features must handle all wallet errors gracefully

- [ ] **Handle insufficient balance (402)**
- [ ] **Handle wallet not found (404)**
- [ ] **Handle optimistic lock conflicts (409)**
- [ ] **Handle service unavailable (503)**
- [ ] **Display user-friendly error messages**
- [ ] **Never expose internal errors to users**

**Verification**:
```typescript
// ✅ CORRECT
try {
  const response = await walletService.holdInEscrow(request);
} catch (error) {
  if (error instanceof InsufficientBalanceError) {
    return { success: false, message: 'Not enough points' };
  }
  // Handle other errors...
}

// ❌ INCORRECT
const response = await walletService.holdInEscrow(request);
// No error handling
```

---

### 5. Structured Reason Codes

**Required**: Use structured reason codes, not free-text

- [ ] **Reason is from TransactionReason enum**
- [ ] **No user-generated text in reason field**
- [ ] **Metadata used for additional context**
- [ ] **Reason codes are documented**

**Verification**:
```typescript
// ✅ CORRECT
reason: TransactionReason.CHIP_MENU_PURCHASE

// ❌ INCORRECT
reason: `User bought ${action}` // Never free-text
```

---

### 6. Template-Based Messaging

**Required**: Financial events use templates, not literal strings

- [ ] **Feature emits financial events** for messaging
- [ ] **Events reference template IDs**
- [ ] **Template variables are structured data**
- [ ] **No literal chat strings in wallet code**
- [ ] **Messages are decoupled from wallet logic**

**Verification**:
```typescript
// ✅ CORRECT
await messagingService.sendFinancialNotification({
  eventType: 'escrow_held',
  templateId: 'points_held_for_performance',
  variables: { amount: 100, featureType: 'chip_menu' },
  recipientId: userId,
  recipientType: 'user',
  timestamp: new Date()
});

// ❌ INCORRECT
sendChat(`You spent ${amount} points!`); // Never literal strings
```

---

### 7. No PII in Metadata

**Required**: Metadata must not contain personally identifiable information

- [ ] **No names, emails, phone numbers**
- [ ] **No IP addresses, locations**
- [ ] **User ID / Model ID only** for identification
- [ ] **Structured data only** (JSON-serializable)
- [ ] **Metadata is for audit context only**

**Verification**:
```typescript
// ✅ CORRECT
metadata: {
  featureType: 'chip_menu',
  actionId: 'act-123',
  timestamp: new Date().toISOString()
}

// ❌ INCORRECT
metadata: {
  userName: 'John Doe',  // No PII
  email: 'user@example.com',  // No PII
  ipAddress: '192.168.1.1'  // No IP
}
```

---

### 8. Request Tracing

**Required**: All operations must include request IDs

- [ ] **Feature generates or accepts request ID**
- [ ] **Request ID is UUID format**
- [ ] **Request ID passed to all wallet calls**
- [ ] **Request ID logged for debugging**
- [ ] **Request ID returned in responses**

**Verification**:
```typescript
// ✅ CORRECT
const requestId = req.headers['x-request-id'] || uuidv4();
const response = await walletService.holdInEscrow({
  // ... other fields
  requestId
});
```

---

### 9. Optimistic Locking Awareness

**Required**: Features must handle version conflicts

- [ ] **Feature handles 409 Conflict responses**
- [ ] **Retry logic implemented** (exponential backoff)
- [ ] **Maximum retry attempts defined** (e.g., 3 attempts)
- [ ] **User notified after max retries**

**Verification**:
```typescript
// ✅ CORRECT
let retries = 0;
const maxRetries = 3;
while (retries < maxRetries) {
  try {
    const response = await walletService.holdInEscrow(request);
    break; // Success
  } catch (error) {
    if (error instanceof OptimisticLockError && retries < maxRetries - 1) {
      retries++;
      await sleep(Math.pow(2, retries) * 100); // Exponential backoff
      continue;
    }
    throw error;
  }
}
```

---

### 10. Authorization

**Required**: Only queue can settle/refund

- [ ] **Feature does NOT have queue authorization token**
- [ ] **Feature cannot call settle endpoints**
- [ ] **Feature cannot call refund endpoints**
- [ ] **Feature only calls hold endpoint**

**Verification**:
```typescript
// ✅ CORRECT - Feature can do this
await walletService.holdInEscrow(request);

// ❌ PROHIBITED - Feature CANNOT do this
await walletService.settleEscrow(request, authorization); // Only queue!
await walletService.refundEscrow(request, authorization); // Only queue!
```

---

### 11. Amount Validation

**Required**: Validate amounts before wallet operations

- [ ] **Amount is positive** (> 0)
- [ ] **Amount is numeric** (not string)
- [ ] **Amount has reasonable precision** (2 decimals typical)
- [ ] **Amount is within limits** (if applicable)
- [ ] **Amount validated server-side** (never trust client)

**Verification**:
```typescript
// ✅ CORRECT
if (amount <= 0 || !Number.isFinite(amount)) {
  throw new ValidationError('Invalid amount');
}

// Round to prevent precision issues
amount = Math.round(amount * 100) / 100;
```

---

### 12. Testing Requirements

**Required**: Comprehensive tests for financial logic

- [ ] **Unit tests for happy path**
- [ ] **Unit tests for insufficient balance**
- [ ] **Unit tests for idempotency**
- [ ] **Integration tests for escrow flow**
- [ ] **Edge case tests** (zero amounts, concurrency)
- [ ] **Rollback tests** (transaction failures)

**Test Coverage**:
- Minimum 100% coverage for wallet integration code
- All error paths must be tested
- Idempotency must be tested with duplicate requests

---

### 13. Documentation

**Required**: Feature must be documented

- [ ] **API endpoints documented** in OpenAPI spec
- [ ] **Integration flow documented**
- [ ] **Error responses documented**
- [ ] **Example requests provided**
- [ ] **Settlement trigger documented**

---

### 14. Performance Considerations

**Required**: Feature must not degrade wallet performance

- [ ] **No N+1 queries**
- [ ] **Batch operations where possible**
- [ ] **Wallet calls are async** (non-blocking)
- [ ] **Timeouts configured** (e.g., 5 seconds)
- [ ] **Circuit breaker implemented** (optional but recommended)

---

### 15. Legacy Pattern Avoidance

**Required**: No legacy patterns allowed

- [ ] **Does NOT use direct deduction**
- [ ] **Does NOT skip escrow**
- [ ] **Does NOT use literal chat strings**
- [ ] **Does NOT settle without queue authority**
- [ ] **Does NOT reference archived code patterns**

**Prohibited Patterns** (from legacy Spin Wheel):
```typescript
// ❌ NEVER DO THIS (legacy pattern)
wallet.availableBalance -= amount;  // Direct deduction
model.earnedBalance += amount;  // Direct settlement
sendChat("You won!");  // Literal string
```

---

## Certification Process

### Phase 1: Self-Assessment
1. Developer completes this checklist
2. All items marked as complete
3. Tests pass with 100% coverage

### Phase 2: Code Review
1. Peer review verifies checklist compliance
2. Reviewer checks for prohibited patterns
3. Reviewer validates error handling

### Phase 3: Architecture Review
1. Architecture team reviews escrow flow
2. Validates queue integration
3. Confirms no business logic in wallet service

### Phase 4: Security Review
1. Security team validates no PII in logs/metadata
2. Confirms idempotency implementation
3. Validates authorization boundaries

### Phase 5: Certification
1. All reviews passed
2. Feature marked as compliant
3. Feature approved for production deployment

---

## Compliance Matrix

| Feature | Escrow | Queue | Idempotency | Templates | Certified | Date |
|---------|--------|-------|-------------|-----------|-----------|------|
| Slot Machine | ✅ | ✅ | ✅ | ✅ | ✅ | 2025-12-15 |
| Chip Menu | ✅ | ✅ | ✅ | ✅ | ✅ | 2025-12-15 |
| Spin Wheel (Legacy) | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| [New Feature] | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | TBD |

**Legend**:
- ✅ Compliant
- ❌ Non-compliant
- ⏳ Pending review

---

## Non-Compliance Consequences

### Development Phase
- PR will be rejected
- Must fix non-compliant code
- Re-submit for review

### Production Phase
- Feature will be feature-flagged/disabled
- Security incident if PII exposed
- Immediate remediation required
- Post-mortem analysis

---

## Compliance Support

### Questions About Compliance
1. Review `/docs/WALLET_ESCROW_ARCHITECTURE.md`
2. Review existing compliant features (Slot Machine, Chip Menu)
3. Ask in architecture channel
4. Consult with wallet service team

### Reporting Non-Compliance
If you discover non-compliant code in production:
1. Create security incident ticket
2. Notify architecture team immediately
3. Document in incident report
4. Follow remediation process

---

## Document Maintenance

**Version**: 1.0  
**Last Updated**: 2025-12-23  
**Review Schedule**: Quarterly or when architecture changes

**Change Process**:
1. Propose updates via PR
2. Architecture team approval required
3. Update compliance matrix
4. Notify all development teams

---

**This checklist is authoritative. All new features must comply before production deployment.**
