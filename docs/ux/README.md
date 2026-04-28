# `docs/ux/` — Wireframe Specs

These are **textual wireframes** that bind one screen to the real RRR API surface. They're the source-of-truth that creative agencies (or Grok-driven design tooling) skin into visual UI. They are **not** visual mockups; visual design happens outside the repo and is informed by these.

**Read first:** `docs/UX_INTEGRATION_BRIEF.md` — that's the contract this directory implements.

---

## Why textual specs

- They diff cleanly in git.
- They survive design tool churn (Figma, Sketch, whatever comes next).
- They make endpoint binding explicit — no screen exists in this directory unless every interactive element maps to a real endpoint or is explicitly tagged `[v2 stub]`.
- A reviewer can verify in 60 seconds whether a given screen will actually work against the live API.

---

## Spec format

Every screen lives in a single markdown file: `NN-screen-name.md` where `NN` is a stable two-digit number for ordering. Each file follows this template:

```markdown
# NN — Screen Name

**Role:** [Member | Model | Merchant Admin | OQMI Operator]
**Purpose:** one sentence. What does the user accomplish here?
**Status:** [draft | reviewed | frozen]

## API binding

- `METHOD /path` — what this call does on this screen
- ...

## States

- **Loading:** what the user sees while the data is in flight
- **Empty:** what the user sees when the data exists but is empty (zero balance, no history, etc.)
- **Success:** the normal happy-path render
- **Error states:** named error codes from §7 of the integration brief, each with its own UI state

## Layout intent

ASCII-art or structured prose describing the visual order. Top-to-bottom on
mobile, left-to-right where horizontal grouping matters. Don't pixel-prescribe.

## Copy slots

- **{slot_name}** — what it says in plain English (editorial may rewrite)

## Interactions

- **Action:** what the user does
  - **API call:** which endpoint fires
  - **Idempotency:** how the X-Idempotency-Key is generated
  - **Result UI:** which state above is rendered

## Accessibility notes

Anything beyond the floor in §10 of the integration brief.

## What's stubbed for v2

If anything on the screen does not bind to a real endpoint today, list it here
with a `[v2 stub]` tag and a brief note.
```

---

## Authorship workflow

1. Author drafts a spec in this directory as `NN-name.md`, status `draft`.
2. Reviewer (engineering side) checks every API binding against `api/openapi.yaml`. Files PR comments on any binding that doesn't match a real endpoint.
3. Author addresses, flips status to `reviewed`.
4. Once Alpha test signs off, status flips to `frozen`. Frozen specs require a CHORE ticket to amend.

---

## Index

| #              | Screen                          | Role                                      | Status |
| -------------- | ------------------------------- | ----------------------------------------- | ------ |
| 01             | Member balance                  | Member                                    | draft  |
| 01-onboarding  | GateGuard + Step-Up Auth Flow   | Guest → Member / Model / Operator (all)   | draft  |
| 02             | Redeem flow                     | Member                                    | draft  |
| 03             | Merchant admin overview         | Merchant Admin                            | draft  |
| #   | Screen                    | Role           | Status   |
| --- | ------------------------- | -------------- | -------- |
| 00  | Shared / cross-stack components | All      | reviewed |
| 01  | Member balance            | Member         | draft    |
| 02  | Redeem flow               | Member         | draft    |
| 03  | Merchant admin overview   | Merchant Admin | draft    |

More screens to follow as Alpha-prep wave continues. Recommended next batch:
- 04 — Ledger / transaction history (Member)
- 05 — Escrow detail (Member)
- 06 — Model gifting panel (Model)
- 07 — Awarding wallet console (OQMI Operator)
- 08 — Reporting dashboard (Merchant Admin)
- 09 — Sign-in / sign-up (with AV gate)
- 10 — Tier badge component (used across screens)

---

## What this directory is **not**

- Not a visual style guide (creative agency owns that).
- Not a component library (front-end framework decision is post-Alpha).
- Not the API contract (`api/openapi.yaml` is).
- Not a backlog (`PROGRAM_CONTROL/DIRECTIVES/` is).
