# OQMI Infrastructure and Security Policy

**Document:** OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md  
**Authority:** OmniQuest Media Inc. (OQMInc™)  
**Scope:** Company-wide (all environments, repos, production, staging, and
development). Complements and extends OQMI_GOVERNANCE.md (repo-portable coding
governance).  
**Version:** v1.0  
**Effective Date:** 2026-05-06  
**Platform Time Standard:** America/Toronto  
**Authority of Record:** Kevin B. Hartley, CEO — OmniQuest Media Inc.

---

## 0. PURPOSE

This document establishes the non-negotiable operational, security, and
infrastructure policies for OmniQuest Media Inc. It governs server operations,
database management, AI system usage, data security, backup/disaster-recovery
(DR), and defenses against malware/ransomware.

It synthesizes the highest-integrity practices from:

- OQMI_GOVERNANCE.md (coding agents, AI advisory boundary, financial invariants,
  commit discipline, audit logging)
- Integration & Automation doctrine (deterministic, auditable, "It Just Works")
- REDBOOK Corpus & Canonical Corpus (financial sovereignty, compliance-first,
  consent/age-assurance, PII minimization)
- VoiceSampleCollectionService directive (encrypted path references only, never
  raw sensitive media in DB, consent gates)
- [INTEL] reporting and operational intelligence requirements

Where any conflict arises, this document and OQMI_GOVERNANCE.md prevail. This
policy is Human-Review Category (§2.2 of OQMI_GOVERNANCE.md) for any material
amendment.

---

## 1. REFERENCE TO CORE GOVERNANCE

All teams and agents must read and comply with OQMI_GOVERNANCE.md before any
non-trivial infrastructure or security work. Key cross-references:

- §5 — Code invariants (append-only, deterministic, idempotent financial/audit
  paths)
- §6 — Security posture (least privilege, no secrets in code/logs, audit events
  with rule_applied_id)
- §7 — Advisory-AI boundary (AI is read-only/proposal-generating; never mutates
  ledger, authorizes refunds, or overrides compliance)
- §8 — Commit discipline (four-line FIZ format on financial-integrity paths)

---

## 2. CODING & AI INTEGRITY (EXTENDED FROM OQMI_GOVERNANCE)

- Coding agents (Claude Code, Copilot, Grok, etc.) operate in **Droid Mode**
  only.
- No creative deviation from assigned tasks.
- All changes to financial, compliance, or PII-handling code require
  `rule_applied_id: 'VOICE_SAMPLE_v1'`-style traceability (or equivalent per
  module).

AI systems are **advisory infrastructure only**. They may draft policies,
summarize logs, or propose code, but **never**:

- Compute earnings/payouts
- Mutate ledger/audit/balance tables
- Authorize irreversible actions (refunds, suspensions, content takedowns)
- Bypass consent/age gates

**Hard invariant:** Raw sensitive data (voice samples, ID images, payment
details, NCII evidence) never enters application code or DB except via encrypted
references or immutable audit hashes.

---

## 3. SERVER & DATABASE OPERATIONS

**Principles (zero-trust, defense-in-depth):**

- All production workloads run in Canada (data sovereignty under PIPEDA).
- Database and cache services (Postgres, Redis, etc.) never exposed to public
  internet. Use private VPCs only.
- Least-privilege IAM / RBAC enforced at every layer (service accounts, not
  root).
- All traffic encrypted in transit (TLS 1.3 minimum).
- Encryption at rest mandatory (AWS KMS / equivalent with customer-managed keys
  where possible).
- Multi-tenant isolation enforced via `organization_id` + `tenant_id` on every
  write (per VoiceSample model pattern).

**Database invariants:**

- Financial/audit/compliance tables: append-only (no UPDATE/DELETE; use offset
  entries).
- Every table includes `correlation_id`, `reason_code`, `rule_applied_id`.
- VoiceSample-style records store encrypted path references only (SSE-S3 object
  key); raw media/audio/PII never in DB.

---

## 4. CRITERIA FOR THIRD-PARTY CANADIAN SERVER PROVIDERS

All infrastructure vendors must meet or exceed the following mandatory criteria
(evaluated annually by CEO + engineering lead):

| Criterion                   | Requirement                                                                                                                                                        | Rationale                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Data Residency              | All production data stored in Canadian regions only (e.g., AWS ca-central-1, Azure Canada Central, Google Cloud Toronto/Montreal, OVH Canada, ThinkOn, eStruxture) | PIPEDA, avoids CLOUD Act / foreign government access risks            |
| Compliance Certifications   | SOC 2 Type II, ISO 27001, PCI-DSS (for payment paths), PIPEDA-compliant                                                                                            | Mandatory for adult platform handling PII, payments, age/consent data |
| Encryption & Key Management | Customer-managed KMS, SSE-S3 or equivalent, no vendor default keys for sensitive data                                                                              | Protects voice samples, consent records, financials                   |
| Audit & Logging             | Full audit logs exported to immutable SIEM (e.g., AWS CloudTrail + S3 immutable)                                                                                   | Required for [INTEL] reporting and regulatory defense                 |
| SLA & Uptime                | ≥99.99% availability, <5 min RTO for critical services                                                                                                             | "It Just Works" moral obligation                                      |
| Incident Response           | 24/7 SOC, <1 hour initial response for security incidents, contractual obligation to notify OQMInc within 15 min of breach                                         | Ransomware/malware containment                                        |
| Canadian Legal Entity       | Vendor must have Canadian legal presence and data-processing agreement                                                                                             | Sovereignty & enforceability                                          |
| No Backdoors / Transparency | Vendor publishes transparency report; no known government backdoors                                                                                                | Trust in adult-industry compliance                                    |
| Exit Strategy               | Data export tooling + 90-day migration window guaranteed                                                                                                           | Avoid vendor lock-in                                                  |

