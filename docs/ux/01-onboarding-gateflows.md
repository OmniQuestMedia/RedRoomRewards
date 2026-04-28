# 01-onboarding — GateGuard + Step-Up Auth Flow

**Role:** Guest → Member / Model / Operator (all stacks)
**Purpose:** Mandatory age/ID verification and step-up authentication gate for account onboarding and elevated actions (large purchase, Cyrano top-up, admin adjustment).
**Status:** draft

**Presenter / Binding:** `GateGuardAVService` (AV contract) + `StepUpAuthModal` (shared overlay component)

---

## API binding

- `POST /members` — new-account path; the `GateGuardAVService.verifyAccount()` call is mandatory before any wallet record is created. A `GateGuardAVResult` with `verified: false` hard-blocks account creation.
- `GET /wallets/{userId}/balance` — pre-flight read issued after a successful step-up to resume the blocked flow and render current state.
- `POST /earn`, `POST /redeem`, `POST /admin/adjustments` — any state-changing call that triggers a step-up challenge; the original payload is held in memory and replayed on grant using the same `X-Idempotency-Key`.
- (Indirect) Keycloak/JWT step-up scope — the modal requests an elevated token claim (`step_up_verified: true`) from the Keycloak realm after MFA/biometric succeeds; that claim gates the re-submitted action server-side.
- (Indirect) `WelfareGuardianScoreService.scoreTransaction()` — determines the Welfare Guardian band badge colour and whether a SOFT_DECLINE or HARD_DECLINE is in effect before the challenge is even issued.

> **Note:** There is no standalone REST endpoint for step-up AV. The gate is enforced at the service layer (`member.service.ts`, `redroom-ledger.service.ts`, and the shared `GateGuardAVService`). The modal is a client-side orchestrator that calls existing auth and ledger endpoints.

---

## States

- **Idle (not triggered):** modal is not mounted; the originating screen renders normally.
- **Challenge issued:** the modal mounts as a full-screen overlay. The progress stepper is at step 1. Biometric / document upload or MFA code input renders based on the challenge type returned by the Keycloak step-up flow.
  - Challenge types: `MFA_CODE` (TOTP/SMS), `DOCUMENT_LIVENESS` (selfie + ID upload), `YOTI` (Yoti eIDAS), `GATEGUARD` (GateGuard Sentinel™ AV).
- **Awaiting input:** the user is completing the challenge. CTAs: `[ Continue ]` (disabled until input is valid) and `[ Cancel ]`.
- **Submitting:** Continue CTA shows a spinner; all inputs disabled. The `X-Idempotency-Key` for the original action is already pinned.
- **Grant:** step-up succeeded (`verified: true`, `confidenceScore` ≥ threshold). Modal closes with a success toast. The original action is replayed automatically.
- **Deny (soft):** verification failed but retries are permitted. Inline error with `{av_retry_copy}`. Stepper resets to step 1. Retry count tracked client-side (max 3).
- **Deny (hard / HARD_DECLINE):** Welfare Guardian Score returned `HARD_DECLINE` or maximum retries exhausted. Modal remains open in a locked state showing `{av_hard_deny_copy}`. No retry CTA. Support link surfacing `X-Request-ID`.
- **Cancel:** user taps Cancel. Modal closes. Original action is abandoned. No API call.
- **Error states:**
  - `AUTH_INVALID` → modal shows `{session_expired_copy}` with a "Sign in again" CTA. Original action is abandoned.
  - `RATE_LIMITED` → inline banner with `{rate_limit_copy}` and retry-after countdown.
  - `INTERNAL_ERROR` → inline banner with `{internal_error_copy}` quoting `X-Request-ID`.

---

## State machine

```
  [original action blocked]
           │
           ▼
   challenge issued
           │
    ┌──────┴──────────────┐
    │                     │
  MFA / TOTP           Biometric /
  code input           document upload
    │                     │
    └──────┬──────────────┘
           │
           ▼
      [submit to Keycloak step-up]
           │
     ┌─────┴──────────┐
     │                │
   GRANT            DENY
     │                │
     ▼                ├─── soft (retry ≤ 3) ──▶ challenge issued
  audit entry         │
  (reason_code:       └─── hard / max retries ─▶ locked deny state
   STEP_UP_GRANTED)         (reason_code:
                             STEP_UP_DENIED)
     │
     ▼
  resume original flow
  (idempotent replay of
   blocked action)
```

---

## Layout intent

Full-screen overlay — dark base (`#0A0A0A`) with red accent on CRITICAL Welfare Guardian tier. The overlay sits above all page content; underlying content is blurred/dimmed and non-interactive.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  [X — Cancel]                                  [logo]   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Identity Verification Required                    │  │
│  │                                                    │  │
│  │  ●────────○────────○                               │  │
│  │  Step 1   Step 2   Step 3                          │  │
│  │                                                    │  │
│  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  │
│  │                                                    │  │
│  │  [Document upload area / selfie capture]           │  │
│  │     — or —                                         │  │
│  │  [MFA code input: _ _ _ _ _ _]                    │  │
│  │                                                    │  │
│  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  │
│  │                                                    │  │
│  │  [Welfare Guardian band badge]                     │  │
│  │  {wgs_band_label}  ● LOW / MEDIUM / HIGH / CRITICAL│  │
│  │                                                    │  │
│  │  {bill_149_prefix}   ← shown only if AI content    │  │
│  │  follows this gate                                 │  │
│  │                                                    │  │
│  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  │
│  │                                                    │  │
│  │  [ Continue ]          [ Cancel ]                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Welfare Guardian band badge colour mapping:**

| `welfareTier` | Band colour   | Accent effect          |
| ------------- | ------------- | ---------------------- |
| `LOW`         | Green         | None                   |
| `MEDIUM`      | Amber         | None                   |
| `HIGH`        | Orange        | Subtle pulse           |
| `CRITICAL`    | Red           | Dark-red overlay tint on entire modal border |

