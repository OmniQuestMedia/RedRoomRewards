# DESIGN HANDOFF — RedRoomRewards Member Portal (technical brief)

**Repo:** OmniQuestMedia/RedRoomRewards · **Surface:** consumer-facing
loyalty/rewards portal (`apps/member-portal`) · **Authority:** this brief defers
to `docs/DOMAIN_GLOSSARY.md` (naming), `api/openapi.yaml` + the running code
(contract), and `docs/RRR_CEO_DECISIONS_FINAL_2026-04-17.md` (binding rulings).
When any of those disagree with this file, they win.

---

## How to use this doc

- **Paste this into a separate Claude Design session** as the ground-truth
  contract for wireframe / information-architecture work.
- **Aesthetics are out of scope here.** Colour, type personality, spacing,
  motion, imagery, illustration, and brand voice are the design session's job.
  This doc describes _what_ each surface is, _what data_ it renders, _how it
  behaves_, and _which rules_ constrain it.
- **The backend/codebase is the contract.** Every screen, field, enum, and state
  below is quoted from real source under `apps/member-portal/` and `src/`. Where
  the wired portal and the older aspirational specs
  (`docs/UX_INTEGRATION_BRIEF.md`, `docs/ux/*`) disagree, this doc follows the
  wired code and says so explicitly.
- **Do not invent surfaces with no data behind them,** and do not soften a
  compliance gate for convenience. Money/points are integers (see §4).
- **Scope of this handoff:** the five wired consumer surfaces plus the reachable
  states around them. Merchant-admin, operator, model/creator, and escrow
  surfaces exist in the backend and the older specs but are **not** part of the
  wired member portal — they are listed in §3/§8 as context, not as work.

---

## 0. What you are being asked to produce

Wireframes and information architecture for the **RedRoomRewards member portal**
— the consumer surface where an age-verified member views their points balance
and tier, learns how to earn, browses the rewards catalogue, redeems points for
a code, and reviews their history and redemption codes.

Deliver: screen-by-screen wireframes (layout intent, hierarchy, component
inventory), the state matrix per screen (§7), and the navigation/IA model.
**Not** in scope: visual styling, a component/design-token system, copy voice,
or any screen for a persona other than the member (§3 lists the non-member
surfaces so you know where the member portal ends).

---

## 1. Product in one paragraph (the behavioral differentiators that drive UX)

