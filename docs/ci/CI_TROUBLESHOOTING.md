# CI Troubleshooting (RedRoomRewards)

## First Response Checklist
1. Identify the failing workflow and job name.
2. Open the failed run and capture:
   - workflow filename
   - trigger (push, pull_request, workflow_dispatch)
   - first error line and the last 30 lines of logs

3. Confirm whether the failure is:
   - configuration or workflow syntax
   - missing config files
   - toolchain mismatch (repo does not contain the language it is linting)
   - permission issue
   - loop or repeated re-run issue

## Common Issues and Fixes

### Super-Linter fails on changed files detection
- Ensure checkout uses full history:
  - `fetch-depth: 0`
- Ensure the workflow runs on pull_request and compares correctly to the default branch.

### Duplicate lint workflows create noise and inconsistent results
- Search `.github/workflows/` for `super-linter/super-linter`
- Keep only one canonical entrypoint.
- Remove or disable duplicates.

### Markdownlint config conflicts
- Ensure one config location:
  - `.github/linters/.markdown-lint.yml`
- Avoid multiple markdownlint config files in different locations.

### Workflow loops
- Look for workflows that commit back to the same branch.
- Fix by:
  - removing auto-commit behavior, or
  - adding loop guards (actor check, event restrictions).

## Escalation
Stop and request direction if:
- fixing requires adding write permissions
- fixing requires adding a new secret or token
- there are multiple valid options with different security or noise tradeoffs
