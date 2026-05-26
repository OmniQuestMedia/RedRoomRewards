# 03 — Merchant admin overview

**Role:** Merchant Admin (per-tenant operator at RedRoomPleasures or Cyrano)
**Purpose:** Give a merchant operator a one-screen read on the health of their
loyalty program — outstanding liability, recent activity, expiration warnings,
and quick links to the actions they take most often (award, refund, adjust,
audit). **Status:** draft

## API binding

- `GET /admin/wallets` — paginated wallet list scoped to the caller's
  `tenant_id`.
- Reporting endpoints under `reporting.controller.ts` — liability total,
  expiration warnings, tier-mix breakdown.
- `GET /ledger/transactions?tenant_id=...&limit=...` — recent ledger entries for
  an activity feed.
- `GET /admin/expiration/warnings` — upcoming PointLot expirations.
- (Indirect) the operator's `tenant_id` claim — server enforces scope; UI must
  never let the operator see a different tenant's data.

## States

- **Loading:** dashboard tiles render as shimmer; activity feed shows skeleton
  rows.
- **Empty (new merchant, no activity yet):** liability shows "0 pts ($0.00
  outstanding)"; activity feed shows `{empty_activity_copy}`; tier-mix tile
  renders with all-zero distribution.
- **Success:** all four tiles populated; activity feed lists the most recent ~20
  ledger entries; CTAs enabled.
- **Error states:**
  - `TENANT_SCOPE_VIOLATION` → full-screen error with `{tenant_violation_copy}`
    and a "Sign in again" CTA. This shouldn't happen for a correctly-scoped
    admin; if it does, it's a token/role bug.
  - `AUTH_INVALID` → redirect to sign-in.
  - Per-tile error → that tile shows an inline error with `{tile_error_copy}`
    and a retry control. Other tiles continue to function.
  - `RATE_LIMITED` → top-of-page banner; don't auto-retry.

## Layout intent

Desktop-first (this is an operator tool, mobile is secondary):

```
┌──────────────────────────────────────────────────────────────────────┐
│  [merchant logo + name]                  [operator name + sign out]  │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────┐  │
│  │ Outstanding        │  │ Last 7 days        │  │ Expirations    │  │
│  │ liability          │  │ activity           │  │ next 30 days   │  │
│  │                    │  │                    │  │                │  │
│  │  1,240,000 pts     │  │  +12,400 earned    │  │  4 lots        │  │
│  │  ≈ $1,240.00       │  │  − 3,200 redeemed  │  │  18,500 pts    │  │
│  │                    │  │  − 200 refunded    │  │                │  │
│  └────────────────────┘  └────────────────────┘  └────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Tier mix                                                        │ │
│  │  PLATINUM ▓▓ 8%   GOLD ▓▓▓▓▓ 22%   SILVER ▓▓▓▓▓▓▓▓ 35%          │ │
│  │  MEMBER ▓▓▓▓▓▓▓▓▓ 30%    GUEST ▓▓ 5%                            │ │
│  └─────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│  Quick actions                                                       │
│  [ Award points ]  [ Refund ]  [ Adjust ]  [ Run report ]            │
├──────────────────────────────────────────────────────────────────────┤
│  Recent activity                                                     │
│  ─────────────────────────────────────────────────────────────────   │
│  10:42  EARN     +500 pts   member abc..123   order #...             │
│  10:39  REDEEM   −200 pts   member def..456   order #...             │
│  10:11  REFUND   +120 pts   member ghi..789   reason: chargeback     │
│  ...                                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

Mobile variant: tiles stack vertically; quick-actions become a single dropdown.

## Copy slots

- **{liability_label}** — "Outstanding liability" (the unredeemed-points balance
  the merchant owes).
- **{liability_helper}** — "Points your members hold. Liability shrinks as they
  redeem or expire."
- **{activity_window_label}** — "Last 7 days" (range is locally selectable: 7d,
  30d, 90d).
- **{expiration_label}** — "Expirations next 30 days"
- **{tier_mix_label}** — "Tier mix" — share of active members per tier.
- **{empty_activity_copy}** — "No activity yet. Award some points to get
  started."
- **{tenant_violation_copy}** — "You don't have access to that record."
- **{tile_error_copy}** — "Couldn't load this. Retry?"

## Interactions

- **Tap a tile:**
  - Liability tile → drill-down to a paginated wallet list ordered by balance
    descending. (Future screen.)
  - Activity tile → drill-down to the full ledger filtered to the chosen window.
    (Future screen.)
  - Expirations tile → drill-down to the warning list from
    `GET /admin/expiration/warnings`. (Future screen.)
  - Tier-mix tile → drill-down to per-tier wallet counts. (Future screen.)
- **Tap "Award points":**
  - Opens an award flow (future screen). Calls `POST /earn` with
    `X-Idempotency-Key`.
- **Tap "Refund":**
  - Opens refund flow (future screen). Calls `POST /admin/refunds`. **Reason
    code required.**
- **Tap "Adjust":**
  - Opens manual-adjustment flow (future screen). Calls
    `POST /admin/adjustments`. **Reason code required, audited.**
- **Tap "Run report":**
  - Opens report builder (future screen). Hits reporting endpoints.
- **Tap a row in recent activity:**
  - Opens transaction detail with `GET /ledger/transactions/{id}` and
    `GET /admin/transactions/{id}/audit` rendered side-by-side.

## Accessibility notes

- Tiles are clickable; each must have a real `<button>` or link semantic — not a
  styled `<div>`.
- The tier-mix bar visualization needs a parallel data table accessible behind a
  "View as table" toggle, since bar widths aren't conveyed to assistive tech.
- The activity feed is a list (`role="list"`), each row a list item with the
  action, amount, member, and reference verbalised.
- Currency / point amounts always have a non-numeric label.

## What's stubbed for v2

- **Cross-tenant view** — operator sees only their tenant. OQMI Operator
  (cross-tenant role) gets a different overview screen, not this one. [v2 stub
  for OQMI variant]
- **Real-time activity feed** — Alpha polls every 30s on focus; v2 may use
  server-sent events. [v2 stub]
- **Saved reports / scheduled emails** — not in Alpha scope. [v2 stub]
- **Fraud-signal panel** — `FraudSignalService` exists but is webhook-driven;
  Alpha does not surface signals to the merchant admin yet. [v2 stub]
