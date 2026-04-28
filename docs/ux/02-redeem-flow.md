# 02 — Redeem flow

**Role:** Member
**Purpose:** Let the member apply RRR Points against an in-progress merchant transaction, within their tier cap, with idempotent confirmation.
**Status:** draft

## API binding

- `POST /redeem` — primary call. Tier-cap-validated server-side; idempotent via `X-Idempotency-Key`.
- `GET /wallets/{userId}/balance` — pre-flight read so the UI can compute and display the cap-bounded maximum the member can apply against this transaction.
- (Indirect) `merchant_tier` claim → drives the cap percent shown.

## States

- **Loading (pre-flight):** skeleton for balance + cap; the `[ Apply N points ]` CTA is disabled.
- **Ready:** member sees their available balance, the order subtotal (passed in by the merchant context), the tier cap %, and the cap-bounded maximum. The redeem control is a slider or stepper bounded to `[0, min(available, floor(subtotal * cap_pct / 100))]`.
- **Submitting:** CTA changes to a spinner, all inputs disabled. `X-Idempotency-Key` already generated and pinned for retries.
- **Success (201 Created):** confirmation panel showing applied points, cash-equivalent, new available balance, and a `{success_copy}` slot.
- **Idempotent replay (200 OK):** same confirmation panel, with a small `{replay_helper}` indicator that this was a re-submission of the same action.
- **Error states:**
  - `TIER_CAP_EXCEEDED` → inline error on the slider, `{cap_exceeded_copy}`. UI auto-clamps to the cap and re-enables the CTA at the bounded amount.
  - `INSUFFICIENT_BALANCE` → inline error, `{insufficient_balance_copy}`. UI re-fetches balance.
  - `IDEMPOTENCY_KEY_MISMATCH` → full-screen error with `{idempotency_mismatch_copy}` and a "Start over" CTA that generates a fresh key.
  - `RATE_LIMITED` → inline banner with `{rate_limit_copy}` + retry-after countdown.
  - `AUTH_INVALID` → redirect to sign-in.
  - `RECON_MISMATCH` → full-screen pause state, `{recon_pause_copy}`, no retry CTA. Ops will auto-resolve.
  - `INTERNAL_ERROR` → inline banner with `{internal_error_copy}` quoting `X-Request-ID`.

## Layout intent

```
┌────────────────────────────────────┐
│  Redeem RRR Points                 │
├────────────────────────────────────┤
│  Order subtotal:        $42.00     │
│  Your tier:             GOLD       │
│  You can redeem up to:  $14.70     │  ← 35% of $42.00
│  Available balance:     1,250 pts  │
├────────────────────────────────────┤
│  ──●─────────────  500 pts         │  ← stepper / slider bounded to cap
│  = $0.50 off                       │  ← live valuation update
├────────────────────────────────────┤
│  [ Apply 500 points ]              │  ← primary CTA
│  [ Cancel ]                        │
└────────────────────────────────────┘
```

After submit (success):

```
┌────────────────────────────────────┐
│  ✓ 500 points applied              │
│  $0.50 off your order              │
│  New balance: 750 pts available    │
│  [ Done ]                          │
└────────────────────────────────────┘
```

## Copy slots

- **{cap_explainer}** — e.g. "Your GOLD tier lets you redeem up to 35% of any order."
- **{valuation_helper}** — "1,000 points = $1.00" (default; read from valuation config — never hardcode in copy).
- **{success_copy}** — "Applied. Enjoy your savings."
- **{replay_helper}** — "We already had this on file — same redemption, no double-charge."
- **{cap_exceeded_copy}** — "Your tier lets you redeem up to {cap_pct}% of this order."
- **{insufficient_balance_copy}** — "You don't have enough points for that yet."
- **{idempotency_mismatch_copy}** — "Looks like that action already went through. Refresh to see your balance."
- **{recon_pause_copy}** — "We've paused this for a safety check. Try again in a moment."
- **{rate_limit_copy}** — "You're going a bit fast. Take a breath and try again."
- **{internal_error_copy}** — "Something went wrong on our end. Reference: {request_id}."

## Interactions

- **Adjust slider/stepper:**
  - No API call. UI re-computes the cash-equivalent locally using the valuation rate.
  - If user attempts to drag past the cap-bounded max, the control physically resists (clamps).
- **Tap "Apply N points":**
  - Generate `X-Idempotency-Key` (UUID v4) once on first tap; pin for the lifetime of this attempt.
  - `POST /redeem` with payload (member, merchant context, points, request id).
  - On 201 → success state.
  - On 200 → success state with `{replay_helper}`.
  - On error → see error states above. **Same idempotency key is reused on retry** unless the user taps "Start over."
- **Tap "Cancel":**
  - Local-only. No API call. Returns to screen 01.
- **Tap "Start over" (after IDEMPOTENCY_KEY_MISMATCH):**
  - Generates a fresh idempotency key and re-fetches the balance before re-rendering the redeem panel.

## Accessibility notes

- The slider must have a paired number input for keyboard / screen-reader users — sliders alone are inaccessible.
- The cap-bounded maximum announces as `"maximum redeemable here, {N} points, equal to {dollars}"`.
- Submit-state spinner has `aria-live="polite"` and announces `"Applying {N} points"` on entry.
- Success state announces the new balance: `"Applied {N} points. New available balance, {balance} points."`
- Errors announce via `aria-live="assertive"` so the user is interrupted on a payment-adjacent surface.

## What's stubbed for v2

- **Cross-merchant redemption** — service exists at 1:1 default (CEO B4); UI here only handles same-merchant redemption for Alpha. [v2 stub]
- **Stacked discounts / promo codes** — not in scope. The redeem amount is points-only, applied independently of any merchant promo. [v2 stub]
- **Partial idempotency-replay diff UI** — if the original payload differed by a non-meaningful field (e.g. `request_id`), v2 may want a "review what you previously did" view. Alpha just shows the success panel. [v2 stub]
