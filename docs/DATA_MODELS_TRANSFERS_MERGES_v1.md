# Data Models: Transfers, Merges, and Trust Levels (v1)

**Date:** 2025-12-23  
**Status:** Specification - Implementation Pending  
**Related Policy:** [ACCOUNT_MERGE_TRANSFER_POLICY_v1.md](./ACCOUNT_MERGE_TRANSFER_POLICY_v1.md)

---

## Overview

This document specifies the data models required to implement the Account Merge, Points Transfer, and Exception Policy. These models extend the core loyalty engine schema defined in [RRR_LOYALTY_ENGINE_SPEC_v1.1.md](./RRR_LOYALTY_ENGINE_SPEC_v1.1.md).

**Status Note:** RedRoomRewards is currently in the scaffolding phase (v0.1.0). These models are specifications for future implementation.

---

## 1. Trust Level System

### TrustLevel (embedded in LoyaltyAccount)

```typescript
{
  loyaltyAccountId: string,           // PK from LoyaltyAccount
  trustLevel: 'L0' | 'L1' | 'L2' | 'L3',
  verification: {
    emailVerified: boolean,
    emailVerifiedAt?: timestamp,
    phoneVerified: boolean,
    phoneVerifiedAt?: timestamp,
    enhancedVerificationCompleted?: boolean,
    enhancedVerificationAt?: timestamp,
    governmentIdVerified?: boolean,    // Optional, jurisdiction-dependent
    governmentIdVerifiedAt?: timestamp
  },
  linkedProfiles: Array<{
    clientId: string,                  // e.g., 'XXXChatNow'
    profileId: string,                 // User ID in client system
    role: 'CONSUMER' | 'MODEL',
    linkedAt: timestamp,
    status: 'active' | 'retired'       // retired after merge
  }>,
  accountAge: number,                  // Days since creation
  fraudFlags: Array<{
    flagType: string,
    flaggedAt: timestamp,
    resolvedAt?: timestamp,
    severity: 'low' | 'medium' | 'high'
  }>,
  negativeEvents: Array<{
    eventType: string,
    occurredAt: timestamp,
    description: string
  }>,
  lastEvaluatedAt: timestamp
}
```

### Trust Level Evaluation Rules

Per policy §3.2:

- **L0**: Default for new accounts (unverified)
- **L1**: Email verified + at least one linked client profile
- **L2**: Email + phone verified; no fraud flags
- **L3**: Enhanced verification (optional; jurisdiction-dependent)

---

## 2. Points Transfer Models

### Transfer

Primary ledger entry for all member-to-member transfers.

```typescript
{
  transferId: string,                  // PK, UUID
  type: 'GENERAL_TRANSFER' | 'MODEL_AWARD',
  status: 'completed' | 'escrowed' | 'reversed' | 'pending',
  
  sender: {
    userId: string,
    trustLevel: string,
    previousBalance: number,
    newBalance: number
  },
  
  receiver: {
    userId: string,
    previousBalance: number,
    newBalance: number
  },
  
  amount: number,                      // Points transferred
  reason: string,                      // Reason code
  
  // Model award specific fields
  modelAwardContext?: {
    streamId: string,
    roomId: string,
    sessionProof?: string,
    viewerPresenceValidated: boolean
  },
  
  // Ledger correlation
  ledgerEntries: {
    senderEntryId: string,             // TRANSFER_OUT
    receiverEntryId: string,           // TRANSFER_IN
    correlationId: string              // Shared correlation
  },
  
  // Reversal tracking
  reversible: boolean,
  reversibleUntil: timestamp,
  reversedAt?: timestamp,
  reversalReason?: string,
  reversalBy?: string,                 // Admin ID
  
  // Velocity and abuse controls
  riskScore?: number,
  escrowReason?: string,
  escrowReleasedAt?: timestamp,
  
  // Audit
  createdAt: timestamp,
  metadata: {
    ipAddress?: string,                // Hashed
    deviceFingerprint?: string,        // Hashed
    clientId?: string
  }
}
```

### TransferLimit (config table)

Configurable limits per trust level and client.

