## Changelog & Key Decisions

### 2025-12-15 - Repository Foundation Cleanup

**Major Restructure**: Mandated repository cleanup and foundation establishment per work order.

#### Structural Changes
- **Archived Legacy Code**: All legacy broadcasting application code moved to `/archive/xxxchatnow-seed/` with strict prohibition on reuse
- **Canonical Directory Structure**: Established standard layout:
  - `/api/` for OpenAPI contracts
  - `/src/` for application code (ledger, wallets, services, webhooks)
  - `/infra/` for infrastructure (migrations, db, config)
  - `/docs/` preserved and enhanced
  - `/.github/workflows/` preserved
- **Removed Runtime UI/Chat/Broadcast**: Confirmed no inappropriate functionality remains outside archive

#### Documentation Updates
- **Created**: `/docs/UNIVERSAL_ARCHITECTURE.md` - Authoritative architectural mandate with prohibitions
- **Updated**: `README.md` - Complete rewrite reflecting new architecture and purpose
- **Updated**: `SECURITY.md` - Added legacy code prohibition and security policy
- **Created**: `CONTRIBUTING.md` - Contribution guidelines and workflow
- **Created**: `LICENSE` - MIT License for the project
- **Created**: `.gitignore` - Node.js/TypeScript project configuration

#### API and Scaffolding
- **Created**: `/api/openapi.yaml` - OpenAPI 3.0 contract with scaffolded endpoints
- **Scaffolded**: All source directories with README documentation
- **Status**: All code is scaffolded only - no implementation in this phase

#### Governance and Compliance
- **Prohibition Documented**: Legacy archived code strictly forbidden (see UNIVERSAL_ARCHITECTURE.md Section 2.1)
- **Runtime Scope Defined**: No UI, chat, broadcast, or tipping logic permitted (see UNIVERSAL_ARCHITECTURE.md Section 2.2)
- **Security Mandates**: All documented in SECURITY.md and UNIVERSAL_ARCHITECTURE.md

#### Rationale
This cleanup establishes a clean foundation for RedRoomRewards as a standalone loyalty platform, completely separated from legacy systems and focused solely on ledger-based point management.

---

### Earlier: 2025-12-15 - Initial Decisions

- Adopted COPILOT.md as authoritative spec checklist, enforced repo-wide.
- Versioned slot machine spec at v1.0, docs/specs/SLOT_MACHINE_SPEC_v1.0.md is now source of truth.
- Engineering standards unified across all token systems: all token-affecting logic must be immutable, auditorily logged, server-side, and never regressive.
- Add/modify features only via versioned specs and checklist.