RedRoomRewards (RRR) is a **multi-tenant, ledger-based loyalty engine** for the
OmniQuest Media adult ecosystem. A **Member** earns integer **RRR Points** from
qualifying actions on a connected merchant (RedRoomPleasures, Cyrano;
ChatNow.Zone later), and **burns** points either against a merchant order
(escrow-based, not in this portal) or for a **catalogue reward** that returns a
**redemption code** (the portal's burn path). Points sit in an **append-only
ledger** — there is no edit, delete, or member-initiated reversal; corrections
are new offsetting entries. Every member is **18+ age-verified before the
account exists at all** (hard gate at signup), and every point-moving action is
**idempotent** (client-supplied key). The member has a display **tier**
(`RED_DESIRE → RED_PASSION → RED_OBSESSION → RED_REIGN`) driven by lifetime
points. The portal is a **thin read/act client** over a REST API: it does not
mint identity (an external IdP does), does not run any game/chance mechanic
(retired by CEO ruling D1), and never lets AI touch a balance (advisory-only
boundary). These five facts — append-only ledger, mandatory 18+ gate, idempotent
point moves, tenant isolation, advisory-only AI — are the non-negotiables the
skin must not design away (§5, §9).

---

## 2. Frontend ground truth

Everything here is quoted from `apps/member-portal/`.

| Aspect            | Reality                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Framework         | **Next.js 15.5** App Router (`apps/member-portal/src/app/`), **React 18**                  |
| Rendering         | **Client-only** — every page is `'use client'`; data is fetched in `useEffect` after mount |
| Build             | `output: 'standalone'` (`next.config.ts`)                                                  |
| Styling system    | **Tailwind CSS 3** utility classes inline (`tailwind.config.ts`, `globals.css`)            |
| Component library | **None.** No shared component layer — each page hand-rolls its markup                      |
| Typed API client  | `apps/member-portal/lib/rrr-client.ts` — the single fetch wrapper + all response types     |
| Auth helper       | `apps/member-portal/lib/auth.ts`                                                           |
| API base          | `NEXT_PUBLIC_RRR_API_URL` (default `http://localhost:3000/api/v1`)                         |
| State management  | Local React `useState`/`useEffect` per page. No Redux/Zustand/React-Query                  |

### Auth & session model (drives every screen's auth-gated state)

- **No login screen lives in this portal.** JWTs are minted by an external IdP
  (AccountsZone / Keycloak). The portal reads `rrr_token` and `rrr_member_id`
  from `localStorage` (`lib/auth.ts`).
- Every page calls `requireAuth()` on mount. If either token or member id is
  missing, it **redirects to `NEXT_PUBLIC_ACCOUNTS_ZONE_URL`** with a `redirect`
  back-param (falls back to `/`).
- `rrr-client.ts` attaches `Authorization: Bearer <token>`. On **HTTP 401** it
  redirects to the AccountsZone login and throws `Unauthorized`.
- On the backend, auth is enforced by **middleware keyed off route lists** in
  `src/config/route-policy.ts` (not decorators): `PUBLIC` / `AUTH_ONLY` /
  `TENANT_SCOPED`. The **tenant comes from a `tenant_id` claim in the JWT** —
  the portal never sends a tenant explicitly, so catalogue and redemptions are
  implicitly scoped to the member's merchant.

### Existing brand tokens (ground truth to sit on — **not** a mandate)

These exist in the current wired portal; the design session may replace them
wholesale. Listed so wireframes know what's already assumed:

- Global chrome: dark canvas (`bg-gray-950`, `text-gray-100`), red accent
  (`text-red-500`, `border-red-900`), red primary buttons (`bg-red-700`).
- Persistent top nav: `RedRoom Rewards™` wordmark + links **Earn · Redeem ·
  History · My Codes**; footer states
  `18+ only | Canada data residency (ca-central-1)`.
- Tier accent map (dashboard): `RED_DESIRE`→`text-red-400`,
  `RED_PASSION`→`-500`, `RED_OBSESSION`→`-600`, `RED_REIGN`→`-700`, with emoji
  labels 🔴/❤️/💔/👑.
- Canonical names are locked by `docs/DOMAIN_GLOSSARY.md`: **RRR Points** (never
  credits/tokens/coins), **Wallet**, **Member**, **Tier**, **PointLot**,
  **Escrow**, **LedgerEntry**. Use these exact identifiers in labels.

---

## 3. Route map — every real member surface

The wired portal has **five** surfaces, all under the member persona. Base API
path is `/api/v1`. Each row is a real page file + the exact backend call(s) it
makes via `rrr-client.ts`.

| #   | Page (file)                                                    | Purpose                                         | Backend call(s) it makes                                                                       |
| --- | -------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | `src/app/page.tsx` — **Dashboard** (`/`)                       | Balance, tier, 5 recent activity rows, two CTAs | `GET /members/{memberId}/balance` **⚠ see gap**, `GET /ledger/transactions?accountId=…&page=1` |
| 2   | `src/app/earn/page.tsx` — **Earn** (`/earn`)                   | Static earn-rules + tier-threshold explainer    | **None** — renders local constants (`EARN_RULES`, `TIER_TABLE`)                                |
| 3   | `src/app/burn/page.tsx` — **Redeem** (`/burn`)                 | Browse catalogue, redeem an item, show code     | `GET /catalogue`, `POST /catalogue/redeem`                                                     |
| 4   | `src/app/history/page.tsx` — **History** (`/history`)          | Paginated ledger/transaction history            | `GET /ledger/transactions?accountId=…&page=N`                                                  |
| 5   | `src/app/redemptions/page.tsx` — **My Codes** (`/redemptions`) | List the member's redemption codes + status     | `GET /catalogue/my-redemptions`                                                                |

### ⚠ Two real contract gaps the wireframes must account for

These are code facts, not design choices. Do not paper over them:

1. **`GET /members/{memberId}/balance` has no server route.** `MemberController`
   (`src/controllers/member.controller.ts`) only exposes `POST /members/signup`.
   The dashboard's balance/tier block therefore has **no live endpoint today** —
   treat the balance render as **contract-declared but unwired** (design it, but
   know it will error against the current backend). The declared shape is in §4.
2. **Ledger query-param mismatch.** The portal sends `?accountId=…&page=…`, but
   the backend `GET /ledger/transactions` reads `userId`, `limit`, `offset`
   (`src/controllers/ledger.controller.ts`, `src/api/ledger.controller.ts`). The
   history list will not bind until these reconcile. Design the History and
   Dashboard-recent-activity states assuming the **response** shape in §4; the
   request wiring is an engineering fix, not a design one.

### Non-member surfaces (context only — NOT part of this handoff)

The backend serves other personas via other controllers. They are **not** in the
member portal and no member-portal page reaches them. Listed so you know the
member boundary:

- **Merchant Admin:** `POST /admin/earn` (award, step-up-gated),
  `POST /merchants/awarding-wallet/upload-csv`, `POST|GET /white-label/config`.
- **Platform Admin:** `POST|PUT /admin/catalogue`, `GET /reports/liability`.
- **Model / Creator:** `GET /creator/gifting-panel/state` (**stub**, §8).
- **Merchant-order redemption (escrow):** `POST /redemptions`,
  `GET /redemptions/eligible` — a checkout-time burn against an order, distinct
  from the catalogue burn in this portal (§6.2). No member-portal page uses it.
- **Machine/webhook:** `POST /wallet/credit|deduct`, `POST /webhooks/receive`
  (HMAC), `POST /integrations/woocommerce/webhook` (HMAC) — backend-to-backend,
  no UI.

---

## 4. Data contracts (exact shapes each screen renders)

**Units, once and for all:** all balances, costs, and amounts are **integer RRR
Points — no decimals, no sub-units, no cents/BigInt.** Stored as plain numbers;
`currency` defaults to the string `'points'`. A merchant's default valuation is
`1000 pts = $1.00` and default earn is `12 pts / $1 USD` (both
tenant-configured; the Earn page's placeholder copy says "1 pt / $1 CAD" — that
is illustrative, not a platform constant). Display points with thousands
separators (`toLocaleString()` is already used).

### 4.1 Balance (Dashboard) — declared by the client, `rrr-client.ts`

```ts
interface BalanceResponse {
  memberId: string;
  totalPoints: number; // integer points
  promotionalBalance: number; // integer points
  tier: string; // a RedRoomTier value (see 4.5)
}
```

Ground-truth caveats the skin must respect:

- This is the shape the **frontend expects**, but no live route returns it (§3
  gap 1). The nearest persisted source, the **Wallet** model
  (`src/db/models/wallet.model.ts`), stores only **two buckets**:
  `availableBalance` and `escrowBalance` — there is **no persisted
  `promotionalBalance` field.** `promotionalBalance` + `totalPoints` + `tier`
  appear together only on an **ephemeral** `MemberProfile` returned by
  `MemberService.signup()`, not on any stored record.
- **Design implication:** treat `totalPoints` as the headline number, and
  `promotionalBalance` as a secondary, possibly-absent sub-line. Do **not**
  build a rich multi-bucket wallet UI on the member surface — the persisted
  model does not back it. A `spend-order-config` model exists but currently has
  **no runtime consumer** (there is no `PointLot` model wired), so per-lot
  expiry and promo→earned→cash spend-order are **not** live and must not be
  surfaced.

### 4.2 Transaction / ledger entry (Dashboard recent + History)

```ts
interface Transaction {
  entryId: string;
  type: 'credit' | 'debit';
  amount: number; // integer points, unsigned in UI (sign from `type`)
  reason: string; // a reason_code (see 4.6), NOT user copy
  timestamp: string; // ISO 8601
  correlationId?: string;
}
interface TransactionHistoryResponse {
  entries: Transaction[];
  total: number;
  page: number;
}
```

- Credit renders `+N` (green today); debit renders `-N` (red today).
- `reason` is a **machine reason_code** (§4.6). The AuditRow needs a
  human-readable label map; **never** show the raw code as prose to the member.
- Dashboard shows `entries.slice(0, 5)`; History paginates (portal currently
  assumes a page size of 20 for its "Next" affordance).

### 4.3 Catalogue item (Redeem)

```ts
interface CatalogueItem {
  item_id: string;
  tenant_id: string;
  title: string;
  description: string;
  image_url?: string;
  points_cost: number; // integer, min 1
  inventory_count: number | null; // null = untracked / unlimited
  redemption_type: 'DISCOUNT_CODE' | 'FREE_PRODUCT' | 'EXCLUSIVE_ACCESS';
  redemption_value: Record<string, unknown>; // free-form; no per-type schema in code
  valid_from?: string | null;
  valid_until?: string | null;
}
interface CatalogueResponse {
  items: CatalogueItem[];
  total: number;
  page: number;
  limit: number;
}
```

- `redemption_type` is a **closed set of exactly three** values — the design
  must handle all three (portal already maps 🏷️ Discount Code / 🎁 Free Product
  / 🔐 Exclusive Access).
- `inventory_count === null` means **do not show a "remaining" indicator**; a
  number means show it (and it can be `0` → sold out).
- Only **active, in-window** items are returned (backend filters `is_active` +
  `valid_from`/`valid_until`); the client does not receive expired/inactive
  items.
- Client-side filters exist in the contract (`redemption_type`,
  `max_points_cost`) — the wireframe may expose a filter/affordance for these.

### 4.4 Redemption result + "My Codes" row

```ts
interface RedeemResponse {
  redemptionId: string;
  redemptionCode: string; // the code the member must keep
  pointsSpent: number;
  itemTitle: string;
}
interface Redemption {
  redemption_id: string;
  catalogue_item_id: string;
  points_spent: number;
  redemption_code: string;
  status: 'PENDING' | 'FULFILLED' | 'EXPIRED' | 'REVERSED';
  createdAt: string;
}
```

- **The status enum on the server has FIVE values, not four:** `RESERVED`,
  `PENDING`, `FULFILLED`, `EXPIRED`, `REVERSED`
  (`src/db/models/burn-redemption.model.ts`). The client type omits `RESERVED`.
  **The "My Codes" screen must style all five states** — `RESERVED` is a
  transient in-flight hold that can appear if a code is read mid-redemption.
- `POST /catalogue/redeem` takes `{ itemId, idempotencyKey }`; the client
  auto-generates the key via `crypto.randomUUID()`. `idempotencyKey` is
  **required** (400 if missing).

### 4.5 Tier (Dashboard + Earn) — **the display tier**

```ts
enum RedRoomTier {
  RED_DESIRE,
  RED_PASSION,
  RED_OBSESSION,
  RED_REIGN,
}
```

Thresholds and multipliers are **locked in code**
(`src/services/tier-engine.service.ts`, "CEO spec D3"), by **lifetime total
points**:

| Tier            | Min lifetime points | Earn multiplier | Vibe (in code)                    |
| --------------- | ------------------- | --------------- | --------------------------------- |
| `RED_DESIRE`    | 0                   | 1.0×            | Heartbeat — alive in the program  |
| `RED_PASSION`   | 5,000               | 1.2×            | Emotionally invested              |
| `RED_OBSESSION` | 25,000              | 1.5×            | Deep craving, committed           |
| `RED_REIGN`     | 100,000             | 1.7×            | All-in — the most devoted members |

At `RED_REIGN`, "points to next tier" is 0 (top tier). The Earn page currently
prints multipliers as "Configured" — the real values above may be surfaced.

> **Two-tier ambiguity (flag for design + engineering).** A **second,
> different** tier vocabulary — `PLATINUM | GOLD | SILVER | MEMBER | GUEST` —
> exists on the **persisted** `loyalty_accounts.rrr_member_tier` and drives
> **redemption caps** (`src/db/models/tier-cap-config.model.ts`). That set is
> **not** what the member portal shows; the portal shows `RED_*`. Per CEO B2,
> the cross-merchant member tier is nullable-at-launch and **not surfaced for
> now**. **Wireframes must use `RED_*` for the member's badge** and must not
> display the PLATINUM/GOLD set.

### 4.6 Reason codes (AuditRow label source — auditor vocabulary, never user copy)

`reason` on a ledger entry is one of the `TransactionReason` values
(`src/wallets/types/domain.types.ts`), e.g. `user_signup_bonus`,
`promotional_award`, `admin_credit`, `model_gift`, `merchant_order_redemption`,
`point_expiry`, `admin_refund`, `admin_debit`, `chargeback`, and the
performance/escrow family. The design needs a **code → friendly-label** map for
the History and recent-activity rows; the raw code is stable but is for
auditors/support, not for member-facing prose.

### 4.7 Static content the portal ships (no endpoint)

The **Earn** page renders two hard-coded arrays from `rrr-client.ts` /
`earn/page.tsx`: `EARN_RULES` (Sign-up 1,000 pts one-time; RedRoomPleasures
purchase 1 pt/$1, shipping excluded; Admin promotion variable; Creator gift =
token value, platform keeps 25%) and `TIER_TABLE` (the thresholds above). These
are **editorial placeholders**, not a contract — the design may restructure
them, but must keep the "rules vary by tenant / contact support" caveat that is
already present.

---

## 5. Compliance / business rules that dictate the UX (the non-negotiables)

Each of these changes what a screen is _allowed_ to do. They are enforced in
code and/or governance; the skin must not design around them.

1. **18+ age verification is a hard gate at account creation.**
   `MemberService.signup()` throws "18+ verification required — account creation
   blocked" if AV is not verified (`GateGuardAVService`, currently a stub that
   returns `verified: true`). **Consequence for UX:** every member reaching the
   portal is already verified — there is **no in-portal "verify your age" step**
   and no earn-but-can't-spend limbo. But the **18+ context must remain
   visible** (the footer already carries `18+ only`), and the portal must never
   expose a path that implies an unverified user could transact.

