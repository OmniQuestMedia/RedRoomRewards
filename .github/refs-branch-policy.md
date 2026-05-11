# Reference Branch Policy

**Project:** BUILD CONTROL - REWARDS (RRR) **Repo:**
OmniQuestMediaInc/RedRoomRewards **Authority:** Kevin B. Hartley, CEO —
OmniQuest Media Inc. **Established:** 2026-04-18

---

## What Are Reference Branches?

All branches prefixed with `refs/` are **PERMANENT READ-ONLY REFERENCE
LIBRARIES**. They contain cloned open-source repositories, research materials,
or internal reference content used by Grok and Copilot when authoring
directives. They are never deleted and never merged to main.

---

## Absolute Rules

- `refs/*` branches **NEVER** merge to main under any circumstances
- `refs/*` branches are never deleted
- `refs/*` content is never imported into RRR source files
- No `package.json`, `tsconfig`, or build config may reference `refs/*` content

---

## How Agents Read Reference Branch Files

```
git show refs/{category}/{branch-name}:{filepath}
```

**Examples:**

```
git show refs/oss/booking-api:prisma/schema.prisma
git show refs/oss/socketio-chat:app.js
git show refs/internal/design-system:tokens.json
```

---

## How to Reference in Directives

Add to the `CONTEXT` section of any directive:

```
REFERENCE: git show refs/{category}/{name}:{filepath}
```

---

## CI Enforcement

`.github/workflows/protect-ref-branches.yml` blocks any PR from a `refs/*`
branch targeting `main` automatically.
