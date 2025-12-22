# CLEANUP CHECKLIST — RedRoomRewards

This document tracks all features, files, modules, and logic inherited from the xxxchatnow stack that MUST be removed or audited out of this repository.

**Goal:** Ensure RedRoomRewards is strictly limited to isolated, auditable, self-profile and points logic, with NO leftover social, media, or marketplace code.

---

## Mandatory Feature/Module Removal

### 1. Media & Broadcasting
- [ ] All video broadcasting modules, streaming services, upload handlers.
- [ ] All image/picture/media uploading/download/display capabilities.
- [ ] All media/asset storage and related endpoints.

### 2. Social/Interactive Features
- [ ] “Goal” systems (collective progress, reward milestones, shared “goals”).
- [ ] Liking functionality (user likes, upvotes, hearts, etc.).
- [ ] Spinning wheel / chance-based game logic.
- [ ] User-to-user or “model-to-user” messaging (including chat, DMs, inboxes, notifications, public or private rooms).
- [ ] Any direct messaging, notification, or “shout” systems.

### 3. Market/Commerce Logic
- [ ] Product listing/posting UIs, APIs, DB models (including “offers,” “items,” or similar concepts).
- [ ] Purchase, checkout, payment, or “sales” features as implemented for xxxchatnow.
- [ ] Cart/wishlist, purchasing, or marketplace endpoints.
- [ ] Any product-discovery, store, or model-monetization logic.

### 4. Discovery/Social Browsing
- [ ] User directory, search, or “profile browsing” features.
- [ ] Any access to other user or “model” profiles (profile view endpoints, “people you may like,” etc.).
- [ ] Friends, following, or connection endpoints or UIs.
- [ ] Any code path that reveals another user’s existence except to admins.

---

## Other Areas for Audit

- [ ] Remove/disable all privileged, magic, or legacy admin backdoors.
- [ ] Remove integrations with video CDNs or chat providers.
- [ ] Confirm logging/audit does not record or expose sensitive data.
- [ ] Remove or rewrite legacy seeders, tests, or fixtures tied to old features.

---

## How to Use this List

Mark each item as complete when the module, API, endpoint, UI, or DB schema is purged. For ambiguous cases, escalate to architecture review.

---
