# 07 — Merchant Admin Awarding Wallet

**Role:** Merchant Admin / OQMI Operator **Purpose:** Give a merchant admin or
OQMI operator a dedicated console to award points to members — including bulk
CSV upload and single-member manual award — with full idempotency, GateGuard AV
enforcement, and an immutable audit trail. **Status:** draft

## API binding

- `POST /earn` — single-member award. Triggers earn-rate calc + tier-cap checks.
  Requires `X-Idempotency-Key`. Diamond Concierge members receive zero points
  per CEO D3; the API returns `EARN_NOT_ALLOWED`.
- `POST /admin/wallets/award-csv` — bulk CSV upload endpoint (see
  `docs/AWARDING_WALLET_AV.md`). Processes awards asynchronously; returns a
  batch job reference ID.
- `GET /admin/wallets/award-csv/{jobId}` — poll for batch job status and per-row
  results.
- `GET /admin/transactions/{id}/audit` — audit-chain tap-through for any row in
  the award history.
- `GET /ledger/transactions?tenant_id=...&type=EARN` — recent award history
  feed, scoped to caller's `tenant_id`.
- (Indirect) GateGuard AV — mandatory on every new account before a first award
  fires; enforced server-side. UI reflects the gate status from the session
  context.

## States

- **Loading:** shimmer for the award form and recent-history list.
- **Ready — single award:** form shows member ID field, points amount field,
  reason code selector, and `[ Award ]` CTA. History feed shows recent earn
  entries.
- **Ready — CSV upload:** file-picker and upload CTA shown; batch status panel
  hidden until a job is in flight.
- **Submitting (single):** CTA becomes a spinner; all form controls disabled.
  `X-Idempotency-Key` pinned for retries.
- **Submitting (CSV):** upload progress bar; rows accepted / rejected count
  updates as the job progresses.
- **Success (single, 201 Created):** inline confirmation row appears at top of
  history feed. Form resets, fresh idempotency key generated.
- **Success (single, 200 OK — idempotent replay):** same inline confirmation
  with `{replay_helper}` indicator.
- **Batch complete:** summary banner showing total rows processed, accepted,
  rejected. Rejected rows downloadable as a corrected CSV template.
- **Error states:**
  - `EARN_NOT_ALLOWED` → inline error below the member field:
    `{earn_not_allowed_copy}`.
  - `WALLET_NOT_FOUND` → inline error with `{wallet_missing_copy}`.
  - `VALIDATION_ERROR` → inline field errors per-field.
  - `IDEMPOTENCY_KEY_MISMATCH` → full-screen error with
    `{idempotency_mismatch_copy}` and "Start over" CTA.
  - `TENANT_SCOPE_VIOLATION` → full-screen error with `{tenant_violation_copy}`.
    This is a token/role bug; instruct the admin to sign out and back in.
  - `AUTH_INVALID` → redirect to sign-in.
  - `RATE_LIMITED` → top-of-form banner with `{rate_limit_copy}` and
    retry-after.
  - `INTERNAL_ERROR` → inline banner with `{internal_error_copy}` quoting
    `X-Request-ID`.
  - Per-CSV-row errors → captured in the batch result; surfaced in the
    rejected-rows download, not as individual toasts.

## Layout intent

Desktop-first (operator tool):

