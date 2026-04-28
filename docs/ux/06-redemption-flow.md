# 06 — Redemption Flow (Model Gifting)

**Role:** Model
**Purpose:** Let a model gift a portion of their non-redeemable model-allocation balance to a specific member, creating a ledger entry for the member earn and a matching debit from the model wallet.
**Status:** draft

## API binding

- `GET /models/{modelId}/wallet` — pre-flight read of the model's current allocation balance before surfacing the gift control.
- `POST /models/{modelId}/earn` — primary state-changing call. Delivers the gift as a member earn; subject to creator-gifting-panel rules. Idempotent via `X-Idempotency-Key`.
- `GET /ledger/transactions` — read-only history of past gifts surfaced in the screen's "Recent gifts" section.

## States

- **Loading (pre-flight):** skeleton for the allocation balance; the gift amount control and CTA are disabled.
- **Ready:** model sees their current allocation balance, the target member (pre-filled from the merchant session context or manually entered), and an amount control. The `[ Gift points ]` CTA is enabled when the amount is valid.
- **Submitting:** CTA becomes a spinner; all controls disabled. `X-Idempotency-Key` pinned for retries.
- **Success (201 Created):** confirmation panel showing gifted amount, recipient member reference, and the new allocation balance. A `{gift_success_copy}` slot.
- **Idempotent replay (200 OK):** same confirmation panel with `{replay_helper}` indicator.
- **Error states:**
  - `EARN_NOT_ALLOWED` → inline error with `{earn_not_allowed_copy}`. CTA disabled.
  - `INSUFFICIENT_BALANCE` → inline error below the amount control; re-fetches model wallet balance.
  - `IDEMPOTENCY_KEY_MISMATCH` → full-screen error with `{idempotency_mismatch_copy}` and "Start over" CTA.
  - `WALLET_NOT_FOUND` (member) → inline error with `{member_not_found_copy}`.
  - `RATE_LIMITED` → inline banner with `{rate_limit_copy}` and retry-after countdown.
  - `AUTH_INVALID` → redirect to sign-in.
  - `INTERNAL_ERROR` → inline banner with `{internal_error_copy}` quoting `X-Request-ID`.

## Layout intent

Mobile-first vertical stack:

```
┌─────────────────────────────────────┐
│  ← Back              Gift Points    │
├─────────────────────────────────────┤
│  Your allocation balance: 5,000 pts │  ← from GET /models/{modelId}/wallet
│  (Not redeemable by you)            │
├─────────────────────────────────────┤
│  Recipient member                   │
│  [ member-id or handle ____________]│  ← pre-filled from session context when available
├─────────────────────────────────────┤
│  Points to gift                     │
│  [ ─────────────●──── 250 pts ]     │  ← stepper/slider, max = allocation balance
│  = 250 RRR Points to member         │
├─────────────────────────────────────┤
│  [ Gift 250 points ]                │  ← primary CTA
│  [ Cancel ]                         │
├─────────────────────────────────────┤
│  Recent gifts                        │
│  ─────────────────────────────────  │
│  Apr 28 · 10:30 · +100 pts → M-abc  │
│  Apr 27 · 22:10 ·  +50 pts → M-def  │
└─────────────────────────────────────┘
```

After successful gift:

```
┌─────────────────────────────────────┐
│  ✓ 250 points gifted               │
│  to member M-abc                   │
│  Remaining allocation: 4,750 pts   │
│  [ Gift again ]   [ Done ]         │
└─────────────────────────────────────┘
```

## Copy slots

- **{allocation_helper}** — "Your gifting allocation is separate from your redeemable balance. Gift it to any member."
- **{recipient_placeholder}** — "Member ID or handle"
- **{gift_success_copy}** — "Done — {N} points gifted."
- **{replay_helper}** — "We already had this gift on file — same amount, no duplicate."
- **{earn_not_allowed_copy}** — "This tier doesn't allow earning on this transaction." (surfaces only if the target member's tier blocks the earn — see `EARN_NOT_ALLOWED`).
- **{insufficient_balance_copy}** — "You don't have enough allocation balance to gift that amount."
- **{member_not_found_copy}** — "We couldn't find that member. Check the ID and try again."
- **{idempotency_mismatch_copy}** — "Looks like that gift already went through. Refresh to confirm."
- **{rate_limit_copy}** — "You're going a bit fast. Take a breath and try again."
- **{internal_error_copy}** — "Something went wrong on our end. Reference: {request_id}."

## Interactions

- **Adjust slider/stepper:**
  - No API call. Amount bounded to `[1, allocation_balance]`. Live copy updates to show the points value.
- **Enter recipient member ID:**
  - No API call on input. Validation fires only on CTA tap. If the platform session context pre-fills the member, the field is editable but pre-populated.
- **Tap "Gift N points":**
  - Generate `X-Idempotency-Key` (UUID v4) on first tap; pin for lifetime of this attempt.
  - `POST /models/{modelId}/earn` with payload (modelId, memberId, amount, idempotency key, reason_code: `MODEL_GIFT`).
  - 201 → success state. 200 → idempotent replay state. Error → error state per catalog.
  - **Same idempotency key is reused on retry** unless the model taps "Start over."
- **Tap "Gift again" (post-success):**
  - Resets to Ready state. Generates a fresh idempotency key. Keeps the same recipient pre-filled.
- **Tap "Done" (post-success):**
  - Navigates back to the model's home screen (outside RRR scope).
- **Tap "Cancel":**
  - Local only. No API call. Returns to previous screen.
- **Tap "Start over" (after IDEMPOTENCY_KEY_MISMATCH):**
  - Generates a fresh idempotency key and re-fetches the model wallet balance before re-rendering.

## Accessibility notes

- The slider must have a paired number input for keyboard / screen-reader users.
- The amount control announces: `"Gift amount, {N} RRR Points, maximum {max} points"`.
- Submit-state spinner has `aria-live="polite"` and announces `"Gifting {N} points"`.
- Success state announces: `"Gifted {N} points to member. Remaining allocation, {balance} points."`.
- Errors announce via `aria-live="assertive"` (payment-adjacent surface).
- Recipient input has `autocomplete="off"` — member IDs are not browser-autocomplete targets.

## What's stubbed for v2

- **Session-context pre-fill of recipient** — the member ID is pre-filled when the gifting panel is launched from within a live session; this cross-stack binding is not yet fully specified. [v2 stub]
- **Gift reason selector** — models can currently gift with reason `MODEL_GIFT` only; a richer reason/event selector is v2. [v2 stub]
- **Gifting limits / daily cap** — the creator-gifting-panel rules may include per-day maximums; for Alpha the server enforces them and surfaces `EARN_NOT_ALLOWED` if breached. No proactive cap indicator in the UI for Alpha. [v2 stub]
- **Model-to-model gifting** — not in scope. One-way model → member only. [v2 stub]
