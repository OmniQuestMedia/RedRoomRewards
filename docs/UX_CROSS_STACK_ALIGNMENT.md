# UX Cross-Stack Alignment — RedRoomRewards

**Audience:** UX leads, API authors, and cross-stack design reviewers for RRR, Cyrano, and ChatNow.Zone.

**Purpose:** Record cross-stack vocabulary decisions, gap-register closures, and presenter-to-API binding targets so that every surface team can work from the same ground truth.

**Authority:** defers to `docs/DOMAIN_GLOSSARY.md` (canonical naming) and `api/openapi.yaml` (contract).

---

## Gap Register — Status as of 2026-04-28

- [x] Diamond Concierge axis resolved (tier attribute)
- [x] correlation_id vs idempotency_key resolved
- [x] Slot machine fully retired
- [x] reason_code vs error_code distinction documented
- [x] Tier badge component made prop-driven
- [x] Wallet/Escrow semantic alignment confirmed
- [x] Presenter vs OpenAPI binding note documented (see Binding Targets below)

---

## Binding Targets

- **RedRoomRewards:** frozen OpenAPI contract (`api/openapi.yaml`). Surface is REST request/response, with webhooks for outbound fan-out. See `docs/UX_INTEGRATION_BRIEF.md` §11 for the poll-vs-stream topology table.
- **ChatNow.Zone / Cyrano:** frozen presenter contracts (`ui/types/`) with NATS-driven live updates for chat, haptic, FFS meter, GateGuard alerts, audit-chain emissions, Cyrano session events, and recovery audit events.
- **Shared components must remain agnostic to binding method.** Per `docs/ux/00-shared-components.md`, `WalletBuckets`, `AuditRow`, `TierBadge`, and `ComplianceOverlay` accept data via props and do not know whether the host fetched it via REST or subscribed via NATS.

### Why two different binding targets

RRR is a backend ledger that exposes a stable REST surface intended to outlive any single front-end framework choice. CNZ / Cyrano are full-stack platforms with live in-session data (chat, haptic, session heat) where REST polling is forbidden — those surfaces require streaming infrastructure. Both binding targets are correct for their domain. The contract that bridges them is the **shared component prop shape**, not the transport.

### Adoption rule for new screens

When a new screen is authored:
1. If the screen is RRR-only (loyalty surfaces only): bind to REST per `api/openapi.yaml` and follow the poll-vs-stream rules in `docs/UX_INTEGRATION_BRIEF.md` §11.
2. If the screen is CNZ / Cyrano (live-session surfaces): bind to the presenter contract in the relevant repo and follow that repo's NATS topology.
3. If the screen renders cross-stack data (e.g. an RRR balance embedded in a CNZ session): use shared components from `docs/ux/00-shared-components.md` and let each platform provide its own data fetch.

No screen should mix REST polling and NATS streaming for the same data field. Pick one per field, document it in the screen spec.
