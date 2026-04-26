# Pre-Deletion Reference Scan — LEGACY_CONFIGS/

**Date:** 2026-04-26  
**Branch:** claude/remove-legacy-configs  
**Task:** OQMI-authorized removal of LEGACY_CONFIGS/ directory

---

## Commands Run

### 1. `git grep -nE "LEGACY_CONFIGS" -- ':!LEGACY_CONFIGS/*'`

```
.eslintrc.js:73:    'LEGACY_CONFIGS/',
.gitattributes:5:# Updated: 2026-04-19 (config refresh — legacy copy in LEGACY_CONFIGS/)
.github/linters/.yaml-lint.yml:18:  LEGACY_CONFIGS/
.github/workflows/lint.yml:52:          FILTER_REGEX_EXCLUDE: (^|/)(archive|LEGACY_CONFIGS|REFERENCE_LIBRARY|PROGRAM_CONTROL|node_modules|dist|build|out|coverage|\.next|super-linter-output)/|(^|/)docs/history/|.* .*|(^|/)tsconfig(\.[^/]+)?\.json$
.gitignore:3:# Updated: 2026-04-19 (config refresh — legacy copy in LEGACY_CONFIGS/)
.markdownlintignore:22:LEGACY_CONFIGS/
.prettierignore:21:LEGACY_CONFIGS/
PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-PLAN.md:42:### `LEGACY_CONFIGS/` (1)
PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-PLAN.md:46:| `LEGACY_CONFIGS/README.md` | 33 | 2026-04-24 | 513cc25 | `KEEP-ARCHIVE` — governed by its own README; removal requires OQMI authorization |
PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-PLAN.md:224:"exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "**/*.example.ts", "LEGACY_CONFIGS"]
PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-PLAN.md:225:"exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "LEGACY_CONFIGS", "src/api/receipt-endpoint.example.ts"]
archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/CNZ-WORK-A001-report.md:40:- `LEGACY_CONFIGS/` — contains duplicate `.eslintrc.js`, `.gitignore`,
eslint.config.mjs:27:      'LEGACY_CONFIGS/**',
tsconfig.json:51:  "exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "LEGACY_CONFIGS", "src/api/receipt-endpoint.example.ts"]
```

### 2. `git grep -nE -i "legacy.configs" -- ':!LEGACY_CONFIGS/*'`

```
.eslintrc.js:73:    'LEGACY_CONFIGS/',
.gitattributes:5:# Updated: 2026-04-19 (config refresh — legacy copy in LEGACY_CONFIGS/)
.github/linters/.yaml-lint.yml:18:  LEGACY_CONFIGS/
.github/workflows/lint.yml:52:          FILTER_REGEX_EXCLUDE: (^|/)(archive|LEGACY_CONFIGS|REFERENCE_LIBRARY|PROGRAM_CONTROL|node_modules|dist|build|out|coverage|\.next|super-linter-output)/|(^|/)docs/history/|.* .*|(^|/)tsconfig(\.[^/]+)?\.json$
.gitignore:3:# Updated: 2026-04-19 (config refresh — legacy copy in LEGACY_CONFIGS/)
.markdownlintignore:22:LEGACY_CONFIGS/
.prettierignore:21:LEGACY_CONFIGS/
PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-PLAN.md:42:### `LEGACY_CONFIGS/` (1)
PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-PLAN.md:46:| `LEGACY_CONFIGS/README.md` | 33 | 2026-04-24 | 513cc25 | `KEEP-ARCHIVE` — governed by its own README; removal requires OQMI authorization |
PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-PLAN.md:224:"exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "**/*.example.ts", "LEGACY_CONFIGS"]
PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-PLAN.md:225:"exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "LEGACY_CONFIGS", "src/api/receipt-endpoint.example.ts"]
archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/CNZ-WORK-A001-report.md:40:- `LEGACY_CONFIGS/` — contains duplicate `.eslintrc.js`, `.gitignore`,
eslint.config.mjs:27:      'LEGACY_CONFIGS/**',
tsconfig.json:51:  "exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "LEGACY_CONFIGS", "src/api/receipt-endpoint.example.ts"]
```

### 3. `git grep -n "validate-schema\.js"`

```
.github/PRODUCTION_SCHEDULE.md:39:| A-008   | ... move `validate-schema.js` to `scripts/`; ...  | DONE   | 778df64   |
.github/workflows/ci.yml:58:        run: node scripts/validate-schema.js
LEGACY_CONFIGS/README.md:28:| `validate-schema.js`   | Legacy JSON schema validation utility       |
LEGACY_CONFIGS/package.json:16:    "validate:schema": "node validate-schema.js"
PROGRAM_CONTROL/DIRECTIVES/QUEUE/OQMI_SYSTEM_STATE_RRR.md:96:| A-008   | 778df64 | ... relocate `validate-schema.js` |
PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-REPORT.md:143:| **Schema validation** | `node scripts/validate-schema.js` | ✅ PASS |
archive/governance-v1/RRR-WORK-001.md:537:  - **`validate-schema.js` at repo root:** relocate to `scripts/`;
docs/contracts/README.md:50:node validate-schema.js
package.json:19:    "validate:schema": "node scripts/validate-schema.js",
```

