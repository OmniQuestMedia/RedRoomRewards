# MASTER BRIEFING – PLATFORM ARCHITECTURE (v2)
## XXXChatNow + Red Room Rewards™
### Speed • Efficiency • Security First

---

## 0. How to Read This Document (Important for Copilot)

This is the **authoritative architectural briefing**.

Rules:
- This document defines **boundaries and ownership**.
- Domain-specific add-on briefings define **feature implementation details**.
- No logic may cross domain boundaries unless explicitly stated.
- Speed, efficiency, and security take priority over feature richness.

Implementation files and modules MUST respect:
- Platform separation
- Deterministic financial logic
- Idempotency and auditability

---

## 1. Platform Overview

This ecosystem consists of **two core systems** and **one extensible games layer**.

### A. XXXChatNow (Core Platform)
Owns:
- Tokens
- Users and models
- Live rooms and broadcasts
- UI/UX, animations, sound, themes
- Games and interactive mechanics
- Lovense and hardware integrations

### B. Red Room Rewards™ (Loyalty Platform)
Owns:
- Loyalty points (only)
- Model promo wallets
- Expiry rules
- Ledgers and reconciliation
- Cross-site portability (future)

### C. Games Layer (XXXChatNow-owned)
Owns:
- Randomness
- Prize logic
- Presentation
- Odds and configurations
- Token spend logic

Games MAY:
- Call Red Room Rewards to move points
Games MAY NOT:
- Store or modify loyalty balances directly
- Embed business logic from loyalty

---

## 2. Architectural Principles

### 2.1 Speed
- <300ms target for all loyalty API calls
- Games must resolve prize outcomes independently of loyalty responses
- Loyalty failures must never block gameplay results

### 2.2 Efficiency
- Loyalty service uses ledger-based writes, derived read models
- Games calculate final outcomes before calling loyalty
- No duplicated logic between services

### 2.3 Security
- Server-to-server API keys or HMAC signing
- Strict permission boundaries (user / model / admin)
- All point movements recorded as immutable transactions
- Idempotent APIs for earning and redeeming

---

## 3. Ownership Matrix

| Capability | XXXChatNow | Red Room Rewards |
|---------|------------|------------------|
| Tokens | ✅ | ❌ |
| Games | ✅ | ❌ |
| Randomness | ✅ | ❌ |
| UI / Sound | ✅ | ❌ |
| Loyalty Points | ❌ | ✅ |
| Model Promo Wallets | ❌ | ✅ |
| Expiry Rules | ❌ | ✅ |
| Ledger / Audit | ❌ | ✅ |

---

## 4. Integration Contract (Critical)

### Allowed Calls from XXXChatNow → Red Room Rewards

- Award points to user (model-funded)
- Redeem points at checkout
- Purchase or grant model promo points
- Query balances and expiry warnings

### Forbidden Behaviors

- Red Room Rewards must not:
  - Know what game was played
  - Know prize wording or UI details
  - Decide multipliers based on visuals

Games send **facts only**, never logic.

---

## 5. Performance & Safety Guarantees

Required:
- DB-level transactions for all point movements
- Optimistic locking on wallets
- Graceful degradation if loyalty service unavailable
- Comprehensive audit logs

---

## 6. Development Guidance for Copilot

- Implement loyalty as a clean, testable service
- Treat points like money
- Treat games like ephemeral entertainment
- Favor clarity over cleverness
- Never mix randomness with financial logic

---

## 7. Documents That Extend This Brief

This master briefing is extended by:

- `REDROOM_REWARDS_UPDATE.md`
- `XXXCHATNOW_SLOT_MACHINE_UPDATE.md`

Those documents define **implementation**, this one defines **architecture**.

---

END OF MASTER BRIEFING