```typescript
{
  configId: string,                    // PK
  clientId: string,
  trustLevel: 'L0' | 'L1' | 'L2' | 'L3',
  
  limits: {
    dailyCapPoints: number,            // Default: 500 for L2
    weeklyCapPoints: number,           // Default: 1500 for L2
    singleTransferCapPoints: number,   // Default: 250 for L2
    coolingPeriodHours: number         // Default: 24
  },
  
  modelAwardLimits: {
    perViewerPerStreamPoints: number,  // Default: 100
    perModelPerDayPoints: number,      // Default: 2000
    perModelPerHourPoints: number,     // Default: 400
    minimumAwardPoints: number         // Default: 1
  },
  
  effectiveStartAt: timestamp,
  effectiveEndAt?: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### TransferEscrow

Holds for suspicious transfers pending review.

```typescript
{
  escrowId: string,                    // PK
  transferId: string,                  // FK to Transfer
  reason: string,
  riskScore: number,
  
  escrowedAt: timestamp,
  reviewRequired: boolean,
  reviewedBy?: string,                 // Admin ID
  reviewedAt?: timestamp,
  resolution: 'released' | 'cancelled' | 'pending',
  
  expiryTimestamp: timestamp,          // Auto-release after N hours
  metadata: object
}
```

---

## 3. Account Merge Models

### AccountMerge

Primary record for account merge operations.

```typescript
{
  mergeId: string,                     // PK, UUID
  status: 'pending' | 'completed' | 'failed' | 'rejected',
  
  sourceAccount: {
    userId: string,                    // Account being merged from (retired)
    balanceAtMerge: number,
    linkedProfiles: Array<{
      clientId: string,
      profileId: string,
      status: 'active' | 'retired'
    }>
  },
  
  targetAccount: {
    userId: string,                    // Surviving account
    balanceBeforeMerge: number,
    balanceAfterMerge: number,
    linkedProfiles: Array<{
      clientId: string,
      profileId: string
    }>
  },
  
  // Evidence summary (no raw PII)
  evidenceSummary: {
    evidenceTypes: Array<string>,      // enum values
    strongEvidenceCount: number,       // Must be >= 1
    totalEvidenceCount: number,        // Must be >= 2
    evidenceHash: string               // Hash of evidence for audit
  },
  
  // Multi-admin approvals
  approvals: Array<{
    adminId: string,
    role: 'xcn_admin' | 'rrr_admin',
    approvedAt: timestamp,
    adminNote?: string
  }>,
  
  // User consent
  userConsent: {
    consentGiven: boolean,
    consentTimestamp: timestamp,
    consentMethod: string              // 'email_link', 'sms_otp', etc.
  },
  
  // Link resolution (per policy §5.5)
  linkResolution: {
    survivingClientProfiles: Array<{
      clientId: string,
      profileId: string
    }>,
    retiredClientProfiles: Array<{
      clientId: string,
      profileId: string,
      retiredAt: timestamp
    }>
  },
  
  // Ledger correlation
  ledgerEntries: Array<string>,        // IDs of ADJUST entries
  mergeAuditRecordId: string,          // ID of MERGE audit record
  
  // Ticket reference
  clientTicketId?: string,
  
  // Timestamps
  requestedAt: timestamp,
  completedAt?: timestamp,
  failedAt?: timestamp,
  failureReason?: string,
  
  // Audit metadata (no raw PII)
  metadata: {
    requestedByAdminId: string,
    executedByAdminId?: string,
    ipAddressHash?: string
  }
}
```

### MergeEvidence (supporting table, optional)

```typescript
{
  evidenceId: string,                  // PK
  mergeId: string,                     // FK to AccountMerge
  evidenceType: 'verified_email' | 'verified_phone' | 'payment_fingerprint' | 
                'device_cluster' | 'region_consistency' | 'client_sso' | 'government_id',
  isStrong: boolean,
  
  // Evidence data (tokenized/hashed, no raw PII)
  evidenceHash: string,
  matchConfidence: number,             // 0-100 score
  
  verifiedAt: timestamp,
  verifiedBy?: string,                 // Admin or system
  
  metadata: object                     // Additional context (no PII)
}
```

---

## 4. Manual Adjustments and Exceptions

### ManualAdjustment

Records for admin-initiated point adjustments.

```typescript
{
  adjustmentId: string,                // PK, UUID
  userId: string,
  amount: number,                      // Positive = credit, negative = debit
  
  reasonCode: 'customer_service' | 'compensation' | 'correction' | 
              'promotional' | 'fraud_recovery',
  
  // Approval tracking
  approvals: Array<{
    adminId: string,
    role: string,
    approvedAt: timestamp
  }>,
  requiredApprovalCount: number,       // Based on amount thresholds
  
  // Ticket reference
  ticketId: string,                    // Required
  adminNote: string,                   // Internal note (not user-visible)
  
  // Ledger correlation
  ledgerEntryId: string,               // ID of ADJUST ledger entry
  
  // Timestamps
  requestedAt: timestamp,
  approvedAt?: timestamp,
  executedAt?: timestamp,
  status: 'pending' | 'approved' | 'rejected' | 'executed',
  
  // Audit
  metadata: {
    requestedByAdminId: string,
    executedByAdminId?: string,
    ipAddressHash?: string
  }
}
```

### ApprovalThreshold (config table)

Defines approval requirements per policy §6.2.

```typescript
{
  thresholdId: string,                 // PK
  clientId: string,
  
  thresholds: Array<{
    minPoints: number,
    maxPoints: number,
    requiredXcnAdmins: number,
    requiredRrrAdmins: number,
    description: string
  }>,
  
  // Default thresholds per policy:
  // <= 100: 1 XCN admin
  // 101-500: 2 XCN admins
  // > 500: 2 XCN admins + 1 RRR admin
  
  effectiveStartAt: timestamp,
  effectiveEndAt?: timestamp
}
```

---

## 5. Account Locks

### AccountLock

```typescript
{
  lockId: string,                      // PK
  userId: string,
  lockType: 'transfer' | 'redemption' | 'full_account',
  
  active: boolean,
  reasonCode: 'fraud_suspected' | 'chargeback' | 'dispute' | 
              'policy_violation' | 'user_request' | 'investigation',
  
  appliedBy: string,                   // Admin ID
  appliedAt: timestamp,
  expiresAt?: timestamp,               // null = indefinite
  
  unlocked: boolean,
  unlockedBy?: string,                 // Admin ID
  unlockedAt?: timestamp,
  unlockReason?: string,
  
  adminNote: string,
  metadata: object
}
```

---

## 6. Ledger Entry Extensions

### Extended LedgerEntry event_type values

In addition to existing types from RRR_LOYALTY_ENGINE_SPEC_v1.1.md, add:

- `TRANSFER_OUT` - Points sent in transfer (sender)
- `TRANSFER_IN` - Points received in transfer (receiver)
- `TRANSFER_REVERSED` - Transfer reversal entry
- `MODEL_AWARD` - Model gift to viewer (subset of transfer)
- `MERGE` - Account merge consolidation
- `ADJUST` - Manual adjustment entry

### Correlation Pattern

All transfer operations create two ledger entries with shared `correlation_id`:

```typescript
// Sender entry
{
  ledger_id: uuid(),
  event_type: 'TRANSFER_OUT',
  wallet_id: senderWalletId,
  points_delta: -amount,
  correlation_id: transferId,
  metadata: { transferId, receiverId, ... }
}

