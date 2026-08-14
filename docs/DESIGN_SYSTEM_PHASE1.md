# Design System — Phase 1 (RedRoomRewards)

**Status:** 2026-08-13

**Authority:** Live repo code > architectural constraints > Drive handoffs
(reference only).

## Tokens

- Typed map:
  `apps/member-portal/src/lib/design-tokens.ts`
- Tailwind:
  `apps/member-portal/tailwind.config.ts`

Loyalty brand primary remains the **red-desire** ramp. Fleet aubergine
and support colors (slate, champagne, accents) are available for
cross-product chrome such as GateGuard, tier badges, and status
indicators.

## Shared primitives

- StatusIndicator —
  `apps/member-portal/src/components/ui/status-indicator.tsx`
- TierBadge —
  `apps/member-portal/src/components/ui/tier-badge.tsx`
- BooleanToggle —
  `apps/member-portal/src/components/ui/boolean-toggle.tsx`
- GateGuardModal —
  `apps/member-portal/src/components/ui/gateguard-modal.tsx`

Earn, burn, redemption, and promotions surfaces continue to bind to
RRR API contracts only.
