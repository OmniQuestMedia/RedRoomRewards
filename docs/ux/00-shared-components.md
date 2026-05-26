# 00 — Shared / Cross-Stack Components

**Role:** All (Member, Model, Merchant Admin, OQMI Operator) **Purpose:**
Reusable primitives for consistency across RRR, Cyrano, and ChatNow.Zone — bind
once to the API surface; skin per-platform. **Status:** reviewed

---

## Component inventory

### TierBadge

**Props:** `tierName`, `capPercent`, `isDiamondConcierge`

Renders the member's current `merchant_tier` alongside the tier's redemption
cap. When `isDiamondConcierge` is `true`, the earn affordance is suppressed
entirely (CEO D3) and the badge renders a concierge indicator instead of an earn
CTA.

**API / Presenter binding:**

- `merchant_tier` claim from the caller's Keycloak-issued JWT — read once on
  session load; do not re-fetch on every render.
- `GET /wallets/{userId}/balance` — the response includes the effective
  `capPercent` derived from `TierCapConfig`; read from there, never hardcode.

**States:**

- **Loading:** outline-only badge at target size; no tier label visible.
- **Standard tier (GUEST → PLATINUM):** renders `{tier} · {cap}%` with the
  redemption cap.
- **Diamond Concierge:** renders the concierge label; hides any earn prompt;
  redemption CTA may still appear if `available > 0`.
- **Unknown / error:** badge omitted entirely; parent screen falls back to its
  own error state.

---

### WalletBuckets / EscrowView

A three-bucket balance presentation:

| Bucket    | Label                  | Source field           |
| --------- | ---------------------- | ---------------------- |
| Available | "Available to redeem"  | `balance.available`    |
| Escrow    | "Held in escrow"       | `balance.escrow_total` |
| Pending   | "Pending confirmation" | `balance.pending`      |

For RRR, all three buckets are present. For Cyrano / ChatNow.Zone surfaces that
embed RRR balance, only the **Available** bucket is required; Escrow and Pending
are surfaced only when `> 0`.

**API / Presenter binding:**

- `GET /wallets/{userId}/balance` — primary source for all three buckets.
- `GET /wallets/{userId}/escrow` — individual hold records for the EscrowView
  expand panel; lazy-loaded on user action, not on screen load.

**States:**

- **Loading:** shimmer at the full bucket height.
- **All-zero:** shows "0 RRR Points" across available bucket; escrow and pending
  buckets hidden.
- **Active escrow:** escrow bucket shown with an expand control (▸ See holds).
  Expanding reveals individual `EscrowItem` rows without a new network call.
- **Error:** inline error banner per bucket; other buckets continue to render.

---

### ComplianceOverlay

A single overlay component covering four distinct compliance triggers. The
trigger type is set by the caller; the component adapts its copy and controls
accordingly.

| Trigger            | When fired                                                                        | Dismissible                  |
| ------------------ | --------------------------------------------------------------------------------- | ---------------------------- |
| `BILL_149`         | Ontario consumer-protection disclosure required before a qualifying purchase      | No — must acknowledge        |
| `GATE_GUARD`       | Age-verification or content-gate check not yet satisfied for this session         | No — must complete           |
| `WELFARE_GUARDIAN` | Responsible-spending band threshold reached (`welfareGuardian.band`)              | Soft — can defer once        |
| `STEP_UP`          | High-value action requires step-up MFA before proceeding (see Interactions below) | No — must complete or cancel |

**API / Presenter binding:**

- Triggers are delivered by the backend in API error responses or in a dedicated
  compliance-status field. The overlay renders on receipt; it does not poll.
- `STEP_UP` challenge sequence: see Interactions → StepUpModal below.
- `WELFARE_GUARDIAN` band value: read from `welfareGuardian.band` in the wallet
  or session context response. [v2 stub — endpoint TBD pending compliance spec]
- `BILL_149` acknowledgement: `POST` to the acknowledgement endpoint defined in
  the compliance spec. [v2 stub — endpoint TBD]
- `GATE_GUARD` completion: delegates to the identity-verification flow outside
  RRR scope. [v2 stub — Keycloak step-up or external AV gate]

