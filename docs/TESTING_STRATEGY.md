# Testing Strategy for Wallet & Escrow System

**Document Type**: Testing Specification  
**Status**: Authoritative  
**Date**: 2025-12-23  
**Applies To**: RedRoomRewards Wallet and Escrow Implementation

---

## Overview

This document defines comprehensive testing requirements for the wallet and escrow system. Financial logic requires **100% test coverage** and human review before deployment.

**Reference**: See `/COPILOT_GOVERNANCE.md` Section 2.1 for mandatory review requirements.

---

## Testing Pyramid

```
         /\
        /  \  E2E Tests (10%)
       /----\
      /      \  Integration Tests (30%)
     /--------\
    /          \  Unit Tests (60%)
   /____________\
```

**Coverage Requirements**:
- Unit Tests: 100% for wallet/ledger logic
- Integration Tests: All critical flows
- E2E Tests: Happy paths and major scenarios

---

## 1. Unit Tests

### 1.1 Wallet Service Tests

**File**: `src/wallets/__tests__/wallet-service.test.ts`

**Test Scenarios**:

```typescript
describe('WalletService', () => {
  describe('holdInEscrow', () => {
    it('should deduct from available and add to escrow', async () => {
      // Arrange
      const userId = 'user-123';
      const initialBalance = 500;
      const holdAmount = 100;
      
      // Act
      const result = await walletService.holdInEscrow({
        userId,
        amount: holdAmount,
        reason: TransactionReason.CHIP_MENU_PURCHASE,
        queueItemId: 'queue-123',
        featureType: 'chip_menu',
        idempotencyKey: uuidv4(),
        requestId: uuidv4()
      });
      
      // Assert
      expect(result.previousBalance).toBe(initialBalance);
      expect(result.newAvailableBalance).toBe(400);
      expect(result.escrowBalance).toBe(100);
    });
    
    it('should reject if insufficient balance', async () => {
      // Arrange
      const userId = 'user-123';
      const availableBalance = 50;
      const holdAmount = 100;
      
      // Act & Assert
      await expect(walletService.holdInEscrow({
        userId,
        amount: holdAmount,
        // ... other fields
      })).rejects.toThrow(InsufficientBalanceError);
    });
    
    it('should handle idempotent requests', async () => {
      // Arrange
      const idempotencyKey = uuidv4();
      
      // Act
      const result1 = await walletService.holdInEscrow({
        // ... fields
        idempotencyKey
      });
      
      const result2 = await walletService.holdInEscrow({
        // ... same fields
        idempotencyKey
      });
      
      // Assert
      expect(result1.transactionId).toBe(result2.transactionId);
      expect(result1.escrowId).toBe(result2.escrowId);
      // Balance only deducted once
    });
    
    it('should handle optimistic lock conflicts', async () => {
      // Simulate concurrent updates
      // Should retry and succeed
    });
    
    it('should create immutable ledger entry', async () => {
      // Verify ledger entry created
      // Verify entry is immutable
    });
    
    it('should validate amount is positive', async () => {
      await expect(walletService.holdInEscrow({
        // ... fields
        amount: 0
      })).rejects.toThrow(ValidationError);
      
      await expect(walletService.holdInEscrow({
        // ... fields
        amount: -100
      })).rejects.toThrow(ValidationError);
    });
  });
  
  describe('settleEscrow', () => {
    it('should transfer from escrow to model earned', async () => {
      // Arrange
      const escrowId = 'esc-123';
      const modelId = 'model-456';
      const amount = 100;
      const authorization = generateMockAuthorization();
      
      // Act
      const result = await walletService.settleEscrow({
        escrowId,
        modelId,
        amount,
        queueItemId: 'queue-123',
        reason: TransactionReason.PERFORMANCE_COMPLETED,
        authorizationToken: authorization.token,
        idempotencyKey: uuidv4(),
        requestId: uuidv4()
      }, authorization);
      
      // Assert
      expect(result.settledAmount).toBe(100);
      expect(result.modelEarnedBalance).toBeGreaterThan(0);
      
      // Verify escrow status changed to "settled"
      const escrow = await escrowService.getEscrow(escrowId);
      expect(escrow.status).toBe(EscrowStatus.SETTLED);
    });
    
    it('should reject if escrow not found', async () => {
      await expect(walletService.settleEscrow({
        escrowId: 'nonexistent',
        // ... fields
      })).rejects.toThrow(EscrowNotFoundError);
    });
    
    it('should reject if escrow already settled', async () => {
      // First settlement succeeds
      // Second settlement with same escrowId should fail
    });
    
    it('should reject invalid authorization', async () => {
      await expect(walletService.settleEscrow({
        // ... fields
        authorizationToken: 'invalid-token'
      })).rejects.toThrow(InvalidAuthorizationError);
    });
    
    it('should reject if authorization expired', async () => {
      // Create expired token
      // Attempt settlement
      // Should fail with InvalidAuthorizationError
    });
    
    it('should verify amount matches escrow', async () => {
      // If settlement amount != escrow amount, should fail
    });
  });
  
  describe('refundEscrow', () => {
    it('should return from escrow to user available', async () => {
      // Similar to settleEscrow tests
    });
    
    it('should reject if escrow already refunded', async () => {
      // Duplicate refund attempt should fail
    });
  });
  
  describe('partialSettleEscrow', () => {
    it('should split between refund and settle', async () => {
      const escrowAmount = 100;
      const refundAmount = 30;
      const settleAmount = 70;
      
      const result = await walletService.partialSettleEscrow({
        // ... fields
        refundAmount,
        settleAmount
      });
      
      expect(result.refundedAmount).toBe(30);
      expect(result.settledAmount).toBe(70);
    });
    
    it('should reject if amounts do not sum to escrow', async () => {
      await expect(walletService.partialSettleEscrow({
        // ... fields
        refundAmount: 40,
        settleAmount: 70  // Total = 110, but escrow = 100
      })).rejects.toThrow(ValidationError);
    });
    
    it('should reject negative amounts', async () => {
      // Test negative refundAmount
      // Test negative settleAmount
    });
  });
});
```

