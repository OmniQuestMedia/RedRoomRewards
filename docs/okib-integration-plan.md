# OKIB Integration Plan — RedRoomRewards ↔ RedRoomPleasures

**Status:** Draft — scaffolding / pre-Alpha. Gated behind `OKIB_ENABLED`
(default **off**). No production behaviour changes until the flag is enabled and
a real OKIB endpoint is provisioned.

**Owner:** RedRoomRewards (RRR) engine team.

**Authority / precedence:** This plan defers to `OQMI_GOVERNANCE.md`,
`docs/DOMAIN_GLOSSARY.md`, `docs/AUTH_CONTRACT.md`, and `api/openapi.yaml`. On
any conflict, those win.

> **Governance / naming flag (OPEN):** `OKIB` is **not yet** in
> `docs/DOMAIN_GLOSSARY.md`. Per the glossary's HARD*STOP rule, the canonical
> term and code identifier must be ratified by Program Control before this
> integration ships beyond scaffolding. This document uses the working expansion
> **OmniQuest Knowledge & Intelligence Bus (OKIB)** — the shared cross-platform
> intelligence / personalization layer for the OQMI ecosystem — as a
> \_proposal*, not a ruling.

---

## 1. What OKIB is (working definition)

OKIB is the OmniQuest cross-platform intelligence layer: a service that holds a
privacy-minimized, consented view of a member's engagement and preference
signals across OQMI properties (ChatNow.Zone, Cyrano, RedRoomPleasures) and can
return _derived context_ — never raw PII — for personalization and engagement
decisions.

RRR's relationship to OKIB is **read-mostly and advisory**:

- RRR **consumes** OKIB-derived context to enrich loyalty experiences.
- RRR **may emit** consented, minimized loyalty signals (e.g. tier changes, earn
  events) _to_ OKIB in a later wave — out of scope for this first cut.
- OKIB is **never** in the path of the ledger, wallet math, or any
  balance-changing operation. It is decoration, not authority. A failed or
  disabled OKIB call must never block an earn, redeem, or balance read.

---

## 2. Why RedRoomPleasures benefits

RedRoomPleasures is a WordPress / WooCommerce storefront whose purchases already
feed RRR earn events (see `docs/integrations/redroompleasures-wordpress.md`).
OKIB lets that same purchase + loyalty context power three classes of
experience, in priority order:

### 2.1 Personalized product recommendations

Given a member's consented engagement profile and their RRR tier / balance, OKIB
returns a ranked set of _product context hints_ (category affinities, price-band
fit, "points-reachable" items the member could redeem toward). The storefront
turns those hints into on-site merchandising. RRR's role is to attach
loyalty-aware framing ("you're 200 points from redeeming this").

### 2.2 Engagement nudges

OKIB surfaces _next-best-action_ signals — e.g. "member has points expiring in
30 days and an affinity for category X." RRR already owns the expiry signal
(`expiration.warning` webhook); OKIB makes the nudge _relevant_ rather than
generic. Nudges are advisory copy only; they never auto-spend points.

### 2.3 Creator-aware experiences

RRR already models creator attribution via `AffiliateLinkModel`
(`tenant_id + creator_id + platform → bonus_points_pct`). OKIB can return the
creator a member is most affiliated/engaged with, letting RedRoomPleasures
present creator-curated product sets and ensuring the _right_ creator
attribution bonus is applied on purchase. This directly strengthens the
affiliate qualification path described in §4.

---

## 3. Architecture & data flow

```
RedRoomPleasures (WP/WooCommerce)
        │  purchase / page view
        ▼
   RRR /earn, /wallets/:id/balance  ──────────────►  ledger + wallet (authoritative)
        │                                                   ▲
        │ (advisory, gated by OKIB_ENABLED)                 │ never blocked by OKIB
        ▼                                                   │
   OkibIntegrationService  ──HTTP──►  OKIB  ──derived context──┘
   (getPersonalizedProductContext, getEngagementNudges, getCreatorAffinity)
```

