# Design System — Phase 1 (RedRoomRewards)

**Status:** 2026-08-13  
**Authority:** Live repo code > architectural constraints > Drive handoffs (reference only).

## Tokens

| Source | Path |
| --- | --- |
| Typed map | `apps/member-portal/src/lib/design-tokens.ts` |
| Tailwind | `apps/member-portal/tailwind.config.ts` |

Loyalty brand primary remains **red-desire** ramp. Fleet aubergine + support colors are available for cross-product chrome (GateGuard, tier badges, status).

## Shared primitives

| Primitive | Path |
| --- | --- |
| StatusIndicator | `apps/member-portal/src/components/ui/status-indicator.tsx` |
| TierBadge | `apps/member-portal/src/components/ui/tier-badge.tsx` |
| BooleanToggle | `apps/member-portal/src/components/ui/boolean-toggle.tsx` |
| GateGuardModal | `apps/member-portal/src/components/ui/gateguard-modal.tsx` |

Earn / burn / redemption / promotions surfaces continue to bind to RRR API contracts only.