---

### 1.2 Ledger Service Tests

**File**: `src/ledger/__tests__/ledger-service.test.ts`

**Test Scenarios**:

```typescript
describe('LedgerService', () => {
  describe('createEntry', () => {
    it('should create immutable ledger entry', async () => {
      const entry = await ledgerService.createEntry({
        accountId: 'user-123',
        accountType: 'user',
        amount: 100,
        type: TransactionType.DEBIT,
        balanceState: 'available',
        stateTransition: 'available→escrow',
        reason: TransactionReason.CHIP_MENU_PURCHASE,
        idempotencyKey: uuidv4(),
        requestId: uuidv4(),
        balanceBefore: 500,
        balanceAfter: 400
      });
      
      expect(entry.entryId).toBeDefined();
      expect(entry.amount).toBe(100);
      
      // Attempt to modify should fail
      await expect(
        ledgerService.updateEntry(entry.entryId, { amount: 200 })
      ).rejects.toThrow();
    });
    
    it('should enforce idempotency', async () => {
      const idempotencyKey = uuidv4();
      
      const entry1 = await ledgerService.createEntry({
        // ... fields
        idempotencyKey
      });
      
      const entry2 = await ledgerService.createEntry({
        // ... same fields
        idempotencyKey
      });
      
      expect(entry1.entryId).toBe(entry2.entryId);
    });
    
    it('should reject invalid state transitions', async () => {
      // Invalid: earned→escrow
      // Invalid: refunded→available
    });
  });
  
  describe('queryEntries', () => {
    it('should filter by account ID', async () => {
      // Create entries for multiple accounts
      // Query for specific account
      // Verify only that account's entries returned
    });
    
    it('should filter by date range', async () => {
      // Query with startDate and endDate
      // Verify results within range
    });
    
    it('should paginate results', async () => {
      // Query with limit and offset
      // Verify pagination works correctly
    });
  });
  
  describe('getBalanceSnapshot', () => {
    it('should calculate balance from ledger', async () => {
      // Create multiple entries
      // Get snapshot
      // Verify calculated balance matches expected
    });
    
    it('should support point-in-time queries', async () => {
      // Get snapshot at past date
      // Verify balance reflects state at that time
    });
  });
  
  describe('generateReconciliationReport', () => {
    it('should detect balance mismatches', async () => {
      // Simulate ledger vs wallet balance mismatch
      // Report should flag discrepancy
    });
    
    it('should show all transactions in range', async () => {
      // Verify report includes all relevant transactions
    });
  });
});
```

---

### 1.3 Queue Service Tests

**File**: `src/services/__tests__/queue-service.test.ts`

**Test Scenarios**: See `/docs/QUEUE_INTEGRATION_GUIDE.md` testing section.

---

## 2. Integration Tests

### 2.1 Escrow Flow Tests

**File**: `tests/integration/escrow-flow.test.ts`

**Test Scenarios**:

