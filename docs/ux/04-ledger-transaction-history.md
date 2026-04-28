# 04 — Ledger / Transaction History

**Role:** Member
**Purpose:** Let a member browse their full chronological ledger history — earned, redeemed, escrowed, and expired entries — so they can reconcile their balance and quote a reference ID to support.
**Status:** draft

## API binding

- `GET /ledger/transactions` — paginated, filterable by date range and type; primary data source for the list.
- `GET /ledger/transactions/{id}` — full audit detail, loaded lazily on row tap-through.
- `GET /wallets/{userId}/balance` — balance summary shown in the sticky header so the member always sees the current state.

## States

- **Loading:** skeleton rows (3–5 shimmer lines) below a shimmered balance header.
- **Empty (no history):** balance header renders; list area shows `{empty_history_copy}` with a link back to screen 01.
- **Success:** paginated list of `AuditRow` items, oldest at bottom, newest at top; sticky balance header. Each row shows type, amount/direction, and reason code in collapsed form; tap expands to full detail.
- **Load-more (infinite scroll):** spinner at bottom of list while next page loads; existing rows stay in place.
- **Error states:**
  - `AUTH_INVALID` → redirect to sign-in.
  - `WALLET_NOT_FOUND` → full-screen empty state with `{wallet_missing_copy}` and support link quoting `X-Request-ID`.
  - `RATE_LIMITED` → inline banner with `{rate_limit_copy}` and retry-after countdown.
  - `INTERNAL_ERROR` → inline banner with `{internal_error_copy}` quoting `X-Request-ID`.
  - Per-row expand error → inline error within the expanded row; collapsed state preserved.

## Layout intent

Mobile-first vertical stack:

```
┌─────────────────────────────────────┐
│  ← Back          Transaction History│  ← navigation bar
├─────────────────────────────────────┤
│  Available: 1,250 pts  [GOLD · 35%] │  ← sticky balance + tier; from GET /wallets/{userId}/balance
├─────────────────────────────────────┤
│  Filter: [ All ▾ ]  [ Date range ▾] │  ← filter controls; applied client-side if data is fresh, else re-fetches
├─────────────────────────────────────┤
│  2026-04-28                          │  ← date group header
│  10:42  EARN    +500 pts  PURCHASE   │  ← AuditRow collapsed
│  09:15  REDEEM  −200 pts  REDEMPTION │
│  2026-04-27                          │
│  22:01  ESCROW   −100 pts  HOLD      │
│  21:58  SETTLE   +100 pts  SETTLE    │
│  ...                                 │
│  [ Loading more... ]                 │  ← infinite scroll trigger
└─────────────────────────────────────┘
```

Tap a collapsed row:

```
┌─────────────────────────────────────┐
│  10:42  EARN    +500 pts  PURCHASE   │
│  ─────────────────────────────────  │
│  Correlation ID: corr-abc-123        │
│  Reason:        Purchase — order #X  │
│  Balance before: 750 pts             │
│  Balance after:  1,250 pts           │
│  Request ID:    req-xyz-789          │
└─────────────────────────────────────┘
```

Desktop variant: max-width ~600px centred; date group headers become sticky within the scroll container.

## Copy slots

- **{empty_history_copy}** — "No transactions yet. Start earning points at a participating merchant."
- **{wallet_missing_copy}** — "We couldn't find your loyalty wallet. Contact support and quote {request_id}."
- **{rate_limit_copy}** — "You're going a bit fast. Take a breath and try again."
- **{internal_error_copy}** — "Something went wrong on our end. Reference: {request_id}."
- **{filter_all_label}** — "All types"
- **{filter_earn_label}** — "Earned"
- **{filter_redeem_label}** — "Redeemed"
- **{filter_escrow_label}** — "Held / Escrow"
- **{filter_expiry_label}** — "Expired"
- **{date_range_label}** — "Date range" (opens a date-picker; default: last 90 days)

## Interactions

- **Pull to refresh:**
  - Re-fetches the first page of `GET /ledger/transactions` and the balance header. No idempotency key (GET).
- **Filter change:**
  - Re-fetches `GET /ledger/transactions` with updated `type` or date-range query params. Resets to page 1.
- **Scroll to bottom (infinite scroll):**
  - Fetches next page using cursor from previous response. Appends rows; does not reset list.
- **Tap collapsed row:**
  - Expands inline. If full detail is needed beyond what the list endpoint provided, fetches `GET /ledger/transactions/{id}` lazily.
- **Tap "Contact support" (error state):**
  - Opens the merchant-configured support contact. `X-Request-ID` is pre-populated in any support form. [v2 stub — support integration TBD]

## Accessibility notes

- Each `AuditRow` in collapsed state must be announced as a complete sentence: `"Earned 500 RRR Points on April 28 at 10:42, reason Purchase"`.
- Expanded state renders as a description list (`<dl>`); screen readers announce each label–value pair.
- Date group headers are `<h2>` or equivalent heading level within the list context.
- Filter controls are `<select>` or `role="listbox"` — keyboard-navigable without mouse.
- Infinite scroll has a "Load more" button fallback for keyboard / assistive tech users who cannot trigger scroll events.
- Balance header is `aria-live="polite"` so a refresh announces the updated balance.

## What's stubbed for v2

- **PointLot expiry warnings** — member-facing expiration view is accessible here but formatted only as a `EXPIRY` row type for Alpha; dedicated expiry alert UI is v2. [v2 stub]
- **CSV / PDF export** — download of full transaction history is out of Alpha scope. [v2 stub]
- **Search by reference ID** — free-text search against `X-Request-ID` or `correlationId` is v2. [v2 stub]
- **Support integration** — "Contact support" action links to external support tooling not yet integrated. [v2 stub]
