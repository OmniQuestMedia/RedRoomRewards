# Policy Enforcement Implementation Guide

**Date:** 2025-12-23  
**Status:** Implementation Guide  
**Policy:** [ACCOUNT_MERGE_TRANSFER_POLICY_v1.md](./ACCOUNT_MERGE_TRANSFER_POLICY_v1.md)

---

## Overview

This guide outlines how the Account Merge, Points Transfer, and Exception Policy will be enforced in the RedRoomRewards platform. It bridges the policy requirements with the technical implementation.

---

## 1. Trust Level Enforcement

### Trust Level Determination

Trust levels are evaluated based on:

- **L0 (Unverified)**: Default state
  - No transfers allowed
  - No redemptions (if policy requires minimum level)

- **L1 (Basic)**:
  - Email verified
  - At least one linked client profile
  - Limited operations

- **L2 (Standard)**:
  - Email AND phone verified
  - No active fraud flags
  - **Required for transfers** (sender)
  - Account age >= 14 days
  - No negative events in last 30 days

- **L3 (Enhanced)**:
  - Optional enhanced verification
  - Jurisdiction-dependent
  - Higher transfer caps

### Implementation Points

- Trust level is evaluated **before** every transfer operation
- Real-time checks against fraud flags and negative events
- Account age calculated from `createdAt` timestamp
- Async jobs can re-evaluate trust levels periodically

---

## 2. Transfer Limits Enforcement

### Configurable Limits (per Trust Level)

Default baseline for L2 (per policy §3.4):

```yaml
dailyCapPoints: 500
weeklyCapPoints: 1500
singleTransferCapPoints: 250
coolingPeriodHours: 24
```

### Enforcement Logic

**Pre-transfer validation:**

1. Check sender trust level >= L2
2. Check account age >= 14 days
3. Check no negative events in last 30 days
4. Calculate existing transfers in period (24h, 7d)
5. Verify requested amount within caps
6. Check cooling period elapsed since last transfer

**Transaction flow:**

```
User initiates transfer
  → Validate trust level & eligibility
  → Check limits (daily, weekly, single)
  → Check cooling period
  → Create Transfer record (status: pending)
  → Run risk evaluation
    → If high risk: status = escrowed, notify admins
    → If low risk: status = completed
  → Create ledger entries (TRANSFER_OUT, TRANSFER_IN)
  → Update wallet balances atomically
  → Return success
```

### Database Queries

```javascript
// Check daily limit
const todayTransfers = await Transfer.aggregate([
  {
    $match: {
      'sender.userId': userId,
      createdAt: { $gte: startOfDay, $lte: now },
      status: { $in: ['completed', 'escrowed'] }
    }
  },
  { $group: { _id: null, total: { $sum: '$amount' } } }
]);

// Check last transfer for cooling period
const lastTransfer = await Transfer.findOne(
  { 'sender.userId': userId, status: 'completed' },
  null,
  { sort: { createdAt: -1 } }
);
```

---

## 3. Model Award Enforcement

### Limits (per policy §4.3)

```yaml
perViewerPerStreamPoints: 100
perModelPerDayPoints: 2000
perModelPerHourPoints: 400
minimumAwardPoints: 1
```

### Validation Requirements

**Pre-award validation:**

1. Verify model is linked with role = MODEL
2. Verify viewer has linked RRR account
3. **Validate viewer presence in stream** (session proof from XCN)
4. Check per-viewer-per-stream limit
5. Check per-model-per-hour limit
6. Check per-model-per-day limit

### Session Proof Verification

XCN must provide session proof in request:

```json
{
  "streamContext": {
    "streamId": "stream-123",
    "roomId": "room-456",
    "sessionProof": "signed-jwt-token"
  }
}
```

RRR validates:

- JWT signature (shared secret with XCN)
- Session is currently active
- Viewer user ID matches session
- Timestamp within acceptable window

### Velocity Checks

Track awards by:

