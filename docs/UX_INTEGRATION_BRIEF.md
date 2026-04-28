# UX INTEGRATION BRIEF — RedRoomRewards (Alpha)

**Audience:** front-end designers / wireframe authors / Grok-driven design work, and any creative agency skinning the eventual UI.

**Purpose:** describe the live API surface, user roles, state machines, error model, and Alpha-scope rules tightly enough that a designer can build wireframes that bind cleanly to the real backend without guesswork.

**Authority:** this document defers to `docs/DOMAIN_GLOSSARY.md` (canonical naming) and `api/openapi.yaml` (contract). On any conflict, those win.

**Status:** Alpha-ready. Wireframe specs 00–07 are complete and linked from `docs/ux/README.md`. Surface is locked for the duration of Alpha test except for security fixes. Changes require a CHORE/API ticket.

---

## 1. The product, in one paragraph

RedRoomRewards (RRR) is a backend loyalty engine. Members earn `RRR Points` from qualifying actions on connected merchants (RedRoomPleasures, Cyrano in Phase 1; ChatNow.Zone in Phase 2), redeem points for discounts within the merchant tier caps, and can have points held in escrow during performance/queue workflows. Models can receive non-redeemable allocations they then gift to members. RRR is not a chat app, not a streaming platform, and does not directly issue user identities for Alpha — identity is delegated to a Keycloak realm (single realm, tenant-scoped claims).

---

## 2. User roles

The UI surface needs to cover four roles. Wireframes should be authored per role, not per page.

| Role               | Who they are                                                | Auth                                                                          | Sees                                                                                       |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Member**         | A consumer enrolled in the loyalty program at a merchant    | Keycloak-issued JWT via merchant SSO                                          | Own balance, own ledger history, redeem flow, tier badge, expiration warnings              |
| **Model**          | A content creator on a connected platform                   | Keycloak-issued JWT, model role claim                                         | Own model-allocation balance, gift-to-member flow, gifting history                         |
| **Merchant Admin** | Per-tenant operator at RedRoomPleasures or Cyrano           | Keycloak-issued JWT, merchant-admin role claim, scoped to their `tenant_id`   | All wallets within their tenant, awarding-wallet console, reporting, redemption oversight |
| **OQMI Operator**  | OmniQuest Media internal staff (RRR Account Rep equivalent) | Keycloak-issued JWT, OQMI role claim, cross-tenant                            | Cross-tenant view, manual adjustments, refunds, expiration ops, audit trail                |

Keycloak role names are TBD; lock them when the realm config is authored. Until then, wireframes should label role-gated UI as `[role: Member]`, `[role: Merchant Admin]`, etc.

---

## 3. Endpoint inventory by role

The full contract is in `api/openapi.yaml`. Below is the role-binding view a designer needs.

### Member

| Action               | Endpoint                              | Notes                                          |
| -------------------- | ------------------------------------- | ---------------------------------------------- |
| View balance         | `GET /wallets/{userId}/balance`       | Returns available + escrow + pending breakdown |
| View transaction log | `GET /ledger/transactions`            | Filterable by date range; paginated            |
| View one transaction | `GET /ledger/transactions/{id}`       | Full audit detail                              |
| Redeem points        | `POST /redeem`                        | Tier-cap-validated; idempotent                 |
| View own escrows     | `GET /wallets/{userId}/escrow`        | Active holds visible to member                 |

### Model

| Action               | Endpoint                              | Notes                                          |
| -------------------- | ------------------------------------- | ---------------------------------------------- |
| View own allocation  | `GET /models/{modelId}/wallet`        | Non-redeemable balance                         |
| Gift to member       | `POST /models/{modelId}/earn` (gift) | Subject to creator-gifting-panel rules         |

### Merchant Admin

| Action                   | Endpoint                                       | Notes                                       |
| ------------------------ | ---------------------------------------------- | ------------------------------------------- |
| List wallets in tenant   | `GET /admin/wallets`                           | Scoped to caller's `tenant_id`              |
| Award points             | `POST /earn`                                   | Triggers earn-rate calc + tier-cap checks   |
| Refund                   | `POST /admin/refunds`                          | Compensating ledger entry                   |
| Manual adjustment        | `POST /admin/adjustments`                      | Audited; `reason_code` required             |
| Audit trail              | `GET /admin/transactions/{id}/audit`           | Full chain                                  |
| Reports                  | `reporting.controller.ts` endpoints            | Liability, expiration warnings, tier mix    |

### OQMI Operator

All Merchant Admin endpoints, cross-tenant; plus expiration-process endpoints under `/admin/expiration/*` and AwardingWallet console.

### Webhooks (no UI — for backend-to-backend integrators only)

| Direction | Path                              | Auth                                |
| --------- | --------------------------------- | ----------------------------------- |
| Inbound   | `POST /webhooks/external/award`   | HMAC-SHA256 in handler (not Bearer) |
| Outbound  | (emit to merchant-registered URL) | HMAC-signed payload                 |

