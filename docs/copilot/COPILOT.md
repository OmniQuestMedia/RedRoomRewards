# Engineering Briefing (Authoritative Spec)
Repo: RedRoomRewards
Feature: Slot Machine, Chip Menu, Token Systems
Version: v1.0
Date: 2025-12-15
Status: Approved

## Non-Regression Rules (Mandatory)
1. This document is the single source of truth for these features.
2. Do **not** remove, rename, or “simplify away” existing behavior unless this spec explicitly says so.
3. If code conflicts with this spec, code must be updated to match the spec. If the spec is wrong, propose a spec change FIRST (w/version bump).
4. Preserve backwards compatibility and existing endpoints/events unless explicitly deprecated.
5. Performance: optimize DB lookups (O(1)/O(log n)), avoid chatty sockets, minimize DB round-trips, and measure performance-critical path changes.

## Definition of Done (Mandatory)
- All checklists in this doc pass (backend + frontend).
- Tests added/updated, and existing tests still pass.
- No lint/type errors.
- Observability exists for critical paths (purchase, balance updates, socket events).
- Security validation is server-side (never trust client payload).

## PR Checklist

### Backend (e.g., NestJS/Mongo)
- [ ] Module wiring: feature modules imported in AppModule, controllers/providers registered/exports as needed.
- [ ] Models registered (menu, purchase, user/favorites, spin, etc.)
- [ ] DTOs validate all limits (label length, price bounds, bets, menu sizes, etc.)
- [ ] Authorization: correct role guards.
- [ ] Purchase/Spin path:
  - [ ] Server-side authoritative logic for price, discount/bump, win determination.
  - [ ] Atomic token transfer, idempotency, audit log on outcome.
- [ ] Real-time: socket event names/version per spec; room strategy defined.
- [ ] Indexed DB queries for hot paths; no N+1.
- [ ] Structured logs/metrics for all token-affecting flows.
- [ ] Rate limit spin and purchase endpoints.
- [ ] Never trust client-supplied prices, outcomes, or payout.
- [ ] No double-spend, no double-charge on retry.

### Frontend (e.g. Next.js/React)
- [ ] Feature flag gating.
- [ ] Mobile and accessibility patterns present.
- [ ] Correct error handling.
- [ ] Performance: no excessive renders; lazy load heavy assets.

### Documentation
- [ ] Spec version referenced in code and docs.
- [ ] API endpoints documented.
- [ ] Migration notes included if schema changes.

### Non-Regression
- [ ] Diff reviewed: no unrelated files touched.
- [ ] Prior behaviors preserved unless spec explicitly changes them.

---

## Audit Procedure
1. Review `docs/specs/SLOT_MACHINE_SPEC_v1.0.md` and this file (COPILOT.md).
2. Scan all relevant code/branches (backend+frontend).
3. List all spec mismatches.
4. Make minimum necessary changes.
5. Do **not** remove or alter existing features unless authorized.
6. Commit to feature branch, run this checklist, and include in PR desc.
7. Document changes and reference spec version.

---

## Version History
- 2025-12-15: Initial authoring, slot machine spec included.
