# CI Governance Policy (RedRoomRewards)

## Purpose
This repository’s CI exists to enforce security, correctness, and predictable quality checks with minimal noise. CI must be stable, auditable, and easy to reason about.

This policy applies to all changes made by humans and by Copilot.

## CI Design Principles
1. Single source of truth
   - One workflow per responsibility.
   - No duplicated jobs across multiple workflows.

2. Least privilege
   - Workflows must request only the permissions they need.
   - Write permissions are disallowed unless explicitly approved in the work order.

3. Deterministic, low noise
   - CI should be PR focused by default.
   - Avoid “lint everything on every push” unless required.

4. No guessing
   - CI changes must be based on actual files present in the repo.
   - If the repo does not contain the expected toolchain, stop and report.

## Workflow Inventory Requirements
Any PR that changes CI must include:
- A list of files in `.github/workflows/`
- A statement of which workflow is the canonical one for each responsibility:
  - linting
  - testing
  - build
  - deploy (if applicable)
  - dependency automation (if applicable)

## Canonical Workflow Rules
1. Naming and scope
   - Use a single canonical lint workflow file, recommended name: `.github/workflows/lint.yml`
   - If a different lint workflow already exists, either:
     - migrate it to the canonical file, or
     - declare it canonical and delete or disable duplicates

2. Config location
   - Linter configuration must live in `.github/linters/` unless a tool requires a different discovery mechanism.

3. Explicit validator allowlist
   - When using Super-Linter, use allowlist semantics:
     - set only the required `VALIDATE_*` variables to `"true"`
     - do not mix large sets of `"false"` flags unless deliberately using denylist mode

4. Avoid looping automation
   - Do not add “fix and auto-commit” workflows unless explicitly approved.
   - If an auto-commit workflow is approved, it must include loop guards:
     - do not run on default branch
     - do not run when actor is `github-actions[bot]`
     - do not trigger itself repeatedly

## Change Control
1. All CI changes must be made on a feature branch and merged via PR.
2. The PR description must include:
   - File Plan: CREATE, OVERWRITE, EDIT, DELETE, RENAME, DISABLE with exact paths
   - Risk Notes: any permission changes, any new third party actions, any new secrets
   - Rollback Plan: how to revert quickly if CI breaks

## Security Requirements
1. No secrets in code
   - Secrets may only be read from GitHub Secrets.
2. Pin action versions
   - Use tagged versions of GitHub Actions.
3. Minimal permissions
   - Prefer `contents: read` unless write is required and approved.
4. Avoid broad tokens
   - Do not introduce personal access tokens unless explicitly approved.

## Copilot Execution Standard
Copilot must follow the repository’s Copilot Governance Policy and must comply with:
- inventory first
- minimal explicit change set
- full file contents for any CREATE or OVERWRITE
- clear BEGIN and END markers for file content blocks