---

## Classification

| File | Line | Match | Classification | Reason |
|------|------|-------|---------------|--------|
| `.eslintrc.js` | 73 | `'LEGACY_CONFIGS/'` | **DOC-ONLY** | Ignore/exclude pattern in ESLint `ignorePatterns`. Stale-but-harmless after deletion; no file is imported or executed from within LEGACY_CONFIGS/. |
| `.gitattributes` | 5 | `LEGACY_CONFIGS/` | **DOC-ONLY** | Inline comment only. |
| `.github/linters/.yaml-lint.yml` | 18 | `LEGACY_CONFIGS/` | **DOC-ONLY** | Exclude pattern for yaml-lint. Stale-but-harmless after deletion. |
| `.github/workflows/lint.yml` | 52 | `LEGACY_CONFIGS` | **DOC-ONLY** | `FILTER_REGEX_EXCLUDE` pattern — excludes the directory from super-linter. Stale-but-harmless after deletion; no runtime breakage. |
| `.gitignore` | 3 | `LEGACY_CONFIGS/` | **DOC-ONLY** | Inline comment only. |
| `.markdownlintignore` | 22 | `LEGACY_CONFIGS/` | **DOC-ONLY** | Exclude pattern for markdownlint. Stale-but-harmless after deletion. |
| `.prettierignore` | 21 | `LEGACY_CONFIGS/` | **DOC-ONLY** | Exclude pattern for Prettier. Stale-but-harmless after deletion. |
| `PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-PLAN.md` | 42, 46, 224, 225 | `LEGACY_CONFIGS` | **DOC-ONLY** | Historical cleanup planning report (markdown). |
| `archive/governance-v1/PROGRAM_CONTROL/REPORT_BACK/CNZ-WORK-A001-report.md` | 40 | `LEGACY_CONFIGS/` | **DOC-ONLY** | Archived historical report (markdown). |
| `eslint.config.mjs` | 27 | `'LEGACY_CONFIGS/**'` | **DOC-ONLY** | Ignore pattern in ESLint flat config. Stale-but-harmless after deletion. |
| `tsconfig.json` | 51 | `"LEGACY_CONFIGS"` | **DOC-ONLY** | `exclude` array entry. Stale-but-harmless after deletion; TypeScript will simply not find the directory. |
| `.github/workflows/ci.yml` | 58 | `node scripts/validate-schema.js` | **DOC-ONLY** | References `scripts/validate-schema.js` (the production location per A-008), NOT `LEGACY_CONFIGS/validate-schema.js`. No dependency on LEGACY_CONFIGS/. |
| `.github/PRODUCTION_SCHEDULE.md` | 39 | `validate-schema.js` | **DOC-ONLY** | Markdown charter row describing completed task A-008. |
| `PROGRAM_CONTROL/DIRECTIVES/QUEUE/OQMI_SYSTEM_STATE_RRR.md` | 96 | `validate-schema.js` | **DOC-ONLY** | Markdown state tracker. |
| `PROGRAM_CONTROL/REPORT_BACK/CLEANUP-DROID-REPORT.md` | 143 | `validate-schema.js` | **DOC-ONLY** | Historical cleanup report (markdown). |
| `archive/governance-v1/RRR-WORK-001.md` | 537 | `validate-schema.js` | **DOC-ONLY** | Archived markdown. |
| `docs/contracts/README.md` | 50 | `validate-schema.js` | **DOC-ONLY** | Markdown documentation. |
| `package.json` | 19 | `node scripts/validate-schema.js` | **DOC-ONLY** | References `scripts/validate-schema.js` (production location), NOT `LEGACY_CONFIGS/validate-schema.js`. |

---

## Verdict

**ZERO LIVE-REFERENCE hits.**

All external references to `LEGACY_CONFIGS/` are:
- Exclude/ignore patterns in tooling configs that become stale-but-harmless after deletion (no runtime breakage — they simply exclude a directory that no longer exists).
- Markdown/documentation references (historical accuracy).

All `validate-schema.js` references outside `LEGACY_CONFIGS/` point to `scripts/validate-schema.js` (the production location established by A-008), not to `LEGACY_CONFIGS/validate-schema.js`.

**Conclusion: Safe to proceed with deletion.**
