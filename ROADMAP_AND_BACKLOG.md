# RedRoomRewards Loyalty Engine: Initial Roadmap & Backlog

_Last updated: 2025-12-23_

## General Product Direction

A robust, auditable loyalty service with production-grade security, ready to integrate with OmniQuestMedia platforms and client UIs.

---

## Milestone 1: MVP (Production-Grade Core)

### EPIC 1: Immutable Transaction Ledger
- [ ] Implement append-only ledger for all point/balance changes
- [ ] Record: user, event/source, amount, timestamp, ref/ids

### EPIC 2: API Contracts
- [ ] `/api/v1/earn` (authenticated earning event, idempotent)
- [ ] `/api/v1/redeem` (safe, double-spend resilient)
- [ ] `/api/v1/balance` (balance/check endpoint)
- [ ] `/api/v1/transactions` (full, filterable history)

### EPIC 3: Earning & Redemption Logic
- [ ] Deterministic, replayable earning event logic
- [ ] Configurable redemption flows and anti-fraud

### EPIC 4: Admin/Operator Interfaces
- [ ] Operator-only audited APIs for manual adjustments
- [ ] Reporting/dashboard module (read-only access)

### EPIC 5: Integration Boundaries
- [ ] Documentation of all external/client interfaces
- [ ] API keys/OAuth model for secure integration

### EPIC 6: Audit & Security
- [ ] Audit log export/retention tools
- [ ] Per-event and per-user visibility controls

---

## Milestone 2: Enhanced Functionality

### EPIC 7: Points Transfer System
- [ ] Member-to-member point transfers (per ACCOUNT_MERGE_TRANSFER_POLICY_v1.md)
- [ ] Trust level system (L0-L3) with verification gates
- [ ] Transfer limits enforcement (daily, weekly, single transaction caps)
- [ ] Cooling period logic
- [ ] Transfer reversal workflow (24-hour window)
- [ ] Transfer escrow for high-risk transactions

### EPIC 8: Model Award System
- [ ] Model-to-viewer point gifting
- [ ] Model allocation wallet management
- [ ] Stream session proof validation
- [ ] Model award limits (per viewer, per stream, per hour, per day)
- [ ] Velocity checks and abuse controls

### EPIC 9: Account Merge Operations
- [ ] Two-stage merge workflow (ticket + execution)
- [ ] Multi-admin approval system
- [ ] Evidence validation (email, phone, payment fingerprint, etc.)
- [ ] Link resolution for XCN profiles
- [ ] Ledger-safe balance consolidation
- [ ] Merge audit records

### EPIC 10: Manual Adjustments & Exception Handling
- [ ] Tiered approval thresholds (based on point amount)
- [ ] Reason code system
- [ ] Ticket reference tracking
- [ ] Customer service credit workflows

### EPIC 11: Account Locks & Security Controls
- [ ] Transfer locks
- [ ] Redemption locks
- [ ] Full account locks
- [ ] Time-bounded lock support
- [ ] Lock reason codes and admin visibility

- [ ] Third-party hooks/triggers for partner apps
- [ ] Multi-tier rewards or loyalty statuses
- [ ] Notification hooks for client-side updates
- [ ] Bulk/manual adjustment tooling

---

## Notes & Updates

- UI/registration logic only considered if not handled externally
- Further expansion/epics documented in future milestones

### 2025-12-23
- Backlog seeded with security and audit-first minimum features
- No UI/registration slated for MVP (assume external integration)
- **Account Merge, Points Transfer, and Exception Policy v1** added to Milestone 2
  - Added comprehensive policy document (ACCOUNT_MERGE_TRANSFER_POLICY_v1.md)
  - Extended OpenAPI spec with transfer, merge, and admin endpoints
  - Created data models specification (DATA_MODELS_TRANSFERS_MERGES_v1.md)
  - Created enforcement guide (POLICY_ENFORCEMENT_GUIDE_v1.md)
  - Defined trust level system (L0-L3) for transfer eligibility
  - Specified approval thresholds for manual adjustments
  - Documented account merge workflow and evidence requirements
