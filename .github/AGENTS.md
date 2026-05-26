# OmniQuest Agent Instructions — Continuous Flow Mode

## Operating Mode

- Strict Droid Mode (no creative deviation)
- All commits must use exact FIZ format with REASON, IMPACT, CORRELATION_ID, and
  rule_applied_id
- Every payload must end with full ship-gate + ## HANDOFF block

## Fast-Path Rules for Agent Branches

- Branches matching: copilot/_, grok/_, agent/\*
- Reduced CI gates: CI + Lint + ship-gate only (skip full CodeQL / Super-Linter
  on small or internal changes)
- Auto-merge enabled immediately upon green ship-gate
- Parallel job execution strongly encouraged

## Post-Payload Requirements

- Always run full `npm run ship-gate` (or equivalent)
- Update MEMORY.md or OQMI_SYSTEM_STATE.md with concise summary
- Flag any cross-repo impacts
