# DECISIONS & ARCHITECTURAL RECORD — RedRoomRewards

This document logs major architectural, feature, and security decisions. Each entry notes the date, decision summary, and rationale.

---

## 2025-12-22

- **RedRoomRewards is a standalone service, NOT a fork of xxxchatnow.**
    - Social, video, image, and chat features from xxxchatnow are not to be present in this repo.

- **No user-to-user or model-to-user interaction.**
    - No messaging, discovery, connections, or social/entertainment logic.

- **No marketplace, commerce, or purchasing/posting features.**
    - No product, offer, item, or service listings or any “sales”-related modules.

- **User data boundaries are absolute.**
    - Each user may only create and maintain their own profile.
    - Users cannot see, search, browse, or connect to any other profile.

- **Point and balance transfers require administrative mediation.**
    - Users cannot transfer points/credits to each other via UI, API, or code except by formal admin workflows.

- **All code supporting forbidden features must be removed, not just disabled.**
    - No commented or dormant endpoints/modules left that could re-enable disallowed features.

- **Security, audit, and no-backdoor policies are authoritative.**
    - See `SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md` for mandatory enforcement details.
    - Any exceptions must be reviewed and documented in this file.

---

_Use this file as the single source of truth for project-wide decisions, constraints, and any future architecture or policy changes._