```
┌──────────────────────────────────────────────────────────────────────┐
│  [merchant logo + name]              [operator name + sign out]      │
├────────────────────────────────────────────────────────────────────── ┤
│  Awarding Wallet Console                                             │
│  ─────────────────────────────────────────────────────────────────── │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────┐│
│  │ Award points to a member    │  │ Bulk CSV upload                 ││
│  │                             │  │                                 ││
│  │ Member ID: [_______________]│  │ [▸ Download CSV template]       ││
│  │ Points:    [_______________]│  │                                 ││
│  │ Reason:    [ Select... ▾  ] │  │ [ Choose file ]   (no file)     ││
│  │                             │  │ [ Upload & award ]              ││
│  │ [ Award points ]            │  │                                 ││
│  │                             │  │ ┌─────────────────────────────┐ ││
│  └─────────────────────────────┘  │ │ Job abc-123: In progress    │ ││
│                                    │ │ Accepted: 142  Rejected: 3 │ ││
│                                    │ │ [ Download rejected rows ] │ ││
│                                    │ └─────────────────────────────┘ ││
│                                    └─────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────┤
│  Recent awards (last 50)                                             │
│  ─────────────────────────────────────────────────────────────────── │
│  10:42  EARN  +500 pts  member abc..123  reason: PURCHASE  [audit ▸] │
│  10:30  EARN  +200 pts  member def..456  reason: PROMOTION [audit ▸] │
│  10:15  EARN  REJECTED  member ghi..789  EARN_NOT_ALLOWED  [audit ▸] │
│  ...                                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

Mobile variant: single-column; CSV upload collapses under a "Bulk award"
accordion.

## CSV template format

The CSV upload endpoint accepts the following columns (see
`docs/AWARDING_WALLET_AV.md` for the full schema):

| Column            | Type    | Required | Notes                                           |
| ----------------- | ------- | -------- | ----------------------------------------------- |
| `member_id`       | string  | Yes      | The member's RRR user ID                        |
| `points`          | integer | Yes      | Positive integer only; server applies caps      |
| `reason_code`     | string  | Yes      | Must match a valid reason code from the catalog |
| `idempotency_key` | string  | Yes      | UUID v4, unique per row; client-generated       |
| `order_ref`       | string  | No       | Merchant order reference for traceability       |

GateGuard AV check runs per member on first award. Members who have not
completed AV are skipped and appear in the rejected rows with reason
`GATE_GUARD_INCOMPLETE`.

## Copy slots

- **{earn_not_allowed_copy}** — "This member's tier doesn't allow points to be
  earned on this transaction."
- **{wallet_missing_copy}** — "We couldn't find a loyalty wallet for that
  member. Check the ID and try again."
- **{idempotency_mismatch_copy}** — "That award may have already gone through.
  Refresh the history to confirm."
- **{tenant_violation_copy}** — "You don't have access to that record. Sign out
  and back in if this continues."
- **{rate_limit_copy}** — "You're going a bit fast. Take a breath and try
  again."
- **{internal_error_copy}** — "Something went wrong on our end. Reference:
  {request_id}."
- **{replay_helper}** — "Already on file — this award was previously recorded."
- **{batch_complete_copy}** — "{accepted} awards processed successfully.
  {rejected} rows need correction."
- **{gate_guard_skip_copy}** — "{N} members skipped: age verification not yet
  complete." (shown in batch result)

## Interactions

- **Single award — tap "Award points":**
  - Validate form locally (required fields, points > 0).
  - Generate `X-Idempotency-Key` (UUID v4) on first tap; pin for retries.
  - `POST /earn` with
    `{ memberId, points, reasonCode, tenantId, idempotency_key }`.
  - 201 → insert confirmation row at top of history feed; reset form; generate
    fresh key.
  - 200 → insert confirmation row with `{replay_helper}`; reset form.
  - Error → error state per catalog.
- **Retry single award:**
  - Reuse the same `X-Idempotency-Key`. Do not generate a new key on retry.
- **Start over (after IDEMPOTENCY_KEY_MISMATCH):**
  - Generate a fresh key. Re-fetch recent history before re-enabling the form.
- **CSV upload — choose file:**
  - Standard file picker; client validates extension (`.csv` only) before
    enabling the upload CTA.
- **CSV upload — "Upload & award":**
  - `POST /admin/wallets/award-csv` with the file as `multipart/form-data`.
  - On job accepted (202): display the batch status panel with the returned
    `jobId`.
  - Poll `GET /admin/wallets/award-csv/{jobId}` every 5 seconds until status is
    `COMPLETE` or `FAILED`.
- **Download CSV template:**
  - Static download of the template file; no API call.
- **Download rejected rows:**
  - Available once the batch job reaches `COMPLETE`. Server returns a pre-signed
    URL or streams the file. `X-Request-ID` is embedded in the filename for
    support.
- **Tap "audit ▸" on a history row:**
  - Navigates to the full audit chain via `GET /admin/transactions/{id}/audit`.
    Renders the audit chain inline or in a side panel (desktop). Mobile: new
    screen.

## Accessibility notes

- Reason code selector must be a `<select>` element with explicit `<label>`;
  never a styled `<div>` click-trap.
- Points input: type `number`; min=1; announces as
  `"Points to award, required, minimum 1"`.
- Upload area: must support keyboard activation (`Enter` / `Space` on the
  "Choose file" button); not only drag-and-drop.
- Batch status panel uses `aria-live="polite"` so updated counts announce
  without interrupting the operator.
- Each history row announces:
  `"Awarded {N} RRR Points to member on {date}, reason {reason}."` Rejected rows
  announce the rejection reason.
- Audit tap-through links are real `<a>` elements — not click-handler `<div>`s.

## What's stubbed for v2

- **GateGuard AV status indicator** — the UI reflects skipped rows in batch
  results but does not proactively surface which members in the tenant have
  incomplete AV. A member-list view with AV status is v2. [v2 stub]
- **Scheduled / recurring awards** — bulk CSV is one-shot for Alpha; scheduled
  recurring awards are v2. [v2 stub]
- **Webhook callback on batch complete** — the operator currently polls;
  server-push notification is v2. [v2 stub]
- **Promotional Bonus bucket** — the awarding wallet can credit the Promotional
  Bonus bucket (see `docs/AWARDING_WALLET_AV.md`); the UI form does not yet
  expose a bucket selector. Alpha defaults to standard earn. [v2 stub]
- **OQMI cross-tenant view** — OQMI Operators can award across tenants; the
  cross-tenant version of this screen with a tenant picker is v2. [v2 stub]
