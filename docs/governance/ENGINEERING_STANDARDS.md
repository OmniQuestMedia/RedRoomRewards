# Engineering Standards: Token Features

## Mandatory Specs & Docs Structure
- Place all feature specs in `docs/specs/<FEATURE>_SPEC_vX.Y.md`
- Enforce official checklists via `docs/copilot/COPILOT.md`
- All design decisions go in `DECISIONS.md`; all major architectural choices/logs in `ARCHITECTURE.md`.

## Branching, PR, & Token Authz
- Feature branches per-topic (`chip-menu`, `slot-machine`, etc.).
- PRs must reference the spec version and checklist results.
- All token actions logged, never rely on client-supplied values.
- Audit all changes for non-regression and safety.

## Observability, Performance, PR Gate
- Metrics, logs, and error handling built in for all token features.
- Enforce <500ms p95 for purchases/spins; index everything on critical paths.

## Security Stance
- Treat tokens like cash (see Security Policy); never allow unguarded client control, ensure idempotency and atomicity on all mutations.
- Audit logs are immutable.

---

## Version History
- 2025-12-15: Added standards as per slot machine and chip menu briefing.