**Preferred Tier-1 providers (2026):** AWS ca-central-1, OVHcloud Canada, Azure
Canada Central.

**Prohibited:** Any U.S.-only or non-sovereign providers for production
workloads.

---

## 5. BACKUP & DISASTER-RECOVERY PLANS

**Mandatory 3-2-1 Rule (with immutability):**

- 3 copies of data
- 2 different media/types (e.g., S3 + Glacier)
- 1 offsite / air-gapped (immutable object storage or tape)

**Specific requirements:**

- Daily immutable backups (S3 Object Lock or equivalent with 90-day minimum
  retention for financial/audit data).
- Weekly full + daily incremental for non-financial data.
- Encrypted (AES-256) and immutable (WORM — Write Once, Read Many).
- Tested quarterly (documented restore drills with RTO/RPO metrics).
- Voice samples & PII: Backups reference encrypted S3 keys only; never contain
  raw media.

**RPO:** ≤5 minutes for financial/audit data; ≤1 hour for all other production
data.  
**RTO:** ≤15 minutes for critical services (ledger, consent gates).

**DR Strategy:** Active-active in secondary Canadian AZ/region where feasible.
Failover tested biannually.

---

## 6. DATA SECURITY & PII HANDLING

- **Classification:** All data tagged (Public / Internal / Sensitive /
  Restricted). Voice samples, consent logs, payment events = Restricted.
- **Minimization:** Store only what is required. Raw audio/ID images never
  persisted.
- **Encryption:** At-rest (KMS), in-transit (TLS 1.3), in-use where possible
  (confidential computing).
- **Access:** Just-in-time, audited, role-bound, step-up authentication for
  Restricted data.
- **Logging:** Every access to Restricted data emits immutable audit event (§6.5
  of OQMI_GOVERNANCE).
- **Deletion/Retention:** Strict legal holds for compliance data; automated
  purge after retention window (PIPEDA-aligned).

---

## 7. MALWARE & RANSOMWARE DEFENSE

**Defense-in-depth stack (mandatory):**

- Endpoint Detection & Response (EDR) on all servers/workstations.
- Network segmentation (micro-segmentation via VPCs/security groups).
- Immutable backups (see §5) — primary ransomware mitigation.
- Zero-trust network access (no direct SSH/RDP; use bastion or SSM).
- MFA everywhere (including infrastructure consoles and CI/CD).
- Continuous vulnerability scanning + automated patching (within 48h for
  critical CVEs).
- Air-gapped / offline backups for long-term archives.

**Incident Response Plan (IRP):**

1. Immediate isolation of affected systems.
2. Forensic snapshot before remediation.
3. CEO notification within 15 minutes.
4. Post-incident [INTEL] report filed within 24h.
5. Lessons-learned incorporated into policy within 7 days.

**Prohibited:** Any "restore from backup" that would re-introduce malware.
Always validate integrity first.

---

## 8. MONITORING, ALERTING & [INTEL] REPORTING

- Centralized observability (logs, metrics, traces) with immutable retention.
- Automated anomaly detection for financial drift, consent-gate bypass, unusual
  access patterns.
- All incidents generate "evidence-ready" [INTEL] pack per attached [INTEL]
  Report Requirements.
- Monthly executive security posture review (CEO + engineering).

---

## 9. AGENT & VENDOR HANDOFF PROTOCOL

Same discipline as OQMI_GOVERNANCE.md §9. Any incomplete infrastructure work
must end with a `## HANDOFF` block specifying next steps.

---

## 10. AMENDMENT PROCEDURE

Follow Human-Review Category process in OQMI_GOVERNANCE.md §2.2. PR modifying
this document requires CEO merge.

---

## 11. INVARIANTS REGISTER (QUICK REFERENCE)

1. Canada-only data residency for production.
2. Raw sensitive media/PII never stored in DB — encrypted references only.
3. Immutable, encrypted, tested backups (3-2-1 + WORM).
4. AI advisory-only; never mutates financial/compliance state.
5. All infrastructure changes audited with `rule_applied_id`.
6. Least-privilege + zero-trust enforced at every layer.
7. Ransomware defense = immutable backups + rapid isolation.

---

_This policy is effective immediately. All existing and future infrastructure
must conform._

**Authority:** Kevin B. Hartley, CEO — OmniQuest Media Inc.  
**Effective:** 2026-05-06
