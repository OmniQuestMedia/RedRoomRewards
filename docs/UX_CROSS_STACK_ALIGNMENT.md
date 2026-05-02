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
- [ ] Presenter vs OpenAPI binding note (add below)

---

## Binding Targets

- RedRoomRewards: Frozen OpenAPI (`api/openapi.yaml`)
- ChatNow.Zone / Cyrano: Frozen presenter contracts (`ui/types/`)
- Shared components must remain agnostic to binding method.