```typescript
describe('Escrow Flow Integration', () => {
  it('should complete full escrow → settle flow', async () => {
    // 1. Hold funds in escrow
    const escrowResponse = await walletService.holdInEscrow({
      userId: 'user-123',
      amount: 100,
      reason: TransactionReason.CHIP_MENU_PURCHASE,
      queueItemId: 'queue-123',
      featureType: 'chip_menu',
      idempotencyKey: uuidv4(),
      requestId: uuidv4()
    });
    
    // 2. Create queue item
    const queueItem = await queueService.enqueue({
      userId: 'user-123',
      modelId: 'model-456',
      escrowId: escrowResponse.escrowId,
      amount: 100,
      featureType: 'chip_menu'
    });
    
    // 3. Start performance
    await queueService.startPerformance(queueItem.queueItemId);
    
    // 4. Finish performance and settle
    const result = await queueService.finishPerformance(
      queueItem.queueItemId,
      'model-456'
    );
    
    // Verify final state
    expect(result.settlement.settledAmount).toBe(100);
    
    const userBalance = await walletService.getUserBalance('user-123');
    expect(userBalance.escrow).toBe(0);
    
    const modelBalance = await walletService.getModelBalance('model-456');
    expect(modelBalance.earned).toBeGreaterThan(0);
    
    // Verify ledger entries created
    const ledgerEntries = await ledgerService.queryEntries({
      escrowId: escrowResponse.escrowId
    });
    expect(ledgerEntries.entries.length).toBeGreaterThan(0);
  });
  
  it('should complete full escrow → refund flow', async () => {
    // Similar to above, but abandon instead of finish
  });
  
  it('should complete partial settlement flow', async () => {
    // Hold 100, refund 30, settle 70
  });
  
  it('should handle concurrent escrow holds', async () => {
    // Multiple simultaneous holds
    // All should succeed without race conditions
  });
  
  it('should handle user disconnect during performance', async () => {
    // Hold escrow
    // Start performance
    // User disconnects
    // Should refund automatically
  });
});
```

---

### 2.2 Atomic Transaction Tests

**File**: `tests/integration/atomic-transactions.test.ts`

**Test Scenarios**:

```typescript
describe('Atomic Transactions', () => {
  it('should rollback on ledger failure', async () => {
    // Simulate ledger failure during hold
    // Wallet balance should not change
  });
  
  it('should rollback on wallet update failure', async () => {
    // Simulate wallet update failure
    // No ledger entry should be created
  });
  
  it('should rollback on escrow creation failure', async () => {
    // Simulate escrow creation failure
    // Wallet and ledger should rollback
  });
});
```

---

### 2.3 Idempotency Tests

**File**: `tests/integration/idempotency.test.ts`

**Test Scenarios**:

```typescript
describe('Idempotency', () => {
  it('should return cached result for duplicate hold', async () => {
    const idempotencyKey = uuidv4();
    const request = {
      userId: 'user-123',
      amount: 100,
      // ... other fields
      idempotencyKey
    };
    
    const result1 = await walletService.holdInEscrow(request);
    const result2 = await walletService.holdInEscrow(request);
    
    expect(result1).toEqual(result2);
    
    // Verify balance only deducted once
    const balance = await walletService.getUserBalance('user-123');
    expect(balance.available).toBe(initialBalance - 100);
  });
  
  it('should detect request tampering', async () => {
    const idempotencyKey = uuidv4();
    
    // First request
    await walletService.holdInEscrow({
      userId: 'user-123',
      amount: 100,
      // ... fields
      idempotencyKey
    });
    
    // Second request with same key but different amount
    await expect(walletService.holdInEscrow({
      userId: 'user-123',
      amount: 200,  // Changed!
      // ... fields
      idempotencyKey
    })).rejects.toThrow();
  });
});
```

---

## 3. End-to-End Tests

### 3.1 Feature Integration E2E

**File**: `tests/e2e/feature-integration.test.ts`

**Test Scenarios**:

```typescript
describe('Feature Integration E2E', () => {
  it('should complete chip menu purchase flow', async () => {
    // 1. User selects chip menu action
    // 2. Feature validates balance
    // 3. Feature holds escrow
    // 4. Feature emits queue event
    // 5. Queue creates item
    // 6. Model performs action
    // 7. Queue settles escrow
    // 8. Model receives points
    
    // Verify all steps completed successfully
  });
  
  it('should handle slot machine play and win', async () => {
    // Similar flow for slot machine
  });
});
```

---

## 4. Performance Tests

### 4.1 Load Testing

**File**: `tests/performance/load.test.ts`

**Metrics to Measure**:
- Escrow hold latency (target: <100ms p95)
- Settlement latency (target: <150ms p95)
- Throughput (target: 1000+ operations/second)
- Concurrent operations (target: no deadlocks)

**Test Scenarios**:
```typescript
describe('Load Testing', () => {
  it('should handle 1000 concurrent escrow holds', async () => {
    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(walletService.holdInEscrow({
        userId: `user-${i}`,
        amount: 100,
        // ... fields
      }));
    }
    
    const results = await Promise.all(promises);
    expect(results.length).toBe(1000);
    // Verify no failures
  });
  
  it('should maintain consistency under load', async () => {
    // Run many operations
    // Verify all balances reconcile
    // Verify no lost or duplicate transactions
  });
});
```

---

### 4.2 Stress Testing

