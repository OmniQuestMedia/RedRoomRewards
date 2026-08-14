# Design System — Phase 3 (RedRoomRewards)

**Status:** 2026-08-14

**Authority:** Live repo code > architectural constraints > Drive handoffs
(reference only).

Phase 1 primitives: `docs/DESIGN_SYSTEM_PHASE1.md`. Phase 2 wireframes:
`docs/DESIGN_SYSTEM_PHASE2.md`.

## Scope

Typed React bindings for core layout + landing views, parameterized to live RRR
API contracts (`NEXT_PUBLIC_RRR_API_URL` via `lib/rrr-client`).

## Changes landed

### Token alignment

`TierKind` now matches live balance API tiers:

- `DESIRE` | `PASSION` | `OBSESSION` | `REIGN`
- Colors from `RRR_BRAND` red-desire ramp
- `resolveTier()` maps unknown strings → `DESIRE` (fail-closed, no crash)

Bronze/silver/gold placeholders removed (they were never returned by the API).

### Dashboard (`/`)

- Balance card uses `TierBadge` (no local TIER_COLORS / TIER_LABELS)
- Points remain integer from API — no client-side money math

### Promotions (`/promotions`)

- Progress bars: `StatusIndicator` (success = complete, pending = in progress)
- Offers: `StatusIndicator` (live / idle / offline for claim state)

## Primitive binding (Phase 3)

| Primitive       | Surface                      |
| --------------- | ---------------------------- |
| TierBadge       | Dashboard balance card       |
| StatusIndicator | Promotions progress + offers |
| BooleanToggle   | Prefs when added             |
| GateGuardModal  | Step-up shells when added    |

## State matrix (unchanged from Phase 2)

loading / empty / error / gated / edge — same contracts. Unknown tier resolves
to DESIRE via `resolveTier`.
