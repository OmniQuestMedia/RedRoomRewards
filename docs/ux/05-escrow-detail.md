# 05 — Escrow Detail

**Role:** Member
**Purpose:** Let a member inspect the individual holds on their points — what is being held, why, what event will release it — so they understand the gap between their total and available balances.
**Status:** draft

## API binding

- `GET /wallets/{userId}/escrow` — primary source; returns all active escrow items for the member. Loaded on screen open.
- `GET /wallets/{userId}/balance` — sticky header balance; confirms the escrow total is consistent with the wallet snapshot.
- `GET /ledger/transactions/{id}` — tap-through to the ledger entry that created or closed a given escrow item.

## States

- **Loading:** shimmer for the summary header + 2–3 skeleton hold rows.
- **Empty (no active escrows):** summary shows "0 pts held" with `{no_escrow_copy}`; list area is blank. This is a valid, expected state.
- **Success:** summary shows total held amount; list renders one `EscrowItem` row per hold. Each row shows amount, creation timestamp, status (HELD / SETTLED / REFUNDED / PARTIAL), and the triggering reason code.
- **Error states:**
  - `AUTH_INVALID` → redirect to sign-in.
  - `WALLET_NOT_FOUND` → full-screen empty state with `{wallet_missing_copy}` and support link.
  - `ESCROW_NOT_FOUND` (on tap-through) → inline error on that row with `{escrow_gone_copy}`; list remains.
  - `RATE_LIMITED` → top-of-screen banner with `{rate_limit_copy}` and retry-after.
  - `INTERNAL_ERROR` → inline banner with `{internal_error_copy}` quoting `X-Request-ID`.

## Layout intent

Mobile-first vertical stack:

```
┌─────────────────────────────────────┐
│  ← Back             Held Points     │
├─────────────────────────────────────┤
│  Total held in escrow: 300 pts      │  ← from GET /wallets/{userId}/balance escrow_total
│  Available balance:  1,250 pts      │
├─────────────────────────────────────┤
│  Active holds                        │
│  ─────────────────────────────────  │
│  ┌───────────────────────────────┐  │
│  │ 200 pts · HELD                │  │
│  │ Placed: Apr 28 at 10:30       │  │
│  │ Reason: chip_menu_purchase     │  │
│  │ Awaiting performance queue     │  │
│  │ ▸ View ledger entry           │  │  ← tap-through to screen 04 filtered to this entry
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ 100 pts · HELD                │  │
│  │ Placed: Apr 27 at 22:01       │  │
│  │ Reason: performance_queue      │  │
│  │ Awaiting performance queue     │  │
│  │ ▸ View ledger entry           │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  Resolved holds (last 7 days)        │
│  ─────────────────────────────────  │
│  ┌───────────────────────────────┐  │
│  │ 50 pts · SETTLED → Model A    │  │
│  │ Settled: Apr 26 at 14:15      │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ 30 pts · REFUNDED             │  │
│  │ Refunded: Apr 25 at 09:08     │  │
│  │ Reason: performance_abandoned  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

Escrow lifecycle states shown per row (see §4.1 of UX_INTEGRATION_BRIEF.md):

| Status    | Label shown          | Terminal? |
| --------- | -------------------- | --------- |
| HELD      | "Held · awaiting"    | No        |
| SETTLED   | "Settled → {model}"  | Yes       |
| REFUNDED  | "Refunded"           | Yes       |
| PARTIAL   | "Partially settled"  | Yes       |

Terminal-state rows are collapsed under "Resolved holds" and limited to the last 7 days by default. Older resolved holds are accessible via `GET /ledger/transactions` filtered by escrow type (screen 04).

## Copy slots

- **{no_escrow_copy}** — "All clear — no points are currently held. Your full balance is available to redeem."
- **{wallet_missing_copy}** — "We couldn't find your loyalty wallet. Contact support and quote {request_id}."
- **{escrow_gone_copy}** — "That hold isn't available anymore — it may have already settled or been refunded."
- **{rate_limit_copy}** — "You're going a bit fast. Take a breath and try again."
- **{internal_error_copy}** — "Something went wrong on our end. Reference: {request_id}."
- **{awaiting_label}** — "Awaiting performance queue" (or merchant-configured label for the event type).
- **{settled_label}** — "Settled to {model_display_name}" — only model display name; no PII.
- **{refunded_label}** — "Refunded to your available balance."
- **{partial_label}** — "{settle_amount} pts settled · {refund_amount} pts returned to you."

## Interactions

- **Pull to refresh:**
  - Re-fetches `GET /wallets/{userId}/escrow` and `GET /wallets/{userId}/balance`. Existing rows animate out/in; no layout jump.
- **Tap "View ledger entry":**
  - Navigates to screen 04 with a pre-applied filter for the linked `correlationId` or transaction ID. No new network call on this screen.
- **Tap a HELD row:**
  - No action available to the member. Row is informational only. No settle or cancel affordance — settlement is exclusively via the Performance Queue (see architecture docs).
- **Tap a terminal-state row:**
  - Row expands to show settled/refunded amount, destination, and the linked ledger entry reference. A "View ledger entry" link fires a navigation to screen 04.

## Accessibility notes

- Each escrow row announces: `"Hold of {N} RRR Points, status {status}, placed {date}"`.
- Terminal-state rows in the resolved section announce their terminal status and date.
- `SETTLED` rows must state the destination without PII: `"Settled to model, {N} points."` — never the model's full name or ID directly (use `model_display_name` from the escrow response).
- "Awaiting performance queue" label must be present as visible text, not just an icon, for screen-reader users.
- The pull-to-refresh trigger has an accessible label: `aria-label="Refresh held points"`.

## What's stubbed for v2

- **Member-visible release ETA** — the Performance Queue does not currently surface an ETA to the member. The hold shows "awaiting" without a time estimate. [v2 stub — requires queue-to-member messaging spec]
- **Dispute / escalation flow** — members cannot initiate a dispute directly from this screen in Alpha; they must contact support. [v2 stub]
- **Push notification on hold release** — out of Alpha scope. [v2 stub]
- **Resolved holds beyond 7 days** — routed to screen 04 for Alpha; a dedicated history tab on this screen is v2. [v2 stub]
