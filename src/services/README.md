# Services Module

**Status**: Core business logic implemented

## Purpose

The services module contains:
- Business logic and domain services for point management
- Orchestration of ledger and wallet operations
- Point accrual, redemption, expiration, and admin operations
- Integration with external systems (future)
- Event publishing and handling (delegated to events module)

## Implemented Services

### PointAccrualService

Handles all point earning operations with full audit trails.

**Operations:**
- `awardPoints()` - Generic point award with validation
- `awardSignupBonus()` - New user signup rewards
- `awardReferralBonus()` - Referral program rewards
- `awardPromotionalPoints()` - Promotional campaigns with expiration
- `adminCreditPoints()` - Administrative credits with reason tracking

**Key Features:**
- Validates earning reasons and amounts
- Creates immutable ledger entries
- Supports point expiration metadata
- Handles wallet creation for new users
- Optimistic locking for concurrent safety

### PointRedemptionService

Orchestrates point redemptions by holding funds in escrow.

**Operations:**
- `redeemPoints()` - Generic redemption with validation
- `redeemForChipMenu()` - Chip menu action purchases
- `redeemForSlotMachine()` - Slot machine play requests
- `redeemForSpinWheel()` - Spin wheel play requests
- `redeemForPerformance()` - Performance request holds

**Key Features:**
- Balance validation before redemption
- Holds funds in escrow (not settlement)
- Settlement/refund handled by queue service
- Validates redemption reasons and feature types
- Configurable min/max redemption limits

### PointExpirationService

Processes automatic point expiration based on configured rules.

**Operations:**
- `processUserExpiration()` - Expire points for single user
- `processBatchExpiration()` - Batch processing for scheduled jobs
- `getUsersWithExpiringPoints()` - Get users for warning notifications

**Key Features:**
- Queries ledger for expired credit entries
- Creates debit entries for expirations
- Supports grace period configuration
- Batch processing with configurable size
- Warning notifications before expiration

### AdminOpsService

Provides privileged administrative operations with full audit trails.

**Operations:**
- `manualAdjustment()` - Credit or debit points with reason
- `processRefund()` - Issue refunds to users
- `correctBalance()` - Fix balance discrepancies
- `getAdminOperationHistory()` - Audit trail of admin operations

**Key Features:**
- Admin authorization validation (role-based)
- Full audit context (admin ID, username, IP, reason)
- Configurable adjustment limits
- Balance correction with ledger reconciliation
- Enhanced audit logging

## Key Principles

- **Server-Side Authority**: All business logic runs server-side
- **Immutable Ledger**: All operations create append-only entries
- **Atomic Operations**: Wallet updates with optimistic locking
- **Idempotency**: Protected against duplicate requests
- **Audit Trails**: Full traceability for all operations
- **Separation of Concerns**: Services don't mix responsibilities
- **No Magic Strings**: Structured reason codes only

## Architecture Patterns

### Service Composition

```typescript
// Services build on lower layers
PointAccrualService
  └─ Uses: LedgerService, WalletModel

PointRedemptionService  
  └─ Uses: WalletService (for escrow holds)

PointExpirationService
  └─ Uses: LedgerService, WalletModel

AdminOpsService
  └─ Uses: LedgerService, WalletService
```

### Transaction Flow

```
User Action
  ↓
Business Logic Service (validation, orchestration)
  ↓
Wallet Service (balance updates)
  ↓
Ledger Service (immutable audit trail)
  ↓
Database (atomic persistence)
```

## Configuration

Each service accepts configuration options:

```typescript
const accrualService = new PointAccrualService(ledgerService, {
  maxAwardAmount: 1000000,
  minAwardAmount: 1,
  enableExpiration: true,
  defaultExpirationDays: 365,
});

const redemptionService = new PointRedemptionService(walletService, {
  maxRedemptionAmount: 100000,
  minRedemptionAmount: 1,
  validateBalance: true,
});

const expirationService = new PointExpirationService(ledgerService, {
  gracePeriodDays: 0,
  batchSize: 100,
  enableNotifications: true,
  warningPeriodDays: 7,
});

const adminService = new AdminOpsService(ledgerService, walletService, {
  maxAdjustmentAmount: 1000000,
  requireReason: true,
  enhancedAuditLogging: true,
});
```

## Testing

All services have comprehensive unit tests:
- `point-accrual.service.spec.ts` - Earning operations
- `point-redemption.service.spec.ts` - Redemption flows
- (Additional test files to be added)

Run tests:
```bash
npm test -- services/
```

## Future Enhancements

When extending this module:
- Add integration with external systems via adapters
- Implement queue service for settlement authority
- Add rate limiting and throttling
- Enhance notification system integration
- Add more comprehensive validation rules

## Security Considerations

- All admin operations require authorization validation
- Full audit trails with admin context (ID, username, IP)
- No direct balance manipulation without audit trail
- Idempotency keys prevent duplicate operations
- Role-based access control for privileged operations

## Related Documentation

- `/COPILOT_GOVERNANCE.md` - Section 2.4 for API boundary rules
- `/docs/WALLET_ESCROW_ARCHITECTURE.md` - Wallet and escrow design
- `/docs/TESTING_STRATEGY.md` - Testing requirements
- `/ARCHITECTURE.md` - Domain clarity and boundaries