2. **Advisory-only AI boundary.** No AI path may mutate a balance or the ledger.
   The OKIB personalization layer is **gated off by default** (`OKIB_ENABLED`,
   `src/services/okib-integration.service.ts`) and is **never in the money
   path**. **Consequence:** any "recommended for you" / nudge surface a designer
   adds is **advisory decoration only** — it can never be shown as having moved
   points, granted a tier, or gated a redemption.

3. **Append-only ledger — no member-side mutation.** `ledger_entries` reject
   update/delete at the schema layer (`src/db/models/ledger-entry.model.ts`
   pre-\* hooks throw). Corrections are **new offsetting entries** linked by
   `correlationId`. **Consequence:** the member UI must offer **no** edit,
   delete, undo, cancel-my-redemption, or "reverse this transaction" affordance.
   A reversal, if it happens, appears to the member as a normal credit/debit row
   with its own reason code — never as an editable/inline-undoable item.

4. **Idempotent point moves.** Every state-changing POST carries a
   client-generated `idempotencyKey` (UUID v4, one per user-initiated action,
   the same on retry). A repeat of the same key returns the original result.
   **Consequence:** the Redeem button must generate one key per press and reuse
   it on retry; a double-click or a network retry must **not** be presented as a
   second redemption. Treat an idempotent replay as "already done — here is your
   original code," not an error.

