# 08 — Reporting Dashboard

**Role:** Merchant Admin (per-tenant operator at RedRoomPleasures or Cyrano),
with cross-tenant variant for OQMI Operator **Purpose:** Give a merchant
operator a focused, drill-downable read on the financial health of their loyalty
program — outstanding liability, expirations on the runway, and program activity
over time — so they can answer "what's our exposure?" and "what trends should we
know about?" without leaving one screen. **Status:** draft

---

## 1. API binding

- `GET /reports/liability` — primary endpoint; returns the outstanding-liability
  totals (issued, burned, outstanding) and the cash-equivalent valuation.
- `GET /admin/expiration/warnings` — lists PointLots in the EXPIRING state per
  `docs/UX_INTEGRATION_BRIEF.md` §4.5; drives the "expirations on the runway"
  tile.
- `GET /ledger/transactions?tenant_id=...&from=...&to=...` — aggregated
  client-side (or via a thin server aggregation endpoint added later) to drive
  the activity-over-time chart and the reason-code mix.
- (Indirect) the operator's `tenant_id` and `roles` JWT claims — server-side
  `TenantScopeMiddleware` enforces scope; UI must respect the same boundary and
  never offer a tenant selector that escapes it.

For an OQMI Operator (cross-tenant), the same endpoints respond with
cross-tenant aggregates and a tenant filter is offered at the top of the screen.

---

## 2. States

- **Loading:** every tile renders as a shimmer at full final size; the
  time-window selector is disabled.
- **Empty (new merchant, no activity):** liability shows
  `0 RRR Points · $0.00 outstanding`; expiration tile shows `0 lots`; activity
  chart shows the empty-trend rail with an `{empty_activity_copy}` slot. CTAs
  remain enabled — the operator can still navigate to the underlying lists.
- **Success:** all four tiles populated; activity chart renders; reason-code mix
  bar renders; export CTA enabled.
- **Stale / refresh-needed:** if the background refresh fires and the data is
  older than 60s while the screen is focused, render a
  `"updated 1m 12s ago — refresh"` indicator. Polling is opt-in (see §4 of the
  brief: no silent polling on member screens, but operator consoles may poll on
  a 30–60s cadence while focused).
- **Error states:**
  - `AUTH_INVALID` → redirect to sign-in.
  - `TENANT_SCOPE_VIOLATION` → full-screen error with `{tenant_violation_copy}`.
    Should not happen for a correctly-scoped operator.
  - Per-tile error → that tile renders `{tile_error_copy}` with a retry control;
    other tiles continue to render.
  - `RATE_LIMITED` → top-of-page banner; never auto-retry.

---

## 3. Layout intent