- `(model, viewer, stream)` tuple
- `(model, day)` aggregate
- `(model, hour)` aggregate
- Device cluster hashes (if available)

Flag suspicious patterns:

- Same model awarding to same viewer repeatedly
- Sudden spike in awards from one model
- Circular award patterns

---

## 4. Transfer Reversals

### Policy Constraints (§3.6)

Reversals permitted:

- Within **24 hours** of transfer, OR
- Before receiver redeems any of those points

Whichever occurs **first**.

### Implementation

**Reversal eligibility check:**

```javascript
function canReverse(transfer) {
  const now = new Date();
  const transferTime = new Date(transfer.createdAt);
  const hoursSince = (now - transferTime) / (1000 * 60 * 60);

  // Check time window
  if (hoursSince > 24) {
    return { allowed: false, reason: 'Outside 24-hour window' };
  }

  // Check if receiver has redeemed
  const receiverRedemptions = await findRedemptionsAfter(
    transfer.receiver.userId,
    transferTime
  );

  if (receiverRedemptions.length > 0) {
    return { allowed: false, reason: 'Receiver has already redeemed points' };
  }

  return { allowed: true };
}
```

**Reversal process:**

1. Validate reversal eligibility
2. Require admin authentication
3. Require reason code (enum)
4. Create reverse ledger entries
5. Update Transfer record (status = reversed, reversedAt, reversalReason)
6. Adjust wallet balances atomically
7. Log audit trail

---

## 5. Account Merge Workflow

### Two-Stage Process (§5.4)

**Stage 1: Client Ticket (XCN side)**

- User initiates merge request via XCN support
- XCN collects: both user IDs, reason, evidence
- XCN validates user acknowledgement
- XCN creates support ticket
- XCN admins review and provide 2 approvals
- XCN forwards to RRR with ticket ID

**Stage 2: RRR Execution**

```javascript
async function executeMerge(request) {
  // Validate approvals
  validateApprovals(request.approvals); // 2 XCN + 1 RRR

  // Check eligibility
  await checkMergeEligibility(request.sourceUserId, request.targetUserId);

  // Validate evidence
  validateEvidence(request.evidenceSummary); // 2+ types, 1+ strong

  // Begin transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Create merge audit record
    const merge = await AccountMerge.create({
      sourceAccount: { userId: request.sourceUserId, ... },
      targetAccount: { userId: request.targetUserId, ... },
      evidenceSummary: request.evidenceSummary,
      approvals: request.approvals,
      status: 'pending'
    });

    // Transfer balances via ADJUST entries
    await transferBalances(request.sourceUserId, request.targetUserId);

    // Resolve links (mark source links as retired)
    await resolveLinking(request.sourceUserId, request.targetUserId);

    // Update merge status
    merge.status = 'completed';
    merge.completedAt = new Date();
    await merge.save();

    await session.commitTransaction();
    return merge;

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

### Evidence Validation

Minimum requirements (§5.3):

- At least **2 evidence types** total
- At least **1 strong evidence** type

Strong evidence:

- Email OTP + Phone OTP (both verified)
- Payment instrument fingerprint match
- Government ID verification

Supporting evidence:

- Device cluster match
- Region consistency
- Client SSO assertions

---

## 6. Manual Adjustment Approval Thresholds

### Policy Thresholds (§6.2)

```yaml
# Points amount → Required approvals
0-100:     1 XCN admin
101-500:   2 XCN admins
501+:      2 XCN admins + 1 RRR admin
```

### Implementation

**Pre-adjustment validation:**

```javascript
function getRequiredApprovals(amount) {
  const absAmount = Math.abs(amount);

  if (absAmount <= 100) {
    return { xcnAdmins: 1, rrrAdmins: 0 };
  } else if (absAmount <= 500) {
    return { xcnAdmins: 2, rrrAdmins: 0 };
  } else {
    return { xcnAdmins: 2, rrrAdmins: 1 };
  }
}