5. **Tenant isolation.** Catalogue, redemptions, and history are scoped to the
   member's `tenant_id` claim. **Consequence:** never build cross-tenant browse,
   never show another merchant's catalogue, and assume "the program" the member
   sees is a single merchant's. Earn rules/caps "vary by tenant" (keep that
   caveat).

6. **Diamond Concierge earns zero (CEO D3).** Those members can **burn** points
   but no earn event fires for them. **Consequence:** if the design ever
   conditions an "earn 2× tonight" style CTA, it must be suppressible for a
   zero-earn member. (Not currently surfaced in the wired portal — relevant if
   you add earn CTAs.)

7. **No game / chance mechanics (CEO D1).** Slot machines, spins, jackpots,
   loot-box, "lucky" reveals are **permanently retired.** Do not design any
   randomized-reward, streak-gamble, or wheel surface.

8. **Canada-only data residency (PIPEDA / ca-central-1).** Reinforced in the
   footer. No design element should imply data leaves Canada. PII is minimized —
   the portal holds only `rrr_token` + `rrr_member_id`; no email/phone/DOB is
   rendered anywhere.

9. **High-value awards are welfare-scored (server-side, invisible).**
   `RedRoomLedgerService.awardPointsWithCompliance` runs Welfare Guardian Score
   on awards `> 1000` points; a `HARD_DECLINE` blocks the credit.
   **Consequence:** an earn a member expected may simply **not appear** in the
   ledger. History/empty states must degrade gracefully (no "pending points"
   fiction) and never promise an award the ledger doesn't show.

