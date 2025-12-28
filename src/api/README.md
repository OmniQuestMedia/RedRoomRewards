# API Controllers

REST API controllers for the RedRoomRewards loyalty platform, implementing the endpoints defined in `/api/openapi.yaml`.

## Overview

This module provides HTTP request handlers for ledger and wallet operations. Controllers act as the interface between HTTP requests and the underlying service layer.

## Architecture

Controllers follow these principles:
- **Thin layer**: Controllers handle HTTP concerns (request parsing, response formatting) but delegate business logic to services
- **Type-safe**: All requests and responses are strongly typed based on OpenAPI specification
- **Testable**: Controllers are fully unit tested with mocked dependencies

## Controllers

### Ledger Controller

**Location**: `src/api/ledger.controller.ts`

Provides endpoints for querying transaction history and balance information.

#### Endpoints

##### GET /ledger/transactions

Retrieves a paginated list of transactions with optional filtering.

**Query Parameters**:
- `userId` (optional): Filter by user ID
- `type` (optional): Filter by transaction type (`credit`, `debit`, or `all`)
- `startDate` (optional): ISO 8601 date - filter transactions after this date
- `endDate` (optional): ISO 8601 date - filter transactions before this date
- `limit` (optional): Maximum results per page (1-1000, default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response**: `TransactionListResponse`
```typescript
{
  transactions: Array<{
    id: string;
    userId: string;
    amount: number;
    type: 'credit' | 'debit';
    reason: string;
    timestamp: string;
    idempotencyKey: string;
    previousBalance?: number;
    newBalance?: number;
    requestId?: string;
  }>;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}
```

##### GET /ledger/balance/:userId

Returns the current balance for a user.

**Path Parameters**:
- `userId` (required): User identifier

**Response**: `BalanceResponse`
```typescript
{
  userId: string;
  available: number;
  escrow?: number;
  total: number;
  asOf: string; // ISO 8601 timestamp
}
```

### Wallet Controller

**Location**: `src/api/wallet.controller.ts`

Provides endpoints for wallet queries and balance modifications.

#### Endpoints

##### GET /wallets/:userId

Fetches detailed wallet information for a user.

**Path Parameters**:
- `userId` (required): User identifier

**Response**: `WalletResponse`
```typescript
{
  userId: string;
  availableBalance: number;
  escrowBalance: number;
  totalBalance: number;
  currency: string;
  version: number;
  createdAt: string;
  lastUpdated: string;
}
```

##### POST /wallets/:userId/deduct

Deducts points from a user's wallet.

**Path Parameters**:
- `userId` (required): User identifier

**Request Body**: `DeductPointsRequest`
```typescript
{
  amount: number; // Must be positive
  reason: string;
  metadata?: Record<string, any>;
  idempotencyKey: string;
  requestId: string;
}
```

**Response**: `TransactionResponse`
```typescript
{
  transaction: {
    id: string;
    userId: string;
    amount: number; // Negative for debit
    type: 'debit';
    reason: string;
    timestamp: string;
    idempotencyKey: string;
    previousBalance: number;
    newBalance: number;
    requestId: string;
  };
  wallet: WalletResponse;
}
```

##### POST /wallets/:userId/credit

Credits points to a user's wallet.

**Path Parameters**:
- `userId` (required): User identifier

**Request Body**: `CreditPointsRequest`
```typescript
{
  amount: number; // Must be positive
  reason: string;
  metadata?: Record<string, any>;
  idempotencyKey: string;
  requestId: string;
}
```

**Response**: `TransactionResponse`
```typescript
{
  transaction: {
    id: string;
    userId: string;
    amount: number; // Positive for credit
    type: 'credit';
    reason: string;
    timestamp: string;
    idempotencyKey: string;
    previousBalance: number;
    newBalance: number;
    requestId: string;
  };
  wallet: WalletResponse;
}
```

## Usage

### Creating Controller Instances

```typescript
import { createLedgerController, createWalletController } from './api';

// Create ledger controller
const ledgerController = createLedgerController(ledgerService);

// Create wallet controller  
const walletController = createWalletController(walletService);
```

### Example: List Transactions

```typescript
const request = {
  userId: 'user-123',
  type: 'credit',
  limit: 50,
  offset: 0,
};

const response = await ledgerController.listTransactions(request);
console.log(`Found ${response.pagination.total} transactions`);
```

### Example: Credit Points

```typescript
const request = {
  amount: 100,
  reason: 'user_signup_bonus',
  idempotencyKey: crypto.randomUUID(),
  requestId: crypto.randomUUID(),
};

const response = await walletController.creditPoints('user-123', request);
console.log(`New balance: ${response.wallet.totalBalance}`);
```

## Testing

All controllers have comprehensive unit tests with mocked dependencies.

Run tests:
```bash
# Test all controllers
npm test -- src/api

# Test specific controller
npm test -- src/api/ledger.controller.spec.ts
npm test -- src/api/wallet.controller.spec.ts
```

## Implementation Status

✅ **Complete** - All endpoints implemented and tested
- Ledger Controller: 2 endpoints (listTransactions, getBalance)
- Wallet Controller: 3 endpoints (getWallet, deductPoints, creditPoints)
- Unit tests: 16 tests covering all methods

## Next Steps

To integrate these controllers into a full REST API:

1. **Add HTTP Framework**: Install Express, Fastify, or similar
2. **Create Routes**: Map controller methods to HTTP routes
3. **Add Middleware**: Implement authentication, validation, error handling
4. **Service Implementation**: Implement the `ILedgerService` and `IWalletService` interfaces
5. **Database Integration**: Connect services to MongoDB/Mongoose models

## Dependencies

- `../ledger/types` - Ledger type definitions and service interface
- `../wallets/types` - Wallet type definitions  
- `../services/types` - Service interfaces and error classes

## Related Documentation

- `/api/openapi.yaml` - Full API specification
- `/docs/WALLET_ESCROW_ARCHITECTURE.md` - Wallet architecture details
- `/docs/UNIVERSAL_ARCHITECTURE.md` - Overall system architecture