// Receiver entry
{
  ledger_id: uuid(),
  event_type: 'TRANSFER_IN',
  wallet_id: receiverWalletId,
  points_delta: +amount,
  correlation_id: transferId,
  metadata: { transferId, senderId, ... }
}
```

---

## 7. Privacy and Retention

Per policy §9:

- **Hot data**: 120 days in primary storage
- **Archive**: 7 years in cold storage
- **Audit logs**: Immutable, append-only
- **PII**: No raw PII in logs; use hashed/opaque identifiers only

### Data to Hash/Tokenize

- IP addresses → SHA256 hash
- Device fingerprints → hash
- Email addresses → opaque IDs only (verification status stored separately)
- Phone numbers → opaque IDs only
- Payment instruments → tokenized fingerprints (no PAN)

---

## 8. Implementation Notes

### Phase 1: Core Transfer System

- Implement `Transfer` model
- Add `TransferLimit` config
- Extend `LedgerEntry` with new event types
- Add trust level tracking to `LoyaltyAccount`

### Phase 2: Model Awards

- Add model award validation
- Implement session proof verification
- Add velocity checks for abuse controls

### Phase 3: Account Merges

- Implement `AccountMerge` workflow
- Add multi-admin approval system
- Implement link resolution logic
- Add merge audit records

### Phase 4: Admin Controls

- Implement `ManualAdjustment` with approval thresholds
- Add `AccountLock` system
- Implement transfer reversal logic

---

## Related Documentation

- [Account Merge & Transfer Policy v1](./ACCOUNT_MERGE_TRANSFER_POLICY_v1.md)
- [RRR Loyalty Engine Specification v1.1](./RRR_LOYALTY_ENGINE_SPEC_v1.1.md)
- [OpenAPI Contract](/api/openapi.yaml)
- [Universal Architecture](./UNIVERSAL_ARCHITECTURE.md)

---

**Version History:**

- v1.0 (2025-12-23): Initial data model specification