10. **Rate limits & 429.** Public routes are limited (100/min default; signup
    5/min). **Consequence:** design a distinct, friendly "you're going too fast"
    state that honours `Retry-After`; never silently auto-retry a state-changing
    action.

---

## 6. Core journeys as state machines

### 6.1 Catalogue burn (the portal's redeem flow) — server truth

The portal's `POST /catalogue/redeem` drives this lifecycle
(`src/services/burn-catalogue.service.ts`):

```
 tap Redeem (idempotencyKey minted)
        │
        ▼
   [RESERVED]  ── slot claimed; idempotent guard. If a same-key RESERVED
        │        record already exists → tell client "retry in a moment"
        │        (do NOT show success yet — debit not confirmed)
        ▼
   deduct points ──(insufficient)──▶ ERROR: insufficient balance (no state change)
        │
        ▼
   decrement inventory (atomic) ──(sold out in race)──▶ compensate debit, fail
        │
        ▼
   [PENDING]  ── debit + inventory both confirmed; redemptionCode returned to UI
        │
        ▼
   [FULFILLED]  ── admin/fulfilment marks delivered (terminal happy path)

   [EXPIRED] / [REVERSED]  ── terminal, set by ops; member sees status only
```

UX rules from this machine:

- **Success == a code.** On the 201 the member gets `redemptionCode`
  immediately; surface it prominently and tell them it also lives in **My
  Codes** (the portal already does this).