**Test Scenarios**:
- Database connection pool exhaustion
- High memory usage scenarios
- Network latency simulation
- Partial service failures

---

## 5. Security Tests

### 5.1 Authorization Tests

**File**: `tests/security/authorization.test.ts`

**Test Scenarios**:

```typescript
describe('Authorization Security', () => {
  it('should reject settlement without queue token', async () => {
    await expect(walletService.settleEscrow({
      // ... fields
      authorizationToken: ''
    })).rejects.toThrow(InvalidAuthorizationError);
  });
  
  it('should reject tampered authorization token', async () => {
    const token = generateMockToken();
    const tamperedToken = token.slice(0, -5) + 'XXXXX';
    
    await expect(walletService.settleEscrow({
      // ... fields
      authorizationToken: tamperedToken
    })).rejects.toThrow(InvalidAuthorizationError);
  });
  
  it('should reject expired authorization token', async () => {
    const expiredToken = generateExpiredToken();
    
    await expect(walletService.settleEscrow({
      // ... fields
      authorizationToken: expiredToken
    })).rejects.toThrow(InvalidAuthorizationError);
  });
});
```

---

### 5.2 Input Validation Tests

**Test Scenarios**:
- SQL injection attempts
- NoSQL injection attempts
- XSS in metadata fields
- Oversized payloads
- Invalid UUID formats
- Negative amounts
- Extremely large amounts

---

## 6. Edge Case Tests

### 6.1 Boundary Conditions

**Test Scenarios**:

```typescript
describe('Edge Cases', () => {
  it('should handle zero balance scenarios', async () => {
    // User with 0 balance attempts hold
    // Should fail with InsufficientBalanceError
  });
  
  it('should handle minimum amount (0.01)', async () => {
    // Hold 0.01 points
    // Should succeed
  });
  
  it('should handle large amounts', async () => {
    // Hold 1,000,000 points
    // Should succeed
  });
  
  it('should handle rapid successive operations', async () => {
    // Hold, settle, hold, settle rapidly
    // All should succeed
  });
  
  it('should handle wallet not found', async () => {
    // Attempt operation on non-existent wallet
    // Should fail gracefully
  });
});
```

---

## 7. Regression Tests

### 7.1 Legacy Pattern Detection

**Purpose**: Ensure no legacy patterns re-introduced

**Test Scenarios**:
- Detect direct balance modifications
- Detect settlement without queue authority
- Detect literal chat strings
- Detect missing idempotency keys

---

## 8. Test Data Management

### 8.1 Test Fixtures

**File**: `tests/fixtures/wallet-fixtures.ts`

```typescript
export const createTestUser = () => ({
  userId: `user-${uuidv4()}`,
  availableBalance: 1000,
  escrowBalance: 0
});

export const createTestModel = () => ({
  modelId: `model-${uuidv4()}`,
  earnedBalance: 0
});

export const createTestEscrowRequest = (userId: string) => ({
  userId,
  amount: 100,
  reason: TransactionReason.CHIP_MENU_PURCHASE,
  queueItemId: `queue-${uuidv4()}`,
  featureType: 'chip_menu',
  idempotencyKey: uuidv4(),
  requestId: uuidv4()
});
```

---

### 8.2 Test Database Setup

```typescript
beforeEach(async () => {
  // Clear test database
  await clearDatabase();
  
  // Seed with test data
  await seedTestData();
});

afterEach(async () => {
  // Cleanup
  await clearDatabase();
});
```

---

## 9. Test Coverage Requirements

### 9.1 Minimum Coverage

- **Wallet Service**: 100%
- **Ledger Service**: 100%
- **Queue Service**: 100%
- **Integration Flows**: 90%
- **Overall**: 95%

### 9.2 Coverage Reporting

```bash
npm run test:coverage
```

**Report Format**: HTML, JSON, LCOV

---

## 10. Continuous Integration

### 10.1 CI Pipeline Tests

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:unit
      
  integration-tests:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:6
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:integration
      
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:e2e
```

---

## 11. Test Execution

### 11.1 Commands

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run E2E tests only
npm run test:e2e

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- wallet-service.test.ts

# Run in watch mode
npm test -- --watch
```

---

## 12. Test Maintenance

### 12.1 Test Review Schedule

- **Weekly**: Review failed tests
- **Monthly**: Update test data fixtures
- **Quarterly**: Review test coverage
- **Annually**: Full test suite audit

### 12.2 Test Documentation

- All tests must have descriptive names
- Complex tests must have comments
- Test setup/teardown must be documented
- Test data must be explained

---

## Document Maintenance

**Version**: 1.0  
**Last Updated**: 2025-12-23  
**Review Schedule**: Quarterly or when architecture changes

---

**This testing strategy is authoritative. All wallet/escrow code must have comprehensive tests before deployment.**
