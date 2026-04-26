# OQMI_PROTOTYPE_STANDARDS.md

**Version:** 1.1 **Authority:** Kevin B. Hartley, CEO — OmniQuest Media Inc.
**Effective:** 2026-04-22 **Governs:** All external prototype work orders issued
under the OQMInc™ Business Plan v2.8 (April 2026)

## Change Note — v1.0 → v1.1

2026-04-22: §9 "Known Contradiction" removed in its entirety. The CEO clarified
on 2026-04-22 that SZT (ShowZoneToken) is a retired currency name that has been
superseded by CZT (ChatNow Zone Token). There is no contradiction. SZT does not
exist in the current domain model. All subsequent section numbers have been
decremented accordingly.

## §1 Purpose

This document is the authoritative standards reference for all external
prototype work orders issued by OmniQuest Media Inc. (OQMI) for the ChatNow.Zone
(CNZ) platform. Every coder receiving a Work Order (WO) must read and comply
with this document before writing a single line of code.

These standards exist because:

1. Multiple external coders are working in parallel on components that will be
   assembled by a Claude Code droid.
2. The prototype phase is time-boxed to 1 October 2026.
3. Coders return code via chat. Strict return format compliance is the only QA
   gate.

## §2 Governance Model

- CEO: Kevin B. Hartley. Final authority.
- Claude Code droid: Receives completed code returns, installs, runs tests,
  reports anomalies.
- External coders: Grok, etc. Return code. Do not push to repo.
- Flag-and-move rule: If a WO is silent on a decision, coder picks the most
  defensible default, documents it in ASSUMPTIONS.md, adds an entry to FLAGS.md,
  and ships.

## §3 Hard Launch Deadline

1 October 2026. All prototype components must be returnable and installable
before this date.

## §4 Return Format (Mandatory)

Every WO return must include: WO_ID/ ├── src/ ├── tests/ ├── README.md ├──
ASSUMPTIONS.md └── FLAGS.md

Every code block must open with: // FILE: <WO_ID>/src/your-module.ts

## §5 Language and Runtime Standards

- Language: TypeScript (strict mode)
- Runtime: Node.js LTS
- Package manager: npm (repo uses package-lock.json)
- Test framework: Jest
- No build step required for prototype

## §6 Domain Vocabulary

Use these terms exactly:

- Guest (never user/customer)
- CZT (ChatNow Zone Token) — the sole platform currency
- Promotional Bonus (RedRoom Rewards points)
- etc. (full list as previously shared)

## §7 Interface Contracts

All interfaces go in src/interfaces/ and are importable.

## §8 State Machine Standards

Use explicit state enums, transition tables, typed errors.

## §9 Glossary

CZT, RedRoom Rewards, GateGuard Sentinel™, etc.

## §10 Security Non-Negotiables

Immutable ledger, no PII in logs, least-privilege, etc.

## §11 Prototype-Phase Stubs

Mark stubs clearly with // STUB:

## §12 Change Control

Current version: 1.1 — 2026-04-22