- The member's first sight of the code is at **PENDING**, not FULFILLED — so "My
  Codes" newest row is usually `PENDING`, moving to `FULFILLED` later. Design
  the status chip to make `PENDING` feel legitimate, not "stuck."
- There is **no cancel/undo** (append-only). `EXPIRED`/`REVERSED` are
  ops-driven; the member is a read-only observer of status.

### 6.2 Merchant-order redemption (escrow) — context, NOT in this portal

`POST /redemptions` holds points in **escrow** (72h) against a merchant order
and is tier-cap validated (`TIER_CAP_EXCEEDED` 422, `INSUFFICIENT_BALANCE` 402).
Escrow lifecycle: `HELD → SETTLED | REFUNDED | PARTIAL` (all terminal, no undo).
This is a **checkout-time** flow on the merchant surface, not a member-portal
page. Documented so you don't confuse the two burns; **do not** build it here.

### 6.3 Tier progression (display)

Lifetime points cross a threshold → tier advances (§4.5), computed by
`TierEngineService`. Tier is **display + earn-multiplier only** in the member
portal; it does not gate any portal action. Wireframe: a badge + optional
"progress to next tier" affordance driven by `pointsToNextTier`.

### 6.4 Auth/session

```
 page mount → requireAuth()
     │  token & memberId present ─────────▶ fetch data
     │  missing ──────────────────────────▶ redirect to AccountsZone login
 any API call → 401 ─────────────────────▶ redirect to AccountsZone login (?redirect=back)
```