Key properties:

- **Gated:** every OKIB call sits behind `OKIB_ENABLED`. When off, methods
  return a typed _empty/neutral_ result (`{ enabled: false, … }`) — never throw.
- **Fail-open for UX, fail-closed for money:** OKIB errors degrade silently to
  the neutral result. Money paths (earn/redeem) do not call OKIB inline.
- **PII-minimized:** requests carry opaque `member_ref` / `tenant_id` only,
  consistent with RRR's PIPEDA-aligned, PII-minimized posture. No emails, no
  billing data, no cart contents beyond category-level hints.
- **Consent-gated:** OKIB context is only requested for members with an active
  personalization consent flag (sourced from the member record; enforcement
  detail deferred to the consent wave).
- **HMAC-signed:** outbound OKIB calls reuse the `docs/AUTH_CONTRACT.md` HMAC
  envelope pattern already used for tenant integrations.

---

## 4. Alignment with affiliate / creator attribution

Today (see Step-1 review and `docs/rewards-qualification-review.md`):

- `AffiliateService.resolveBonus()` computes a creator bonus but is **not**
  wired into the `awardPoints` earn path — creator attribution bonus is not
  currently applied automatically on a RedRoomPleasures purchase.
- OKIB's `getCreatorAffinity` is the natural place to resolve _which_ creator a
  purchase should attribute to when the storefront can't supply a definitive
  `creator_id`, feeding `resolveBonus`.

This plan does **not** change the earn math in this cut. It scaffolds the
context retrieval so a later wave can: (1) resolve creator affinity via OKIB,
(2) call `resolveBonus`, (3) award the base + bonus through the existing
`awardPoints` flow. That wiring is tracked as a follow-up in §7.

---

## 5. Feature flag & configuration

| Variable        | Default | Meaning                                                      |
| --------------- | ------- | ------------------------------------------------------------ |
| `OKIB_ENABLED`  | `false` | Master gate. When `false`, all OKIB methods return neutral.  |
| `OKIB_BASE_URL` | _unset_ | OKIB service base URL (HTTPS only). Required when enabled.   |
| `OKIB_API_KEY`  | _unset_ | HMAC key id / secret material for signing. Required when on. |

When `OKIB_ENABLED=false` the other two are ignored. When `true` and either is
missing, the service logs a warning and behaves as if disabled (fail-open).

---

## 6. Phasing

| Wave | Scope                                                                | Gate            |
| ---- | -------------------------------------------------------------------- | --------------- |
| 0    | **This cut** — gated service + placeholder methods + docs (no calls) | `OKIB_ENABLED`  |
| 1    | Real `getPersonalizedProductContext` against staging OKIB            | `OKIB_ENABLED`  |
| 2    | `getEngagementNudges` wired to expiry/tier signals                   | `OKIB_ENABLED`  |
| 3    | `getCreatorAffinity` → `resolveBonus` → `awardPoints` attribution    | flag + glossary |
| 4    | RRR → OKIB outbound consented loyalty signals                        | new flag        |

---

## 7. Open items / follow-ups

- [ ] **Glossary:** ratify `OKIB` term + code identifier in
      `docs/DOMAIN_GLOSSARY.md` (Program Control). Blocks Wave 3+.
- [ ] Define the OKIB request/response contract (add to `api/` or a contract
      doc).
- [ ] Consent model: where the personalization consent flag lives + enforcement.
- [ ] Wire creator-affinity → `resolveBonus` → `awardPoints` (closes the §4
      gap).
- [ ] Add `OKIB_*` to `src/config/env-validator.ts` once `OKIB_ENABLED=true` is
      a supported deployment mode.
- [ ] Decide caching / TTL for OKIB context to bound storefront latency.

---

_This plan is scaffolding-bound. Behaviour is inert until `OKIB_ENABLED=true`
and a real OKIB endpoint is provisioned._