See `docs/AUTH_CONTRACT.md` for HMAC envelope spec.

---

## 4. State machines the UI must reflect

### 4.1 Escrow lifecycle

```
            ┌──────────┐
   hold     │          │   settle    ┌──────────┐
  ────────▶ │ HELD     │ ──────────▶ │ SETTLED  │  (terminal)
            │          │             └──────────┘
            │          │
            │          │   refund    ┌──────────┐
            │          │ ──────────▶ │ REFUNDED │  (terminal)
            │          │             └──────────┘
            │          │
            │          │   partial   ┌──────────┐
            │          │ ──────────▶ │ PARTIAL  │  (terminal — splits to settled + refunded)
            └──────────┘             └──────────┘
```

UI implications:
- A held escrow shows the user the held amount and what action it's awaiting.
- A settled escrow shows the destination (model) and settled amount.
- A refunded escrow shows the refund reason.
- A partial-settled escrow shows both the settled and refunded amounts side-by-side.
- Once an escrow is in any terminal state it never moves again — no "undo" UI.

### 4.2 Redemption lifecycle

```
  validate tier cap  ─▶  validate balance  ─▶  apply redemption  ─▶  ledger entry
        │                    │                       │
        ▼                    ▼                       ▼
   [REJECT: cap]       [REJECT: balance]    [SUCCESS or IDEMPOTENT_REPLAY]
```

Idempotent replay: if the UI re-submits the same `X-Idempotency-Key` with an identical payload, it gets the original response (200 OK, not 201). If the key is the same but the payload differs, the API returns an error (see error code catalog) — the UI should treat that as "you already redeemed; refresh to see current state."

### 4.3 Earn lifecycle

Similar shape to redemption, but with earn-rate calculation up front: query active `EarnRateConfig` by tenant/merchant/tier/event, apply `base_points_per_unit * inferno_multiplier * amount`, enforce CEO D3 zero-earn for Diamond Concierge.

---

## 5. Tier rules (CEO B5 — locked)

Redemption caps are tier-driven. The UI should always show the tier badge alongside any redeem affordance so the user knows their cap.

| Tier      | Redemption cap (% of order value) |
| --------- | --------------------------------- |
| PLATINUM  | 50                                |
| GOLD      | 35                                |
| SILVER    | 20                                |
| MEMBER    | 10                                |
| GUEST     | 5                                 |

Hard rules the UI must respect:
- **Diamond Concierge** members earn zero points (CEO D3). UI shows their balance but never shows an "earn" affordance for Diamond Concierge tier members.
- **Inferno multiplier** has no platform default (CEO D4 / B1). When it's active, UI may surface "2× Room-Heat Inferno" or similar, but never assume a default value.
- **No platform default redemption cap** (CEO B5). Always read from `TierCapConfig`.

---

## 6. Idempotency + rate-limit envelope (UI contract)

### 6.1 Idempotency

Every state-changing POST takes `X-Idempotency-Key`. The UI must:
- Generate a UUID v4 per user-initiated action (not per retry).
- Send the same key on every retry of the same action.
- Treat 200 OK as "idempotent replay, original side-effect already happened" and 201 Created as "new side effect."
- Surface the `X-Request-ID` from the response so users can quote it to support.

### 6.2 Rate limits

| Endpoint                | Default                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| Signup                  | 5 / minute / IP (RISK-002)                                               |
| All other public routes | 100 / minute / IP (configurable via `RATE_LIMIT_PER_MINUTE`)             |

On 429 the UI must:
- Surface a friendly "you're going too fast — try again in a moment" copy slot.
- Honour the `Retry-After` header if present.
- Never silently retry on the user's behalf for state-changing operations.

---

## 7. Error code catalog (Alpha v1 draft)

The UI maps these to user-facing copy. Codes are stable; copy is editorial.

