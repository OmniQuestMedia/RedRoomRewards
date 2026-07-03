# WO-011 — ZK Oracle Architecture (Research Spike)

**Work Order:** WO-011  
**Type:** Research Spike + Proof-of-Concept  
**Status:** SPIKE — Not production-ready. Architecture only.  
**Authority:** Kevin B. Hartley, CEO — OmniQuest Media Inc.  
**Date:** 2026-04-24  
**Governs:** OmniQuestMedia/RedRoomRewards

---

## 1. Purpose

A **ZK Oracle** (Zero-Knowledge Oracle) is a privacy-preserving verification
layer that allows the loyalty platform to prove claims about member state —
balance sufficiency, tier status, earn eligibility, fraud score outcome —
**without revealing the underlying sensitive data** to external parties.

This research spike defines:

1. The threat model and privacy goals.
2. The canonical ZK Oracle interface for RedRoomRewards.
3. Three prioritised circuit designs.
4. Integration points within the existing service architecture.
5. A minimal TypeScript PoC (see `src/zk-oracle/`).
6. Recommended production library path.

---

## 2. Threat Model and Privacy Goals

### 2.1 What we want to prove without revealing

| Claim               | Private input                   | Public statement                          |
| ------------------- | ------------------------------- | ----------------------------------------- |
| Balance sufficiency | Exact balance (e.g. 12,450 pts) | Balance ≥ threshold (e.g. ≥ 1,000 pts)    |
| Tier status         | Lifetime earning history        | Member is ≥ RED_PASSION tier              |
| Earn eligibility    | Product purchase details        | Purchase qualifies for points             |
| WGS fraud gate      | Full WGS score model output     | Score action is PASS                      |
| Unique redemption   | Full ledger history             | Redemption `idempotency_key` not yet used |

### 2.2 Adversary model

- **External partner APIs** — ChatNow.Zone, RedRoomPleasures, Cyrano — should
  receive proofs, not raw balances or ledger dumps.
- **Audit regulators** — should be able to verify correctness of a claimed
  payout without seeing unrelated member data.
- **Claude Code droid / AI agents** — should not have direct read access to
  member balances during test runs; proofs should be verifiable in CI.

### 2.3 Out of scope for this spike

- On-chain commitment (blockchain anchor) — deferred.
- Real-time streaming proofs — deferred.
- Multi-party computation — deferred.

---

## 3. Canonical ZK Oracle Interface

```typescript
// FILE: src/zk-oracle/zk-oracle.types.ts

/** A cryptographic commitment to a private value */
interface Commitment {
  value: string; // hex-encoded commitment (hash of secret + nonce)
  nonce: string; // random nonce used in commitment
  algorithm: 'sha256'; // extensible to Pedersen etc.
}

/** A range proof: proves private_value >= threshold */
interface RangeProof {
  commitment: Commitment;
  threshold: number;
  proof: string; // hex-encoded proof blob
  verifierKey: string; // public verifier key (circuit-specific)
  circuitId: CircuitId;
}

/** Supported circuit identifiers */
enum CircuitId {
  BALANCE_RANGE = 'balance_range_v1',
  TIER_MEMBERSHIP = 'tier_membership_v1',
  WGS_PASS_GATE = 'wgs_pass_gate_v1',
}

/** Result of verifying a proof */
interface VerifyResult {
  valid: boolean;
  circuitId: CircuitId;
  claimedThreshold: number;
  verifiedAt: Date;
  error?: string;
}
```

---

## 4. Circuit Designs (Prioritised)

### Circuit 1 — `balance_range_v1` (P0 — required for redemption API)

**Goal:** Prove `balance >= threshold` without revealing `balance`.

**Arithmetic circuit sketch:**

```
Private inputs:   balance (integer), nonce (256-bit random)
Public inputs:    threshold (integer), commitment C

Constraints:
  1. C == SHA256(balance || nonce)          // commitment binds to balance
  2. balance - threshold >= 0              // range check (balance >= threshold)
  3. balance >= 0                          // no negative balance exploit

Verifier:
  Given (C, threshold, proof), verify:
    - proof is valid for circuit balance_range_v1
    - C matches the commitment the prover registered
    - threshold == claimed threshold
```

