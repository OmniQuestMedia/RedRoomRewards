# Source Code Directory

This directory contains the core application source code for RedRoomRewards.

## Structure

- **ledger/** - Ledger transaction recording and audit trail logic (scaffolded)
- **wallets/** - Wallet management and balance operations (scaffolded)
- **services/** - Business logic and domain services (scaffolded)
- **webhooks/** - Webhook handlers for external integrations (scaffolded)

## Status

All subdirectories are currently **scaffolded only**. Implementation will be added in subsequent phases.

## Prohibitions

- **NO legacy archived code** may be referenced or used
- **NO runtime UI, chat, broadcast, or tipping logic** belongs here
- See `/docs/UNIVERSAL_ARCHITECTURE.md` and `/SECURITY.md` for architectural constraints

## Development Guidelines

When implementing code in this directory:
- Follow MERN stack conventions with TypeScript
- All financial logic requires comprehensive testing and human review
- Maintain immutable audit trails for all transactions
- Use idempotency keys for all financial operations
- Implement optimistic locking for concurrent wallet updates

See `/COPILOT_GOVERNANCE.md` for detailed development rules.
