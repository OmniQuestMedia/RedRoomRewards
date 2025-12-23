# RedRoomRewards — Account Merge, Points Transfer, and Exception Policy (v1)

**Date:** 2025-12-23  
**Status:** Policy + enforcement requirements  
**Canonical Owner:** RedRoomRewards  
**Clients Impacted:** XXXChatNow (and future clients)

---

## 0. Purpose

This policy defines:

- When and how **points can be transferred** between members
- When and how **accounts can be merged**
- Required **verification**, **fraud controls**, **caps**, and **approval workflows**
- Audit, reversals, and retention requirements

Written to align with "safe first, auditable second, fast third."

---

## 1. Definitions

- **Member**: a consumer earning/redeeming points
- **Model Member**: a member identity used by a model (earns points; may award points)
- **Client Profile**: an identity in a client system (e.g., XCN user id)
- **Linked Profile**: a client profile attached to a member in RRR
- **Transfer**: member-to-member points movement
- **Award**: model-to-viewer points movement (subset of transfer; distinct caps)
- **Merge**: combining two RRR member accounts into one (with strict constraints)

---

## 2. Universal Constraints (applies across all clients)

1. **No silent merges.** All merges require explicit process and permanent audit log.
2. **No instant high-value transfers** by default; apply caps and cooling periods.
3. **One-to-one linking** between a given client profile and a given RRR account unless a formal merge resolves duplicates.
4. **Every exception** (manual points, overrides, reversals) must be attributable to an admin actor and reason code.
5. **Dispute-ready ledger**: transfers and merges must be traceable and reversible where policy permits.

---

## 3. Points Transfers (Member → Member)

### 3.1 Default Stance

- Transfers are **allowed only if enabled per client** and only after member meets minimum trust level.
- Otherwise transfers are **disabled** (or limited to "model awards" only).

### 3.2 Trust Levels (RRR-managed)

- **L0**: unverified
- **L1**: email verified + linked to at least one client profile
- **L2**: email + phone verified; no fraud flags
- **L3**: enhanced verification (optional; jurisdiction-dependent)

### 3.3 Transfer Eligibility (baseline)

- Sender must be **L2+**
- Account age **>= 14 days**
- No negative events in last **30 days**

### 3.4 Transfer Limits (baseline; configurable)

- Daily cap: **500 points**
- Weekly cap: **1,500 points**
- Single transfer cap: **250 points**
- Cooling period after first transfer: **24 hours**
- L3 may have higher caps.

### 3.5 Transfer Mechanics

RRR writes:

- `TRANSFER_OUT` (sender)
- `TRANSFER_IN` (receiver)
- shared `transfer_id` correlation

Optional **transfer escrow** may hold transfers if risk rules trigger.

### 3.6 Transfer Reversals

Permitted:

- within **24 hours** OR before receiver redeems those points, whichever occurs first
- by RRR admins only (or client admins if delegated), with mandatory reason codes

---

## 4. Model Awards (Model → Viewer) (XCN-critical)

### 4.1 Default Stance

Model awards are first-class, not identical to general transfers (abuse risk).

### 4.2 Eligibility

- Model must be linked as `MODEL`.
- Viewer must have linked RRR account; otherwise blocked.
- Viewer must be validated as "present in room/stream" by XCN session proof.

### 4.3 Model Award Limits (baseline)

- Per viewer per stream: **100 points**
- Per model per day: **2,000 points**
- Per model per hour: **400 points**
- Minimum award: **1 point**

### 4.4 Abuse Controls

Velocity checks by model, viewer, stream, and device cluster (hashed identifiers).
Triggered awards may be denied or placed into **award escrow**.

### 4.5 Audit Requirements

Store: model id, viewer id, stream/room ids, actor type, risk score (no raw PII).

---

## 5. Account Merges (Member A + Member B → Member A)

### 5.1 Default Stance

Merges are **rare** and controlled.

### 5.2 Merge Eligibility (hard constraints)

- Must satisfy "same individual" checks.
- Neither account under fraud lock.
- Both accounts have verifiable control evidence.
- Must not violate one-to-one client profile linking (see §5.5).

### 5.3 Evidence Requirements (baseline)

At least **2** of the following must match, and at least **1** must be strong:

Strong evidence:

- Verified email OTP + verified phone OTP
- Payment instrument fingerprint match (tokenized; no PAN stored)
- Government ID verification (optional; only where supported)

Supporting evidence:

- Device cluster match (hashed)
- Coarse region consistency
- Successful client SSO assertions

### 5.4 Merge Workflow (two-stage)

**Stage 1: Client ticket** (XCN or other client)  
Collect identifiers, reason, evidence attestations, and user acknowledgement.

**Stage 2: RRR execution**  
Approvals required:

- **2 XCN admins** (distinct) if XCN-linked accounts involved
- **1 RRR admin** (always)

RRR executes:

- ledger-safe consolidation
- expiry normalization rules
- link resolution

### 5.5 Link Resolution Rules (XCN-specific)

Because XCN disallows more than one profile per RRR member:

- Choose **one** XCN profile as surviving.
- Detach the other and permanently mark as "merged/retired" in RRR.
- XCN must also flag the retired profile internally to prevent re-linking without admin intervention.

### 5.6 Merge Mechanics (ledger-safe)

- Create a `MERGE` audit record (source, target, approvals, evidence summary)
- Move balances via `ADJUST` entries (no silent edits)
- Preserve original ledger history

---

## 6. Manual Adjustments and Customer Service Credits

### 6.1 Default Stance

Allowed, but controlled and audited.

### 6.2 Approval Thresholds (baseline)

- <= 100 points: 1 XCN admin (or delegated role)
- 101–500 points: **2 XCN admins**
- > 500 points: **2 XCN admins + 1 RRR admin**

All adjustments require:

- reason_code enum
- ticket/reference id
- private admin note

---

## 7. Expiry and Liability Implications

- Cash-earned: default expiry **365 days** from purchase date.
- Promo/gift: **30–90 days** as set by campaign policy.
- Transfers do **not** extend expiry by default.
- Liability reporting counts transfers within outstanding liability.

---

## 8. Holds, Locks, and Enforcement

RRR may place:

- **Transfer lock**
- **Redemption lock**
- **Full account lock**

Locks are reason-coded, time-bounded where possible, and visible to admins.

---

## 9. Retention and Privacy

- Hot data: 120 days
- Archive: 7 years
- Audit logs immutable, append-only
- No raw PII in logs; hashed/opaque identifiers only

---

## 10. Repo Responsibilities

### 10.1 RedRoomRewards (canonical enforcement)

Owns trust levels, caps, velocity rules, merge execution, and authorization gates.

### 10.2 XXXChatNow (client enforcement + UX)

Prevents multi-linking attempts, routes merge requests into ticket flow, respects RRR locks, uses idempotency + correlation IDs.

---

## 11. Open Policy Knobs (configurable later)

- Transfer caps by XCN membership tier
- Whether general member transfers are enabled at all
- Expiry lot tracking vs simplified expiry strategy
- Whether model award points must come from a dedicated "model promo wallet"

---

## Related Documentation

- [RRR Loyalty Engine Specification v1.1](./RRR_LOYALTY_ENGINE_SPEC_v1.1.md)
- [Universal Architecture](./UNIVERSAL_ARCHITECTURE.md)
- [Copilot Governance](/COPILOT_GOVERNANCE.md)
- [Security Policy](/SECURITY.md)

---

**Version History:**

- v1.0 (2025-12-23): Initial policy release
