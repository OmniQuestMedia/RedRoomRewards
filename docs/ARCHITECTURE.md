# Architecture Document: Reinforced Rules and Separation

## Domain Boundaries

To strengthen the integrity of the Red Room Rewards system, the following domain boundary rules are reinforced:

1. **Prohibited Interactions**:
   - Game logic, UI features, or external integrations **must not** directly interact with financial modules such as wallets, the ledger, or any module responsible for financial operations.
   - Violations (examples):
     - A game mechanic triggering a ledger update directly.
     - UI directly accessing wallet balances for display purposes.

2. All such interactions must occur through defined APIs and adapters, ensuring modular, security-first interaction.

---

## Financial Transaction Modules

### Guidelines

1. **Immutability**: Once written, financial data must be immutable.
2. **Idempotency**: Transactions must be structured to prevent duplication from retries or failures.
3. **Transactional Traceability**: Ensure every transaction and related event is chronologically traceable with audit trails.

### Strong Module Separation

- Avoid exposing transaction modules directly to frontend/UI logic.
- Enforce communication via business-controlled APIs and standardized adapters.

---

## Client/UI Logic and Backend Separation

No client or UI module may interact with backend financial modules without going through API gateways or adapters for security, logging, and boundary enforcement.

This reinforced separation **must be adhered to universally** to prevent data leaks or unauthorized financial modifications.

---

## Security Least-Privilege Access

Every module and service **must strictly follow** the principle of least privilege in accessing services and databases:

1. Modular isolation of sensitive operations (e.g., wallets and ledgers).
2. Fine-granular access control, ensuring read/write permissions remain scoped strictly to the module's responsibilities.

---