**States:**

- **Inactive:** component renders nothing; takes no space.
- **Active (any trigger):** full-screen modal, no background interaction.
  Accessible focus trap applied.
- **Processing (STEP_UP):** spinner within the modal; all controls disabled
  until grant or deny received.
- **Granted (STEP_UP):** modal closes; original action proceeds.
- **Denied (STEP_UP):** modal shows denial copy; original action is cancelled;
  audit entry written.

---

### AuditRow

A single-row presenter for a `LedgerEntry`. Used in activity feeds,
transaction-history lists, and the manual-adjustment audit trail.

**Props (minimum):** `ledgerEntryId`, `type`, `amount`, `direction`,
`reasonCode`, `timestamp`, `correlationId`

**API / Presenter binding:**

- `GET /ledger/transactions` (paginated list) — supplies enough fields to render
  the row without a secondary call.
- `GET /ledger/transactions/{id}` — supplies full audit detail on tap-through.
- `GET /admin/transactions/{id}/audit` — supplies the full audit chain for
  admin-role tap-through.

**States:**

- **Collapsed (default):** shows
  `{timestamp}  {type}  {direction}{amount} pts  {reasonCode}`.
- **Expanded (tap):** reveals `correlationId`, full `reason_code` label,
  before/after balance, and the requesting `X-Request-ID`.
- **Error on expand:** inline error with retry; collapsed state persists.

---

## Layout intent (mobile-first)

The following is the canonical host-screen layout that embeds these shared
components. Individual screens may omit sections not relevant to their role, but
must not reorder them.

```
┌─────────────────────────────────────┐
│  [TierBadge]  [FFS/Inferno meter]  │  ← header; Inferno meter only when active
├─────────────────────────────────────┤
│  [WalletBuckets / Balance panel]    │
├─────────────────────────────────────┤
│                                     │
│  [Main content — screen-specific]   │
│                                     │
├─────────────────────────────────────┤
│  [Compliance banner — inline, low   │  ← soft warnings (e.g. Welfare Guardian defer)
│   severity only]                    │
└─────────────────────────────────────┘
│  [Bottom nav or FAB — primary CTA]  │
└─────────────────────────────────────┘

         ╔═══════════════════════════╗
         ║  ComplianceOverlay        ║  ← full-screen modal, above all content,
         ║  (full-screen modal when  ║     when BILL_149 / GATE_GUARD / STEP_UP
         ║   triggered)              ║     fires; not dismissible without action
         ╚═══════════════════════════╝
```

**Inferno meter:** visible only when `inferno_multiplier` is active on the
current `EarnRateConfig`. Read the multiplier value from the earn-rate response;
never hardcode a default (CEO B1 / D4). When inactive, the header row shrinks to
TierBadge only.

**FFS meter:** the "Fan Funding Session" heat indicator for ChatNow.Zone /
Cyrano sessions. Rendered alongside the Inferno meter when the session is in
high-heat state. Feeds the Diamond Concierge handoff trigger (see Interactions).
Sourced from the platform session context, not from the RRR API. [v2 stub —
cross-stack session binding TBD]

---

## Interactions

### High-value action → StepUpModal

Any action classified as "high-value" (configurable per merchant; examples:
large redemptions, manual adjustments, model gifting above threshold) must pass
through the StepUpModal sequence before the underlying API call fires.

```
User initiates high-value action
         │
         ▼
   ComplianceOverlay (trigger: STEP_UP) opens
         │
         ▼
   Challenge presented (e.g. PIN / TOTP prompt)
         │
         ├─▶ MFA verification submitted
         │         │
         │         ├─▶ GRANTED → modal closes → original API call fires
         │         │             → audit entry written (reason_code: STEP_UP_GRANTED)
         │         │
         │         └─▶ DENIED  → modal shows denial copy → action cancelled
         │                       → audit entry written (reason_code: STEP_UP_DENIED)
         │
         └─▶ User cancels → modal closes → action cancelled (no audit entry)
```

The `X-Idempotency-Key` for the underlying action is generated **after** grant,
not before. This ensures a cancelled step-up does not consume an idempotency
key.