Desktop-first (operator tool; mobile is a fold-back, not the primary surface):

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  [merchant logo]  RedRoomPleasures · Reporting              [operator · sign out] │
├────────────────────────────────────────────────────────────────────────────────┤
│  Time window: [ 7d  | 30d  | 90d  | custom ]            [ Export CSV ▾ ]       │
├────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────────┐  │
│  │ Outstanding liability       │  │ Expirations on the runway               │  │
│  │                             │  │                                         │  │
│  │  1,240,000 RRR Points       │  │  Next 30 days:  4 lots / 18,500 pts    │  │
│  │  ≈ $1,240.00 USD            │  │  Next 7 days:   1 lot  /  3,200 pts    │  │
│  │  Issued (90d):   +88,400    │  │  Next 48 hours: 0 lots                 │  │
│  │  Burned  (90d):  −12,200    │  │                                         │  │
│  │  ─────────────────          │  │  ▸ View all warnings                    │  │
│  │  ▸ Drill into wallets       │  │                                         │  │
│  └─────────────────────────────┘  └─────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────────────┤
│  Activity over time                                                            │
│  ─────────────────────────────────────────────────────────────────────────     │
│           ▂▃▄▅▄▃▂  earn          ▁▂▂▃▃▂▂  redeem          ▁▁▁▁▁▁▁  refund      │
│  M T W T F S S M T W T F S S ...                                                │
│  ▸ View as table                                                               │
├────────────────────────────────────────────────────────────────────────────────┤
│  Reason-code mix (90d)                                                         │
│  PROMOTIONAL_AWARD       ▓▓▓▓▓▓▓▓▓▓▓▓ 62%                                      │
│  MERCHANT_ORDER_REDEMPTION ▓▓▓▓▓▓ 31%                                          │
│  ADMIN_REFUND            ▓▓ 4%                                                 │
│  POINT_EXPIRY            ▓ 2%                                                  │
│  STEP_UP_GRANTED         · 1%                                                  │
│  (other)                 · <1%                                                 │
│  ▸ View as table                                                               │
└────────────────────────────────────────────────────────────────────────────────┘
```

Mobile fold-back: tiles stack vertically; the activity chart becomes a
horizontally scrollable strip; the reason-code mix becomes a list of stacked
rows.

---

## 4. Copy slots

- **{liability_label}** — "Outstanding liability"
- **{liability_helper}** — "Points your members hold. Liability shrinks as they
  redeem or expire."
- **{liability_window_label}** — "Issued / Burned ({window})" — `{window}` =
  `7d` / `30d` / `90d` / `custom`.
- **{expiration_label}** — "Expirations on the runway"
- **{expiration_window_subhead}** — "Next 30 days" / "Next 7 days" / "Next 48
  hours"
- **{activity_label}** — "Activity over time"
- **{activity_legend_earn}** — "earn"
- **{activity_legend_redeem}** — "redeem"
- **{activity_legend_refund}** — "refund"
- **{reason_mix_label}** — "Reason-code mix ({window})"
- **{empty_activity_copy}** — "No activity in this window. Award some points or
  wait for member redemptions to see trends."
- **{tenant_violation_copy}** — "You don't have access to that tenant's report."
- **{tile_error_copy}** — "Couldn't load this. Retry?"
- **{rate_limit_copy}** — "You're going a bit fast. Take a breath and try
  again."
- **{stale_indicator_copy}** — "updated {age} ago — refresh"
- **{export_cta}** — "Export CSV"
- **{export_caveat}** — "Export reflects the current time window and tenant
  scope. Exports are audit-logged."

---

## 5. Interactions

- **Tap a window tab (7d / 30d / 90d / custom):**
  - Re-issues the underlying queries with the new window. Custom opens a
    date-range picker (start / end, max 365 days).
  - Updates `{liability_window_label}`, `{reason_mix_label}`, and the activity
    chart simultaneously. Expiration tile is fixed at next 48h / 7d / 30d
    (industry-standard — not driven by the window selector).
- **Tap "Drill into wallets" (liability tile):**
  - Navigates to a paginated wallet list ordered by balance descending, scoped
    to the current tenant. (Future screen, not in this packet.)
- **Tap "View all warnings" (expiration tile):**
  - Navigates to the expiration warnings list (future screen) bound to
    `GET /admin/expiration/warnings` with full lot-level detail.
- **Tap "View as table" (activity chart or reason-code mix):**
  - Opens an inline sortable table with the same data as the visualization.
    Required for accessibility — bar widths are not conveyed to assistive tech.
- **Tap "Export CSV":**
  - Generates a CSV of the current window + tenant scope. Action is audit-logged
    (`reason_code: REPORT_EXPORT` — NB: this code is not currently in
    `TransactionReason`; the audit entry uses a separate operator-action audit
    log, not the financial ledger). Surface `{export_caveat}` near the CTA.
- **Manual refresh:**
  - The "updated Nm Ns ago — refresh" indicator is itself the refresh
    affordance. Tap to re-issue.
- **Pull to refresh (mobile):**
  - Re-issues queries. Same scope, same window.

---

## 6. Polling behavior

Per `docs/UX_INTEGRATION_BRIEF.md` §11: operator consoles may poll on a 30–60s
interval while focused. This screen polls **every 60s while focused**, pauses on
tab blur, and resumes on focus. After 5 minutes of focus without interaction the
poll backs off to 5 min to reduce load on the API.

The stale indicator always reflects the actual age of the data, regardless of
poll cadence.

---

## 7. Accessibility notes

- **Tiles** are clickable regions; each has a true `<button>` or link semantic —
  not styled `<div>`s. Each tile announces as
  `"{tile_label}, {primary_value}, button"` when focused.
- **Activity chart** has a parallel data table behind a "View as table" toggle;
  announced as `"Activity chart, {N} data points, click to view as table"` on
  focus.
- **Reason-code mix** bar visualization has a parallel table per the same rule.
  Each bar announces its label and percentage when focused.
- **Currency / point amounts** always have a non-numeric label (per the brief
  floor in §10). E.g.
  `aria-label="Outstanding liability, 1,240,000 RRR Points, approximately $1,240 USD"`.
- **Time-window tabs** are a `<radiogroup>` with `aria-label="Time window"`.
  Selected tab has `aria-selected="true"`.
- **Stale indicator** uses `aria-live="polite"` so a screen-reader user notices
  when data is being refreshed without disrupting their flow.
- **Export action** announces a confirmation toast on completion:
  `"CSV exported. {N} rows."` Audit log entry is not surfaced to the user — it's
  there for compliance, not user feedback.

---

## 8. What's stubbed for v2

- **Activity chart aggregation endpoint** — for Alpha, the UI aggregates from
  `GET /ledger/transactions` paginated calls. This is fine for small tenants but
  doesn't scale. v2 wants a thin
  `GET /reports/activity?tenant_id=...&from=...&to=...&bucket=day` aggregation
  endpoint that returns pre-bucketed counts. `[v2 stub]`
- **Reason-code mix aggregation endpoint** — same shape. v2 wants
  `GET /reports/reason-code-mix?tenant_id=...&window=...` returning percentages
  directly. For Alpha, computed client-side from a sample of recent ledger
  entries. `[v2 stub]`
- **Saved reports / scheduled emails** — operator can configure a recurring CSV
  export to a registered email address. Out of Alpha scope. `[v2 stub]`
- **Comparison mode** — overlay two time windows on the activity chart. Out of
  Alpha scope. `[v2 stub]`
- **Per-merchant tier-mix tile** — currently in screen 03 (Merchant admin
  overview) but not duplicated here for Alpha; reporting surface is liability +
  expiration + activity + reason-code mix only. Add the tile here in v2 if
  operators ask. `[v2 stub]`
- **Cross-tenant aggregation** for OQMI Operator — Alpha shows the cross-tenant
  variant only when explicitly requested via a tenant filter set to "all"; the
  default view for an OQMI Operator is the same single-tenant view as a Merchant
  Admin. Real cross-tenant rollups (e.g. liability across all tenants) are v2.
  `[v2 stub]`
- **Welfare Guardian / fraud signal panel** — surfaces exist on the Cyrano side
  but RRR's reporting screen does not include them for Alpha. If they ever land
  here, they get their own tile. `[v2 stub]`
- **`REPORT_EXPORT` operator-action audit log** — the operator-action log is
  separate from the financial ledger (per §5 above). The infrastructure exists
  conceptually but is not yet implemented; for Alpha, exports are logged to pino
  (`request_id`, `tenant_id`, `operator_id`, window) only. v2 promotes that to a
  dedicated audit collection. `[v2 stub]`

---

## 9. Cross-stack notes

This screen is RRR-specific — its analog on the Cyrano side will exist in the
Cyrano repo and bind to its own presenter contracts. The shared component family
from `docs/ux/00-shared-components.md`:

- **AuditRow** appears in the "View as table" expansions of the activity chart
  and reason-code mix.
- **TierBadge** does **not** appear here — this screen is operator-facing, not
  member-facing. (If a tenant-level summary tier mix is added in v2, the badge
  can be reused per-row in that table.)
- **ComplianceOverlay** can fire from this screen for `STEP_UP` if the operator
  initiates a sensitive action (e.g. exporting a large dataset above a
  threshold). Step-up is plumbed through the same shared modal as everywhere
  else.