There is no in-portal sign-in/sign-up/verify screen to design; the login lives
in AccountsZone. The portal only needs the **redirecting / unauthenticated**
state.

---

## 7. State coverage every screen must handle

Design each reachable state; these are all real given the code above.

| Screen                  | Loading                    | Empty                                       | Success                                       | Error states (reachable)                                                                                                                                                                                                             | Auth/edge                                |
| ----------------------- | -------------------------- | ------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Dashboard `/`           | yes (spinner today)        | zero balance; "No activity yet" recent list | balance + tier + 5 recent + Redeem/Earn CTAs  | balance endpoint error (**currently always** — §3 gap 1); generic error banner                                                                                                                                                       | redirect if unauthenticated; 401 → login |
| Earn `/earn`            | n/a (static)               | n/a                                         | rules table + tier table + "varies by tenant" | n/a (no fetch)                                                                                                                                                                                                                       | (still behind nav; no data call)         |
| Redeem `/burn`          | yes ("Loading catalogue…") | "No rewards available right now"            | grid of items; per-item Redeem button         | fetch error banner; **redeem errors** — insufficient balance, idempotent replay, sold-out, and **409 "Redemption in progress — please retry shortly"** (in-flight `RESERVED` for the same key); per-item `Redeeming…` disabled state | redirect if unauthenticated; 401 → login |
| History `/history`      | yes                        | "No transactions yet."                      | paginated table (Date/Description/Points)     | fetch error banner; **param-mismatch bind failure** (§3 gap 2)                                                                                                                                                                       | redirect if unauthenticated; 401 → login |
| My Codes `/redemptions` | yes                        | 🎟️ "No redemptions yet" + link to catalogue | list of code cards w/ status chip             | fetch error banner                                                                                                                                                                                                                   | redirect if unauthenticated; 401 → login |

