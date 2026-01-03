# Test Suite Documentation

**Last Updated**: 2026-01-03  
**Version**: 1.0  
**Status**: Comprehensive test suite aligned with TEST_STRATEGY.md

---

## Overview

This document describes the comprehensive test suite for RedRoomRewards loyalty platform. All tests are aligned with `/docs/TESTING_STRATEGY.md` requirements and cover:

- Core business logic (wallet, ledger, services)
- Edge cases and boundary conditions
- Security and authorization
- Audit trail integrity
- Idempotency and concurrency

---

## Test Structure

```
src/
├── __tests__/                          # Integration & security tests
│   └── security.test.ts                # Authorization & input validation
├── wallets/__tests__/
│   └── wallet.service.comprehensive.spec.ts    # Escrow operations
├── ledger/__tests__/
│   └── ledger.service.comprehensive.spec.ts    # Immutability & audit
├── services/__tests__/
│   └── point-expiration.service.comprehensive.spec.ts
└── [module]/*.spec.ts                  # Unit tests per module
```

---

## Test Commands

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suite
npm test -- wallet.service.comprehensive

# Run tests in watch mode
npm test -- --watch

# Run tests with verbose output
npm test -- --verbose
```

---

## Test Categories

### 1. Wallet Service Tests ✅
**File**: `src/wallets/__tests__/wallet.service.comprehensive.spec.ts`

**Coverage**:
- ✅ holdInEscrow: Balance deduction, insufficient balance, idempotency
- ✅ settleEscrow: Transfer to model, escrow not found, already settled
- ✅ refundEscrow: Return to user, already refunded
- ✅ partialSettleEscrow: Split operations, amount validation
- ✅ Edge cases: Zero balance, minimum amount (0.01), large amounts

**Test Count**: 14 tests

---

### 2. Ledger Service Tests ✅
**File**: `src/ledger/__tests__/ledger.service.comprehensive.spec.ts`

**Coverage**:
- ✅ Immutable entry creation with idempotency
- ✅ Query filtering (account, date range, type, pagination)
- ✅ Balance snapshots and point-in-time queries
- ✅ Reconciliation reports with mismatch detection
- ✅ Audit trail completeness and 7-year retention
- ✅ Security: PII prevention, no delete/modify operations

**Test Count**: 15 tests

---

### 3. Point Expiration Service Tests ✅
**File**: `src/services/__tests__/point-expiration.service.comprehensive.spec.ts`

**Coverage**:
- ✅ Single user expiration processing
- ✅ Batch expiration with error handling
- ✅ Grace period respect
- ✅ Warning notifications (getUsersWithExpiringPoints)
- ✅ Edge cases: Partial expiration, negative balance prevention

**Test Count**: 12 tests

---

### 4. Security Tests ✅
**File**: `src/__tests__/security.test.ts`

**Coverage**:
- ✅ Authorization validation (queue tokens, admin roles)
- ✅ Input validation (SQL injection, XSS, amounts)
- ✅ PII and secret protection in logs
- ⚠️ Rate limiting (stub for implementation)

**Test Count**: 10 tests

---

### 5. Existing Unit Tests ✅
- `src/services/auth.service.spec.ts` - 22 tests passing
- `src/services/point-accrual.service.spec.ts` - Token-based tests
- `src/services/point-redemption.service.spec.ts` - 10 tests passing
- `src/ledger/ledger.service.spec.ts` - Token-based tests
- `src/api/wallet.controller.spec.ts` - 9 tests passing
- `src/api/ledger.controller.spec.ts` - Controller tests
- `src/events/event-bus.spec.ts` - 9 tests passing
- `src/metrics/logger.spec.ts` - Logging tests

---

## Test Coverage Requirements

Per `jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
}
```

**Current Coverage Targets**:
- Wallet Service: 100% (financial logic)
- Ledger Service: 100% (audit trail)
- Core Services: 90%+
- Overall: 80%+

---

## Running Tests

### Prerequisites
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Generate Coverage Report
```bash
npm run test:coverage
open coverage/index.html
```

### Watch Mode (Development)
```bash
npm test -- --watch
```

---

## Test Philosophy

### From TEST_STRATEGY.md

1. **Financial Logic**: 100% coverage required
2. **Immutability**: No delete/modify operations allowed
3. **Idempotency**: All state-changing operations must be idempotent
4. **Audit Trail**: Complete traceability, no PII
5. **Edge Cases**: Zero/negative balance, min/max amounts
6. **Concurrency**: Optimistic locking, race condition prevention

---

## Key Test Patterns

### Mocking
```typescript
// Mock ledger service
const mockLedgerService = {
  checkIdempotency: jest.fn(),
  createEntry: jest.fn(),
  queryEntries: jest.fn(),
};

// Mock models
jest.mock('../../db/models/wallet.model');
```

### Idempotency Testing
```typescript
it('should handle idempotent requests', async () => {
  mockLedgerService.checkIdempotency.mockResolvedValue(true);
  
  await expect(
    service.operation({ idempotencyKey: 'duplicate' })
  ).rejects.toThrow('Idempotency key already used');
});
```

### Edge Case Testing
```typescript
describe('Edge Cases', () => {
  it('should handle zero balance', async () => {
    // Test boundary condition
  });

  it('should handle minimum amount (0.01)', async () => {
    // Test lower bound
  });

  it('should handle large amounts', async () => {
    // Test upper bound
  });
});
```

---

## Integration with CI

Tests are automatically run in CI pipeline on:
- Pull request creation
- Pull request updates
- Merge to main branch

**CI Configuration**: `.github/workflows/test.yml`

---

## Future Test Additions

### Planned Test Suites

1. **API Contract Compliance Tests**
   - Validate against OpenAPI spec
   - Test error response formats
   - Verify required headers

2. **Load & Performance Tests**
   - 1000+ concurrent operations
   - Throughput testing
   - Latency measurements (p95, p99)

3. **Integration Tests**
   - End-to-end escrow flows
   - Feature integration tests
   - Database integration tests

4. **Admin Operations Tests**
   - Manual adjustments
   - Refund processing
   - Balance corrections

---

## Troubleshooting

### Common Issues

**Issue**: Tests fail with "uuid module not found"  
**Solution**: Check `src/test-setup.ts` is properly configured

**Issue**: MongoDB connection errors  
**Solution**: Some tests require actual MongoDB. Use mocks for unit tests.

**Issue**: Timeout errors  
**Solution**: Increase timeout in test: `it('test', async () => {...}, 10000)`

---

## Related Documentation

- [TEST_STRATEGY.md](/docs/TESTING_STRATEGY.md) - Testing requirements
- [SECURITY.md](/SECURITY.md) - Security policy
- [CORE_MODULES_IMPLEMENTATION.md](/CORE_MODULES_IMPLEMENTATION.md) - Implementation details

---

## Maintenance

**Review Schedule**: Monthly or when architecture changes  
**Owner**: Development Team  
**Contact**: Via GitHub Issues

---

**This test suite ensures financial correctness, security, and audit compliance for the RedRoomRewards platform.**