**Prototype simplification (this spike):** Uses SHA-256 commitments + HMAC-based
range attestation (not a true ZK-SNARK). The interface is identical so the
production Circom circuit can be a drop-in.

**Estimated production cost per proof (snarkjs Groth16):**

- Prove: ~200 ms (client-side)
- Verify: ~5 ms (server-side)

---

### Circuit 2 — `tier_membership_v1` (P1)

**Goal:** Prove member tier ≥ `RED_PASSION` without revealing lifetime points.

**Additional circuit constraint:**

```
  3. tier_from_points(balance) >= claimed_tier
```

Where `tier_from_points` is a lookup using threshold constants (0, 5000,
25000, 100000) encoded as circuit constants.

---

### Circuit 3 — `wgs_pass_gate_v1` (P2 — deferred)

**Goal:** Prove WGS action == PASS without revealing fraud/welfare score values.

Requires WO-006 production model to be wired first. Deferred until WO-006 exits
prototype stub phase.

---

## 5. Integration with Existing Services

```
RedRoomLedgerService
        │
        │  private balance
        ▼
ZkOracleService.generateRangeProof(balance, threshold)
        │
        │  RangeProof (public)
        ▼
External partner / BurnCatalogService.verifyRedemptionProof(proof)
        │
        │  VerifyResult
        ▼
Redemption approved / rejected
```

### 5.1 Redemption flow with ZK Oracle (target architecture)

1. Member requests redemption.
2. `BurnCatalogService` asks `ZkOracleService` to generate a range proof:
   `proof = zkOracle.generateRangeProof(balance, requiredPoints)`
3. Proof is sent to partner API alongside the redemption request.
4. Partner API verifies proof locally — no balance data ever leaves the
   platform.
5. `BurnCatalogService` records ledger entry as normal.

### 5.2 Audit trail

Each proof generation writes an audit record:

- `proof_id` (UUID)
- `circuit_id`
- `threshold` (public — not the balance)
- `commitment` (public — binds to the real balance cryptographically)
- `generated_at`

The ledger entry references `proof_id` via `correlation_id`.

---

## 6. Prototype PoC (`src/zk-oracle/`)

The PoC ships with this spike. It simulates the ZK Oracle interface using:

- **SHA-256 commitments** (standard Node.js `crypto`)
- **HMAC-based range attestation** (proves knowledge of a value that satisfies
  the range constraint, bound to the commitment)
- **No external dependencies** — installable with the existing `package.json`

The PoC is not cryptographically secure as a ZK proof (it does not hide the
balance against an adversary who knows the nonce). Its purpose is to:

1. Define the stable TypeScript interface for production replacement.
2. Allow integration tests to run in CI without ZK library dependencies.
3. Demonstrate the proof generation → verification round-trip.

---

## 7. Production Library Path

Recommended stack for production:

| Component         | Library                   | Notes                                 |
| ----------------- | ------------------------- | ------------------------------------- |
| Circuit language  | Circom 2.x                | Arithmetic circuit DSL                |
| Proof system      | Groth16 (snarkjs)         | Fast client-side prove + cheap verify |
| Commitment scheme | Poseidon hash             | ZK-friendly; replace SHA-256 in prod  |
| Trusted setup     | Powers of Tau (perpetual) | Reuse existing ceremony               |

**npm packages to add at production phase:**

```json
"snarkjs": "^0.7.x",
"circomlibjs": "^0.1.x"
```

These are NOT added in this spike (prototype only uses Node.js builtins).

---

## 8. Open Questions (for CEO / Architecture Review)

| Q   | Detail                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------- |
| Q1  | Do external partners need on-chain verification (blockchain anchor), or is server-side proof sufficient? |
| Q2  | Which partners receive ZK proofs in Phase 1 (RedRoomPleasures, Cyrano) vs Phase 2 (ChatNow.Zone)?        |
| Q3  | Should proof generation happen client-side (browser WASM) or server-side (Node.js)?                      |
| Q4  | WGS pass-gate circuit requires WO-006 production model — confirm sequencing.                             |

---

## 9. References

- Circom documentation: https://docs.circom.io/
- snarkjs: https://github.com/iden3/snarkjs
- Groth16 paper: Groth 2016, "On the Size of Pairing-based Non-interactive
  Arguments"
- ZK for loyalty programs: prior art search recommended before production
  implementation

---

_End of WO-011 Architecture Document_