**Bill 149 compliance prefix** — rendered as a fixed informational strip above the footer CTAs when the gated action leads into AI-generated content. Copy: `{bill_149_prefix}` (editorial slot — must not be hardcoded).

---

## Copy slots

- **{modal_header}** — "Identity Verification Required"
- **{stepper_label_1}** — "Verify identity"
- **{stepper_label_2}** — "Confirm action"
- **{stepper_label_3}** — "Complete"
- **{mfa_helper}** — "Enter the 6-digit code from your authenticator app or SMS."
- **{document_helper}** — "Upload a government-issued photo ID and take a selfie to confirm your identity."
- **{wgs_band_label}** — "Welfare check: {welfareTier}" (tier injected at runtime from `WgsScoreResponse.welfareTier`)
- **{bill_149_prefix}** — "The following content is AI-assisted. By continuing you confirm you have read and consent to our AI Disclosure Policy." (shown only when the gated flow leads to AI content)
- **{continue_cta}** — "Continue"
- **{cancel_cta}** — "Cancel"
- **{av_retry_copy}** — "We couldn't verify your identity. Please try again. {retry_count} attempt(s) remaining."
- **{av_hard_deny_copy}** — "We were unable to complete verification. Please contact support. Reference: {request_id}."
- **{session_expired_copy}** — "Your session has expired. Sign in again to continue."
- **{grant_toast}** — "Verified. Continuing…"
- **{rate_limit_copy}** — "You're going a bit fast. Take a breath and try again."
- **{internal_error_copy}** — "Something went wrong on our end. Reference: {request_id}."

---

## Interactions

- **High-value action triggers the gate:**
  - Triggers: large purchase above merchant-configured threshold, Cyrano top-up, `POST /admin/adjustments` (Operator role).
  - On trigger: the calling screen pauses its flow, pins the original `X-Idempotency-Key`, and mounts `StepUpAuthModal`.
  - No API call fires until the gate either grants or the user cancels.

- **Tap "Continue" (MFA code path):**
  - Validates that the 6-digit input is exactly 6 numeric characters client-side before enabling the CTA.
  - Submits the MFA code to the Keycloak step-up endpoint.
  - On grant: write audit entry (reason_code: `STEP_UP_GRANTED`), close modal, fire success toast, replay original action with pinned `X-Idempotency-Key`.
  - On deny (soft): write audit entry (reason_code: `STEP_UP_DENIED`), decrement retry count, reset stepper to step 1, show `{av_retry_copy}`.
  - On deny (hard / max retries): write audit entry (reason_code: `STEP_UP_DENIED`), lock modal in hard-deny state, show `{av_hard_deny_copy}`.

- **Tap "Continue" (document/biometric path):**
  - Same flow as MFA code path. The document upload / selfie capture panel feeds into `GateGuardAVService.verifyAccount()` via the Keycloak step-up broker.
  - `GateGuardAVResult.verified === false` → same deny handling as above.
  - `GateGuardAVResult.confidenceScore` below threshold → treated as soft deny (allow retry). Threshold is service-configured; UI does not hard-code it.

- **Tap "Cancel":**
  - Local only. No API call. Modal unmounts. Original action is abandoned. The originating screen resumes in its pre-action state (balance re-fetched if stale).

- **Stepper navigation:**
  - Steps are linear and forward-only. The user cannot skip steps or go back while a challenge is in progress.
  - The stepper advances automatically when a step completes successfully.

---

## Accessibility notes

- The modal is a true dialog (`role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the header).
- Focus is trapped inside the modal while it is open. On close, focus returns to the element that triggered the gate.
- The progress stepper announces as `"Step {N} of 3: {stepper_label}"` on focus and on advance.
- The Welfare Guardian band badge announces as `"Welfare check: {welfareTier} risk"` — colour alone is not the only signal.
- The Bill 149 prefix strip is in the natural focus order; screen readers must read it before the footer CTAs.
- MFA code input: each character cell has `aria-label="Digit {N}"`. The group has `aria-describedby` pointing at `{mfa_helper}`.
- Error states announce via `aria-live="assertive"` — this is a security/auth surface and interruption is appropriate.
- Cancel CTA uses `aria-label="Cancel identity verification"` to distinguish it from other Cancel buttons that may exist in the stacked UI.
- CRITICAL tier: the red overlay tint must not be the sole differentiator — the band badge label must also read "CRITICAL" in text.

---

## What's stubbed for v2

- **YOTI / eIDAS integration** — `GateGuardAVResult.method === 'YOTI'` is defined in the interface but the service stub always returns `'GATEGUARD'`. The document/selfie panel renders regardless; the broker routing to Yoti is a v2 deliverable. `[v2 stub]`
- **Retry count persistence across sessions** — Alpha tracks retries in client memory only. A refresh resets the counter. Server-side retry tracking (to prevent session-cycling abuse) is a v2 hardening item. `[v2 stub]`
- **Bill 149 AI Disclosure Policy link** — the copy slot is wired but the destination policy page does not exist for Alpha. The strip renders with placeholder text. `[v2 stub]`
- **Keycloak step-up scope claim** (`step_up_verified: true`) — the Keycloak realm config is a post-Alpha deliverable. For Alpha, the gate is enforced at the service layer only (`GateGuardAVService`); the JWT claim is not yet issued or validated by the API. `[v2 stub]`
- **`WelfareGuardianScoreService` pre-check before challenge issue** — the WGS call (to determine whether to PASS / REVIEW / decline before even showing the modal) is architecturally wired but not invoked at the UX layer for Alpha. Alpha shows LOW band badge by default. `[v2 stub]`
