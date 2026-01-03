# Wallets Module

**Status**: ✅ Core implementation complete

## Purpose

The wallets module manages:
- User point balances and wallet state
- Escrow holds for pending transactions
- Model earnings wallets
- Balance queries and updates
- Optimistic locking for concurrent access

## Implemented Components

### WalletService (`wallet.service.ts`)

Core service implementing `IWalletService` interface with operations:

- `holdInEscrow()` - Deduct points and hold in escrow
- `settleEscrow()` - Transfer escrow to model earnings
- `refundEscrow()` - Return escrow to user available
- `partialSettleEscrow()` - Split between refund and settlement
- `getUserBalance()` - Get user wallet balances
- `getModelBalance()` - Get model earnings balance

### Types (`types.ts`)

Comprehensive type definitions:
- `Wallet` - User wallet with available/escrow balances
- `ModelWallet` - Model earnings wallet
- `EscrowItem` - Individual escrow tracking
- `EscrowHoldRequest/Response` - Escrow operations
- `EscrowSettleRequest/Response` - Settlement operations
- `EscrowRefundRequest/Response` - Refund operations
- `TransactionReason` - Structured reason codes
- `WalletState` - Balance state enumeration

## Key Features Implemented

### Optimistic Locking
- Version field on all wallets
- Automatic retry on conflicts
- Prevents race conditions on concurrent updates

### Escrow Management
- Three-state balance tracking (available/escrow/earned)
- Atomic escrow holds
- Queue-authorized settlement/refund only
- Partial settlement support

### Balance Tracking
- User wallets: available + escrow
- Model wallets: earned balance
- Real-time balance queries
- Integration with ledger for audit trail

### Idempotency
- All operations check idempotency keys
- Cached results for duplicate requests
- TTL-based cleanup

### Event Publishing
- Real-time wallet events for UI updates
- Escrow held/settled/refunded notifications
- Graceful degradation if event bus unavailable

## Configuration

```typescript
const walletService = new WalletService(ledgerService, {
  maxRetryAttempts: 3,
  retryBackoffMs: 100,
  defaultCurrency: 'points',
});
```

## Database Models

Uses three models:
- `wallet.model.ts` - User wallets (available + escrow)
- `model-wallet.model.ts` - Model earnings wallets
- `escrow-item.model.ts` - Individual escrow tracking

All models include:
- Optimistic locking version field
- Indexed queries for performance
- Timestamps for audit trails

## Queue Authorization

Settlement and refund operations require authorization from queue service:

```typescript
interface QueueSettlementAuthorization {
  queueItemId: string;
  token: string; // Signed JWT
  escrowId: string;
  modelId: string;
  amount: number;
  reason: TransactionReason;
  issuedAt: Date;
  expiresAt: Date;
}
```

This ensures only the queue service can authorize final settlements.

## Testing

Comprehensive test suite in:
- `wallet.service.concurrency.spec.ts` - Concurrency tests
- Additional unit tests for all operations

Tests cover:
- Escrow hold/settle/refund flows
- Optimistic lock conflict handling
- Insufficient balance errors
- Idempotency enforcement
- Authorization validation

## Key Principles

- **Optimistic Locking**: Prevent race conditions on balance updates
- **Atomicity**: Balance changes are atomic with ledger entries
- **State Validation**: Always validate expected vs actual state before updates
- **Safe Queries**: Efficient indexed queries, avoid N+1 problems
- **Audit Trail**: Every operation creates immutable ledger entry
- **Queue Authority**: Only queue service can settle/refund escrow

## Architecture Pattern

```
User Action (Redemption)
  ↓
WalletService.holdInEscrow() ← Creates escrow
  ↓
QueueService (external) ← Manages performance
  ↓
WalletService.settleEscrow() ← Queue authorized
  or
WalletService.refundEscrow() ← Queue authorized
```

## Related Documentation

- `/COPILOT_GOVERNANCE.md` - Section 2.1-2.2 for wallet-specific rules
- `/docs/WALLET_ESCROW_ARCHITECTURE.md` - Detailed escrow design
- `/docs/TESTING_STRATEGY.md` - Testing requirements
