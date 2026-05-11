# WORK-ORDER.md — RedRoomRewards

**Project:** Loyalty & Rewards Engine (Adult Cam Ecosystem)  
**Status:** Phase 0 — Housekeeping & Policy Alignment (IN PROGRESS)  
**Governance:** OQMI_GOVERNANCE.md +
**OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md (v1.0 — 2026-05-06)**  
**All financial/ledger paths = FIZ commit format.**

## Phase 0: Cleanup & Housekeeping (Est: 1-2 days) — **EXECUTE NOW**

- [x] **Add Sovereign Infrastructure & Security Policy** (Critical —
      Non-negotiable)  
       `OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md` created at **repo root**
      (v1.0, effective 2026-05-06).  
       `README.md` and `SECURITY.md` updated to reference it as **authoritative
      sovereign document**.

- [x] **Create / Overwrite WORK-ORDER.md** with this full document
      (self-referential).

- [x] **Archive Noise & Final Cleanup** (leverage existing CLEANUP.md):
  - Confirmed no files >6 months untouched outside `archive/` per CLEANUP.md
    audit (2026-04-22).
  - Legacy policy fragments in `archive/legacy-2025/` (covered by CLEANUP.md).
  - `.gitignore` updated for Canada-sovereign infra (KMS / backup patterns
    added).

- [x] **PROGRAM_CONTROL Alignment**:
  - `WORK-ORDER-PHASE0.md` reference added to
    `PROGRAM_CONTROL/DIRECTIVES/QUEUE/`.
  - `GOV-GATE-TRACKER.md` updated with new policy + Phase 0 entry.

- [x] **Standardization**:
  - `.github/copilot-instructions.md` references sovereign infrastructure
    policy.
  - Commit format: `FIZ: Phase 0 complete | rule_applied_id: INFRA_POLICY_v1.0`

**Cross-repo Flags**:

- eCommsZone: RedRoomRewards already tenant — prepare reward notification
  templates.
- Cyrano: Note Mongo → Postgres migration impact on ledger sync.

## Phase 0.5: MaxZoneGPT Ship-Gate Completion (PR #31)

- [ ] Apply mixed-language fixes to ship-gate-verifier.ts and package.json
      (above).
- [ ] Correct OQMI_SYSTEM_STATE.md template drift.
- [ ] Add Super-Linter workflow (canonical from RedRoomRewards/ChatNowZone).
- [ ] Run full `yarn install && yarn ship-gate` + CI matrix.
- [ ] Merge only after green + human review (CEO on governance paths).

## Phase 1: Foundation & Compliance (Ready After Phase 0 Sign-off)

- [ ] Database migration roadmap (MongoDB → Postgres + Prisma, append-only
      ledger).
- [ ] Full `infra/` population (docker-compose with ca-central-1, KMS, immutable
      backups).
- [ ] Ledger hardening (rule_applied_id everywhere, encrypted references only).
- [ ] Canada residency enforcement in all configs.

**Handoff**: After Phase 0, report `tree -L 2` output + test results + any
blockers.
