# Architecture Principles (RedRoomRewards)

## 2025-12-15

- All token-affecting services (Chip Menu, Slot Machine, Promotions) are standalone domain modules.
- UI logic and financial/accounting logic are strictly separated.
- All balance changes route through immutable, audit-trailed transactions.
- No feature downgrades/regressions permitted; always forward-extending development.
- Real-time events use explicit versioned names; all changes documented.
- Critical security and non-regression constraints logged in `DECISIONS.md`.

## Integration Boundaries

- Chip Menu, Slot Machine: separate APIs/modules, integrated via event bus/socket only.
- Admin, Model, Viewer: role-based auth enforced at module and API level.