| HTTP | Code                           | Meaning                                                        | Suggested user copy slot                                                       |
| ---- | ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 400  | `VALIDATION_ERROR`             | Request shape invalid                                          | "Something about that request looked off. Please try again."                   |
| 400  | `IDEMPOTENCY_KEY_MISMATCH`     | Same key, different payload                                    | "Looks like that action already went through. Refresh to see your balance."   |
| 401  | `AUTH_REQUIRED`                | No or malformed bearer token                                   | "Please sign in to continue."                                                  |
| 401  | `AUTH_INVALID`                 | Token expired / signature failed                                | "Your session has expired. Sign in again to continue."                         |
| 403  | `TENANT_SCOPE_VIOLATION`       | Token tenant doesn't match resource tenant                     | "You don't have access to that record."                                        |
| 403  | `TIER_CAP_EXCEEDED`            | Redemption above the user's tier cap                            | "Your tier lets you redeem up to N% of this order."                            |
| 403  | `INSUFFICIENT_BALANCE`         | Not enough points                                               | "You don't have enough points for this redemption yet."                        |
| 404  | `WALLET_NOT_FOUND`             | Member has no wallet record                                     | "We couldn't find your loyalty wallet. Contact support."                       |
| 404  | `ESCROW_NOT_FOUND`             | Escrow id doesn't exist or isn't yours                          | "That hold isn't available anymore."                                           |
| 409  | `ESCROW_ALREADY_TERMINAL`      | Trying to settle/refund an escrow already in terminal state     | "That hold has already been resolved."                                         |
| 409  | `RECON_MISMATCH`               | Internal reconciliation flagged a mismatch (op blocked)         | "We've paused this for a safety check. Try again in a moment."                 |
| 422  | `EARN_NOT_ALLOWED`             | Diamond Concierge or other zero-earn rule                       | "This tier doesn't earn points on this transaction."                           |
| 429  | `RATE_LIMITED`                 | Too many requests                                               | "You're going a bit fast. Take a breath and try again."                        |
| 500  | `INTERNAL_ERROR`               | Unexpected backend failure                                      | "Something went wrong on our end. Reference: {X-Request-ID}."                  |

This list will harden as Alpha test exposes real cases. Wireframes should treat each as a distinct UI state, not a generic toast.

---

## 8. Cross-stack vocabulary (do not invent)

The UI **must** use these canonical names. Marketing copy may vary at the editorial layer, but identifiers, headings, and labels must use these.

- **RedRoomRewards** / **RRR** — the platform.
- **ChatNow.Zone** — never `XXXChatNow.com`. Phase-2 merchant.
- **RedRoomPleasures** — Phase-1 merchant.
- **Cyrano** — Phase-1 merchant.
- **RRR Points** — the loyalty currency. Never "credits", "tokens", "coins."
- **Wallet** — member's balance record. Never "account" alone (ambiguous with Loyalty Account).
- **PointLot** — an individual award batch with its own expiry.
- **LedgerEntry** — never "transaction record" alone; ledger is the canonical name.
- **Escrow** — points held pending an event. Never "pending balance" or "frozen funds."
- **Tier** — `merchant_tier` (today). `rrr_member_tier` is future-architected (CEO B2) — UI may not surface it for Alpha.
- **Inferno multiplier** — Room-Heat Inferno Bonus, never a generic "boost."

See `docs/DOMAIN_GLOSSARY.md` for the complete canonical list.

---

## 9. What is NOT in the Alpha UI

Designers should not produce screens for these — they're either retired, deferred, or out of scope:

- **Slot-machine mechanics** — permanently retired (CEO D1). No spinning, no jackpots, no random-reward UI.
- **Diamond Concierge earn affordance** — Diamond Concierge tier earns zero (CEO D3). No "earn 2× tonight" CTA for these users.
- **GGS (Global Gift System)** — deferred (CEO D5). Webhook-receive only, no UI.
- **Cross-merchant redemption UI** — service exists at 1:1 default (CEO B4) but Alpha test does not surface this in member-facing UI yet.
- **`rrr_member_tier`** — architected, nullable, not surfaced (CEO B2). Show only `merchant_tier`.
- **Slot-machine adjacent gamification** (streaks, leaderboards, "lucky" anything) — out of scope for Alpha. Bring it up explicitly with Kevin if it feels essential.

---

## 10. Accessibility floor

Wireframes should assume the eventual UI hits at least:
- WCAG 2.1 AA contrast on all balance / cap / tier indicators (numbers must be readable at 200% zoom).
- All actions reachable by keyboard.
- All actionable elements have visible focus states.
- Error states announce via aria-live, not just colour.
- Currency / point amounts always have a non-numeric label (screen readers should hear "available balance, 1,250 points," not just "1,250").

Creative agencies skinning the wireframes inherit these constraints.

---

## 11. Cross-stack alignment with Cyrano

RRR and Cyrano are at the same UX stage and will be designed by the same Grok-driven workflow. To keep the two coherent without a heavy design system:

- Share the canonical vocabulary in §8 — Cyrano UIs touching loyalty surfaces use the same names.
- Share the role list in §2 where overlapping (Member, Merchant Admin in Cyrano context).
- Share the error envelope in §7 so the same backend error code surfaces consistent copy in both products.
- Component-level visual design can diverge; the data contracts and naming cannot.

If Grok is producing wireframes for both stacks, treat this brief as the loyalty-surface authority and let the Cyrano stack import §5–§9 wholesale for any screens that touch RRR data.

---

## 12. Wireframe specs live in `docs/ux/`

See `docs/ux/README.md` for the spec format and the index of completed screens. Each spec binds explicitly to the endpoints, states, error codes, and rules in this brief.

---

_This brief is Alpha-frozen. Updates require a CHORE: commit and a note in the production schedule._