function validateApprovals(adjustment) {
  const required = getRequiredApprovals(adjustment.amount);
  const xcnCount = adjustment.approvals.filter(a => a.role === 'xcn_admin').length;
  const rrrCount = adjustment.approvals.filter(a => a.role === 'rrr_admin').length;

  if (xcnCount < required.xcnAdmins || rrrCount < required.rrrAdmins) {
    throw new Error('Insufficient approvals');
  }

  // Verify admins are distinct
  const adminIds = adjustment.approvals.map(a => a.adminId);
  if (new Set(adminIds).size !== adminIds.length) {
    throw new Error('Duplicate admin approvals not allowed');
  }
}
```

**Required fields:**

- `reasonCode` (enum)
- `ticketId` (support ticket reference)
- `adminNote` (internal note, not visible to user)
- `approvals` array with sufficient approvers

---

## 7. Account Locks

### Lock Types (§8)

- `transfer`: Block transfers only
- `redemption`: Block redemptions only
- `full_account`: Block all operations

### Enforcement

Locks are checked at API layer before operations:

```javascript
async function checkLocks(userId, operationType) {
  const activeLocks = await AccountLock.find({
    userId,
    active: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gte: new Date() } }
    ]
  });

  for (const lock of activeLocks) {
    if (lock.lockType === 'full_account') {
      throw new ForbiddenError('Account is locked');
    }

    if (operationType === 'transfer' && lock.lockType === 'transfer') {
      throw new ForbiddenError('Transfers are locked');
    }

    if (operationType === 'redemption' && lock.lockType === 'redemption') {
      throw new ForbiddenError('Redemptions are locked');
    }
  }
}
```

Locks must:

- Have reason code (enum)
- Be time-bounded where possible
- Be visible to admins
- Support unlock by admins with reason

---

## 8. Audit and Retention

### Audit Requirements (§9)

**Every operation must record:**

- Correlation ID (for tracing)
- Idempotency key (for deduplication)
- User IDs (opaque identifiers only)
- Amounts and balances
- Timestamp
- Reason codes
- Admin IDs (for admin actions)
- Hashed metadata (IP, device, etc.)

**Immutability:**

- Ledger entries are append-only
- No updates or deletes
- Corrections are new entries
- Audit records cannot be modified

**Retention:**

- Hot data: 120 days
- Archive: 7 years
- No raw PII (hash/tokenize)

---

## 9. Integration with XXXChatNow

### XCN Responsibilities

Per policy §10.2:

- Prevent multi-linking attempts at UI layer
- Route merge requests through ticket system
- Respect RRR locks (check before operations)
- Use idempotency keys for all requests
- Use correlation IDs for tracing
- Provide session proofs for model awards

### RRR Responsibilities

Per policy §10.1:

- Enforce trust levels
- Apply caps and velocity rules
- Execute merges with approval gates
- Provide lock status in API responses
- Validate all inputs server-side

---

## 10. Security Considerations

### No Raw PII in Logs

- IP addresses → SHA256 hash
- Device fingerprints → hash
- Email/phone → opaque IDs only
- Payment instruments → tokenized

### Replay Protection

- All mutating operations require idempotency keys
- Idempotency keys stored with TTL (e.g., 24 hours)
- Duplicate requests return cached result

### Rate Limiting

- By user ID
- By IP address
- By API key (for client systems)

### Admin Authorization

- All admin endpoints require JWT with admin role
- Admin actions logged with admin ID
- No shared admin accounts

---

## Related Documentation

- [Account Merge & Transfer Policy v1](./ACCOUNT_MERGE_TRANSFER_POLICY_v1.md)
- [Data Models: Transfers and Merges](./DATA_MODELS_TRANSFERS_MERGES_v1.md)
- [RRR Loyalty Engine Specification v1.1](./RRR_LOYALTY_ENGINE_SPEC_v1.1.md)
- [OpenAPI Contract](/api/openapi.yaml)

---

**Version History:**

- v1.0 (2025-12-23): Initial enforcement guide
