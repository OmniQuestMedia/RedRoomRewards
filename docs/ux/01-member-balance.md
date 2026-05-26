# 01 — Member balance

**Role:** Member **Purpose:** Show the member their available balance, points
held in escrow, and tier-cap context, so they understand what they can actually
redeem right now. **Status:** draft

## API binding

- `GET /wallets/{userId}/balance` — primary balance call. Returns available +
  escrow + (optionally) pending breakdown.
- `GET /wallets/{userId}/escrow` — list of active holds, surfaced as a secondary
  panel.
- (Indirect) the member's `merchant_tier` claim from the JWT — drives the cap
  shown alongside the balance.

## States

- **Loading:** skeleton showing balance digits as shimmer; tier badge as outline
  only; no CTAs visible.
- **Empty (zero balance):** balance reads "0 RRR Points," redeem CTA disabled
  with helper copy `{empty_balance_helper}`. Tier badge still shown.
- **Success:** balance renders; available + escrow shown distinctly; tier badge
  shows tier and cap %; redeem CTA enabled if `available > 0`.
- **Error states:**
  - `AUTH_INVALID` → redirect to sign-in with copy from §7 of the integration
    brief.
  - `WALLET_NOT_FOUND` → full-screen empty state with `{wallet_missing_copy}`
    and a "Contact support" link surfacing `X-Request-ID`.
  - `RATE_LIMITED` → inline banner with `{rate_limit_copy}`, retry-after
    countdown if header present.
  - `INTERNAL_ERROR` → inline banner with `{internal_error_copy}` quoting
    `X-Request-ID`.

## Layout intent

Mobile-first vertical stack:

```
┌────────────────────────────────────┐
│  [tier badge: GOLD · 35% cap]      │  ← role-aware, hidden if Diamond Concierge
├────────────────────────────────────┤
│                                    │
│         1,250 RRR Points           │  ← available, prominent
│         available to redeem        │
│                                    │
├────────────────────────────────────┤
│  Held in escrow:  100 pts          │  ← only if escrow > 0
│  ▸ See holds                       │  ← collapse/expand
├────────────────────────────────────┤
│  [ Redeem points ]                 │  ← primary CTA, disabled if available = 0
│  [ View history ]                  │  ← secondary
└────────────────────────────────────┘
```

Desktop variant: same vertical stack, max-width ~480px, centered. No
multi-column.

## Copy slots

- **{tier_badge_label}** — e.g. "GOLD · up to 35% off per order"
- **{available_label}** — "available to redeem"
- **{escrow_label}** — "Held in escrow"
- **{escrow_helper}** — "These points are reserved for an action in progress."
- **{empty_balance_helper}** — "Earn points at participating merchants to start
  redeeming."
- **{wallet_missing_copy}** — "We couldn't find your loyalty wallet. Contact
  support and quote {request_id}."
- **{rate_limit_copy}** — "You're going a bit fast. Take a breath and try
  again."
- **{internal_error_copy}** — "Something went wrong on our end. Reference:
  {request_id}."

## Interactions

- **Tap "Redeem points":**
  - Navigates to screen 02 (redeem flow). No API call here.
- **Tap "View history":**
  - Navigates to screen 04 (ledger / transaction history).
- **Tap "See holds" (escrow expand):**
  - Locally expands the escrow list rendered from the
    `GET /wallets/{userId}/escrow` payload already fetched on screen load. No
    additional call.
- **Pull to refresh:**
  - Re-issues both balance and escrow calls. Same idempotency rules don't apply
    (idempotent GETs).

## Accessibility notes

- Balance digit must be announced as `"available balance, 1,250 RRR Points"` not
  just `"1,250"`.
- Tier badge is decorative-and-informational — it must be in the focus order
  with its cap stated.
- Escrow panel announces `"100 RRR Points held, expandable"` when collapsed; on
  expand, individual holds are announced as a list.
- Disabled redeem CTA uses `aria-disabled="true"` plus `aria-describedby`
  pointing at `{empty_balance_helper}`, so screen-reader users hear _why_ it's
  disabled.

## What's stubbed for v2

- **`rrr_member_tier`** — not surfaced. Only `merchant_tier` shown for Alpha
  (CEO B2). [v2 stub]
- **Cross-merchant balance breakdown** — service exists at 1:1 (CEO B4); not
  split in this view for Alpha. [v2 stub]
- **Expiration warning banner** — endpoint `GET /admin/expiration/warnings`
  exists but is admin-scoped. Member-facing expiration view is screen 04 only
  for Alpha. [v2 stub]