Cross-cutting states the skin must cover (from §5): **429 rate-limited**
(friendly + Retry-After), **redeem success** (code reveal + "saved to My
Codes"), **idempotent-replay** (treated as success, not error), **sold-out
item** (`inventory_count === 0`), **untracked inventory** (hide the "remaining"
indicator), **all five redemption statuses** including `RESERVED`, **zero /
absent `promotionalBalance`** sub-line, and **top-tier** (no "next tier"
target).

---

## 8. What's real vs stubbed (so wireframes don't over-promise)

| Capability                                        | Status in the wired member portal                                                                                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue browse (`GET /catalogue`)               | **Real**, tenant-scoped, filters live                                                                                                                                                               |
| Catalogue redeem (`POST /catalogue/redeem`)       | **Real** — idempotent, RESERVED→PENDING→FULFILLED, inventory-safe                                                                                                                                   |
| My redemption codes (`/catalogue/my-redemptions`) | **Real**                                                                                                                                                                                            |
| Ledger history (`GET /ledger/transactions`)       | **Real endpoint, mis-wired call** — client sends `accountId`/`page`, server reads `userId`/`offset` (§3 gap 2)                                                                                      |
| Dashboard balance/tier                            | **Declared, unrouted** — `GET /members/{id}/balance` does not exist (§3 gap 1); tier badge depends on it                                                                                            |
| `promotionalBalance` bucket                       | **Not persisted** — Wallet has only `availableBalance`/`escrowBalance`; treat promo as optional/absent (§4.1)                                                                                       |
| Earn rules / tier thresholds page                 | **Static local content** — no endpoint; editorial placeholder (§4.7)                                                                                                                                |
| Age verification (18+)                            | **Enforced at signup, but AV provider is a stub** (`GateGuardAVService` returns `verified:true`); no in-portal AV UI                                                                                |
| Creator gift as an earn source                    | **Stub** — `CreatorGiftingPanelService` returns `{ promotionalBalance: 0, recentPromotions: [] }`; the Earn row is informational copy only, and the panel itself is a creator surface, not consumer |
| OKIB personalization / nudges                     | **Off by default**, advisory-only, never money path — do not design a live "AI picked this for you" experience                                                                                      |
| Merchant-order redemption / escrow                | **Real backend, no member-portal page** (§6.2)                                                                                                                                                      |
| Purchase → earn ingest (WooCommerce/webhooks)     | **Real** HMAC-verified backend ingest; invisible to the member except as resulting ledger credits                                                                                                   |
| Cross-merchant balance / redemption               | **Architected, not surfaced** (CEO B4 1:1 default; not in member portal)                                                                                                                            |
| Rewards catalogue item images                     | `image_url` **optional** — design a graceful no-image tile                                                                                                                                          |

---

## 9. Do-not-break guardrails (the rules the skin must not design away)

1. **No member-side ledger mutation.** No edit/delete/undo/cancel/reverse
   affordance anywhere near balance, history, or a redemption. (§5.3)
2. **One idempotency key per redeem action, reused on retry.** Double-tap and
   network retry must not read as a second burn. Idempotent replay = success.
   (§5.4)
3. **Points are integers.** Never render a decimal point or a currency symbol on
   an RRR Points value. Money↔points conversion is server-side and not surfaced.
   (§4)
4. **Reason codes are not user copy.** History/recent rows show a friendly
   label, never the raw `reason_code`. (§4.6)
5. **Member tier badge uses `RED_*` only.** Never surface the
   `PLATINUM/GOLD/SILVER/MEMBER/GUEST` cap-tier vocabulary in the member portal.
   (§4.5)
6. **18+ context stays present; no in-portal path implies an unverified user can
   transact.** (§5.1)
7. **No game/chance/gamble mechanics** — retired by ruling. (§5.7)
8. **AI stays advisory** — no nudge/recommendation may claim to have moved
   points or gated an action. (§5.2)
9. **Handle all five redemption statuses** (incl. `RESERVED`) and the "untracked
   inventory" (`null`) and "sold out" (`0`) cases. (§4.3/§4.4)
10. **Auth is external.** Design the unauthenticated/redirect state, not a login
    form. (§6.4)

---

## 10. Suggested wireframe deliverable order

Sequenced so the highest-traffic, best-wired surfaces land first and the
gap-blocked ones are designed against their declared contract:

1. **Global shell / IA** — top nav (Earn · Redeem · History · My Codes), footer
   (18+, ca-central-1), unauthenticated/redirect state, the shared
   loading/empty/error/429 patterns, and the **AuditRow** (reason-label + signed
   points) and **status chip** (5 states) as reusable pieces.
2. **Redeem `/burn`** — the most-wired, highest-value flow: catalogue grid (3
   redemption types, image-optional, inventory `null`/`0`), redeem interaction
   (idempotent, `Redeeming…`, insufficient-balance, replay), and the
   **code-reveal success** state.
3. **My Codes `/redemptions`** — code cards with all five status chips + empty
   state.
4. **History `/history`** — paginated AuditRow table + empty state (design to
   the §4.2 response shape; note the param-mismatch fix is engineering-side).
5. **Dashboard `/`** — balance headline (+ optional promo sub-line), `RED_*`
   tier badge with optional next-tier progress, 5 recent AuditRows, Redeem/Earn
   CTAs (design against the §4.1 declared shape; note the endpoint is unrouted
   today).
6. **Earn `/earn`** — static rules + tier-threshold explainer, "varies by tenant
   / contact support" caveat.

---

_This brief describes structure, behavior, and data only. Aesthetics are the
design session's responsibility. The code under `apps/member-portal/` and `src/`
is the contract; if it changes, update this file in the same PR._
