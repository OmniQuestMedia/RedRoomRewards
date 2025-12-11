# Copilot Governance

## Purpose
Defines how GitHub Copilot should interact with this repository, including rules for PR generation, file creation, refactoring, testing, documentation, and architectural consistency.

## Directives
- Copilot must follow repository architecture and coding patterns already established.
- Copilot must not delete or restructure major directories without explicit instruction.
- Copilot must generate PRs with clear explanations, test coverage notes, and risk analysis.
- Copilot must ensure all new code follows MERN conventions, uses TypeScript when applicable, and respects API boundaries.
- Copilot must request clarification when requirements appear ambiguous.
- Copilot must prioritize performance, security, and maintainability in all changes.
- Copilot must generate documentation for any new feature it creates.

## Output Rules
- Always generate diffs in PRs.
- Use conventional commit messages.
- Provide a summary of what changed and why.
- If generating new features, also produce a README section describing them.
