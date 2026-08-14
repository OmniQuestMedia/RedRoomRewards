# Design System — Phase 2 (RedRoomRewards)

**Status:** 2026-08-14
**Authority:** Live repo code > architectural constraints > Drive handoffs
(reference only).

Phase 1 primitives: `docs/DESIGN_SYSTEM_PHASE1.md`.

## Live route inventory (member-portal)

| Route | Role |
| --- | --- |
| `/` | Member dashboard (balance + recent + CTAs) |
| `/earn` | Ways to earn |
| `/burn` | Redeem / catalogue |
| `/promotions` | Progress bars + timed offers |
| `/redemptions` | Redemption history |
| `/history` | Full ledger history |

## Primary wireframe — Dashboard (`/`)

```
┌────────────────────────────────────────────────────┐
│ Nav (earn / burn / promotions / history)           │
├────────────────────────────────────────────────────┤
│ ┌─ Balance card ─────────────────────────────────┐ │
│ │ Welcome back                                   │ │
│ │  [totalPoints]  points                         │ │
│ │  TierBadge  (DESIRE|PASSION|OBSESSION|REIGN)   │ │
│ │  Promotional balance: N pts                    │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ Recent Activity                                    │
│  ┌ row ┐ reason / date                +/- pts      │
│  └─────┘ …                                         │
│  View full history →                               │
│                                                    │
│ ┌ Redeem Points ┐  ┌ Earn More ┐                   │
│ └───────────────┘  └───────────┘                   │
└────────────────────────────────────────────────────┘
```

## Secondary — Promotions

```
┌────────────────────────────────────────────────────┐
│ Your progress                                      │
│  ProgressBarCard × N  (ratio, remaining, endsOn)   │
│ Redeem your points                                 │
│  OfferCard × N  (price, claims left, Redeem CTA)   │
└────────────────────────────────────────────────────┘
```

## State matrix

| State | Trigger | UI |
| --- | --- | --- |
| loading | client fetch | centered "Loading…" |
| empty recent | no txs | calm empty copy → RRP earn hint |
| empty offers | no promotions | "No … available right now" cards |
| error | API throw | red border error panel |
| gated | !requireAuth | redirect / silent return |
| edge | unknown tier | fallback tier string, no crash |

## Primitive binding

| Primitive | Use |
| --- | --- |
| StatusIndicator | Offer / progress status chrome |
| TierBadge | Dashboard tier (map loyalty tiers) |
| BooleanToggle | Pref / marketing opts when added |
| GateGuardModal | Step-up if member portal adds compliance shells |

Earn, burn, redemption, promotions bind to RRR API contracts only
(`lib/rrr-client`). Points are integer; no client-side money math.
