# RedRoomRewards Loyalty Engine: Architecture

_Last updated: 2025-12-23_

---

## Purpose

A production-grade loyalty engine responsible for managing user balances, points, and redemption events, with immutable, fully auditable transaction flows. Designed with strict separation between core logic, UI, and any potentially untrusted client modules.

## Core Domains & Boundaries

- **Loyalty Engine (Service)**
  - Handles all logic for earning, spending, and storing loyalty points/credits
  - Maintains an immutable transaction ledger for all balance changes
  - Exposes RESTful or gRPC APIs (never direct DB access)

- **Clients (UI, Games, Admin Interfaces)**
  - Must interact via documented APIs only
  - No client can directly impact balance/ledger without server-side audit

- **User Authentication/Registration**
  - Out of scope unless specifically included
  - Expect integration with existing IAM/auth provider(s)
  - All balance actions require authenticated context

- **Admin/Operator Module**
  - Restricted, audited operations (manual adjustments, reports)
  - No operator action bypasses immutable recording

## Design Principles & Practices

- Never co-locate UI, game, or client logic with financial/ledger logic
- Each balance-affecting event must trace to a ledger entry (no exceptions)
- API contracts explicit; no "magic" or undocumented behavior
- Favor small, composable services and enforce clear interfaces
- Idempotent APIs for all balance actions

## Technical Components

- **Transaction Ledger**
  - Append-only, immutable, separately auditable from business logic
  - Every action writes a record: {who, what, amount, event, reference, timestamp}

- **Earning Events**
  - Deterministic, auditable triggers for point grant (game win, login, action)
  - All triggers recorded and replayable for audit

- **Redemption Logic**
  - Deducts points; idempotent, race-safe
  - Includes anti-double-spend and precondition enforcement

- **Reporting/Audit**
  - Exportable immutable logs
  - Operator dashboards query, never mutate, ledger

## Service/API Boundaries

- `/api/v1/earn` – Earning event submission (authenticated, idempotent)
- `/api/v1/redeem` – Redemption request interface
- `/api/v1/balance` – Balance/ledger query endpoints
- `/api/v1/transactions` – Full transaction history query

## Integration/Extensibility

- Designed for plug-in of new earning events, redemption types
- All integrations strictly via versioned API with access control

---

## Authoritative Changes Log

### 2025-12-23
- Initial domain/service boundaries established.
- Immutable ledger is mandatory.
- No direct client or UI access to ledger logic.
- No backdoors or undocumented override paths.