### FFS high-heat → Diamond Concierge handoff offer

When the FFS meter enters "high-heat" state and the current member is not
already on Diamond Concierge tier, the UI may surface a Diamond Concierge
handoff offer. This is a soft nudge, not a ComplianceOverlay trigger.

- The offer links to the CNZ or Cyrano upgrade path — outside RRR scope.
- RRR does not fire any API call on tap; the external platform handles the
  upgrade.
- If the member completes the upgrade, the next RRR session will reflect
  `isDiamondConcierge: true` in the JWT claim.

---

## Copy slots

- **{tier}** — canonical tier label, e.g. `GOLD`. Must match the tier name in
  `TierCapConfig`; no editorial substitution.
- **{cap}%** — redemption cap percentage for the member's current tier, read
  from `TierCapConfig`. Never hardcoded.
- **Inferno ×{multiplier}** — e.g. `Inferno ×2`. Shown only when
  `inferno_multiplier` is active. Value sourced from
  `EarnRateConfig.inferno_multiplier`.
- **Welfare Guardian: {band}** — e.g. `Welfare Guardian: AMBER`. Band value
  sourced from `welfareGuardian.band`. [v2 stub]
- **{bill_149_disclosure}** — full disclosure text mandated by Ontario Bill 149.
  Editorial must supply exact regulated copy; placeholder only here.
- **{gate_guard_prompt}** — age/content verification prompt. Editorial + legal
  must approve exact copy.
- **{step_up_challenge_label}** — e.g. `"Confirm your identity to continue"`.
- **{step_up_denied_copy}** —
  `"We couldn't verify your identity. This action has been cancelled."`
  (editorial may adjust).
- **{welfare_guardian_defer_copy}** —
  `"You can continue now, but we'll check in again soon."` [v2 stub]
- **{diamond_concierge_handoff_label}** — e.g. `"Upgrade to Diamond Concierge"`.
  Platform editorial owns final copy.

---

## Accessibility notes

- **ComplianceOverlay:** must trap focus within the modal while active.
  Background content must be `aria-hidden="true"`. The modal heading announces
  immediately on open via `aria-live="assertive"`.
- **TierBadge:** must be in the focus order; screen readers announce
  `"{tier} tier, up to {cap}% redemption"`. When `isDiamondConcierge`, announce
  `"Diamond Concierge — no points earned on this transaction"`.
- **WalletBuckets:** each bucket is a labelled region. The escrow expand control
  announces `"N RRR Points held in escrow, expandable"` when collapsed.
- **AuditRow:** collapsed row announces type, amount, direction, and reason code
  as a complete sentence. Expanded state announces as a description list.
- **Inferno meter:** if rendered as a visual indicator, a text alternative must
  be present — e.g. `aria-label="Room-Heat Inferno active, ×{multiplier}"`.
- **StepUpModal (within ComplianceOverlay):** the MFA input must be
  keyboard-operable. Submit button announces result via `aria-live="polite"` on
  grant; `aria-live="assertive"` on deny (payment-adjacent surface rule from
  UX_INTEGRATION_BRIEF §10).

---

## What's stubbed for v2

- **`WELFARE_GUARDIAN` trigger and band value** — architecture is defined; API
  endpoint binding is pending compliance spec sign-off. Overlay renders from
  static copy for Alpha. [v2 stub]
- **`BILL_149` acknowledgement endpoint** — compliance spec is in progress;
  acknowledgement POST target TBD. [v2 stub]
- **`GATE_GUARD` flow** — delegates to Keycloak step-up or external AV gate;
  cross-stack binding not yet specified. [v2 stub]
- **FFS meter (ChatNow.Zone / Cyrano session heat)** — session-context binding
  across stacks is not yet defined. The component placeholder is reserved in the
  header layout. [v2 stub]
- **Diamond Concierge handoff offer** — the upgrade path is owned by CNZ /
  Cyrano; RRR provides only the trigger condition (`isDiamondConcierge: false` +
  high-heat). [v2 stub]
- **`welfareGuardian.band`** — field is reserved on the wallet/session response
  but not yet populated. [v2 stub]
