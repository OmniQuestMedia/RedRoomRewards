# RedRoomRewards Slot Machine Feature Spec
Version: 1.0
Date: 2025-12-15
Status: Draft

## Executive Summary
Provide a Vegas-style slot machine for viewers during live broadcasts. All business logic, balances, and win determination is server-side and abuse-resistant.

## Goals, Non-Goals, Core User, Model, Admin Flows
(See briefing above; copy all key user stories, admin flows, real-time requirements, data models, rate/cooldown, idempotency, audit log immutability, API endpoints, and acceptance tests as outlined in your authoritative spec.)

## Non-Regression, Forward-Only Rules
- Never downgrade features.
- Server is always authoritative.
- No client-side win or deduction logic.
- All changes must add or extend existing capabilities unless explicit deprecation.

## Architecture, API, Real-Time, Data, Security, Testing, Docs
(Fully reference/expand each requirement—RNG, idempotency, event names, security, etc.—as in the provided spec.)

---

## Version History

- 1.0 - 2025-12-15 - Initial draft, cross-references COPILOT.md and engineering standards.
