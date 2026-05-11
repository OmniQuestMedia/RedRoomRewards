#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execSync, execFileSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const EXTENSION_SCAN_IGNORES = new Set([
  '.git',
  '.next',
  'archive',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'super-linter-output',
]);
const EXTENSION_SCAN_DOTDIRS_ALLOW = new Set(['.github', '.husky']);

function runCommand(command, options = {}) {
  execSync(command, {
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
}

function getRestrictedPathRegex() {
  const pattern =
    process.env.RESTRICTED_PATH_REGEX || '^(src\\/(ledger|wallets|consent)\\/|.*\\bpii\\b.*)';
  return new RegExp(pattern, 'i');
}

function assertSafeGitRef(ref) {
  if (!/^[A-Za-z0-9._/-]+$/.test(ref)) {
    throw new Error(`Unsafe git ref value: ${ref}`);
  }
}

function shellEscape(value) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function pathExists(relativePath) {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

function readText(relativePath) {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function repoHasExtension(dir, extensions) {
  const absoluteDir = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(absoluteDir)) {
    return false;
  }

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && !EXTENSION_SCAN_DOTDIRS_ALLOW.has(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (EXTENSION_SCAN_IGNORES.has(entry.name)) {
        continue;
      }

      if (repoHasExtension(path.join(dir, entry.name), extensions)) {
        return true;
      }
      continue;
    }

    const extension = path.extname(entry.name);
    if (entry.name.endsWith('.d.ts')) {
      continue;
    }

    if (extensions.includes(extension)) {
      return true;
    }
  }

  return false;
}

function lintStagedCovers(patterns, extensions) {
  const normalizedPatterns = patterns
    .join(' ')
    .replace(/[{}*.,!?()[\]\/\\-]/g, ' ')
    .toLowerCase();
  const coveragePattern = new RegExp(`(^|\\s)(${extensions.join('|')})(\\s|$)`);

  return coveragePattern.test(normalizedPatterns);
}

function validateCanonicalLintSurface() {
  const failures = [];
  const checks = [];
  const packageJsonRaw = readText('package.json');
  let packageJson = {};

  if (!pathExists('.eslintrc.js')) {
    failures.push('.eslintrc.js is missing at the repo root.');
  } else {
    checks.push('.eslintrc.js present at repo root');
  }

  if (!packageJsonRaw) {
    failures.push('package.json is missing or unreadable.');
  } else {
    try {
      packageJson = JSON.parse(packageJsonRaw);
    } catch {
      failures.push('package.json is not valid JSON.');
    }
  }

  const scripts =
    typeof packageJson.scripts === 'object' && packageJson.scripts ? packageJson.scripts : {};
  const lintStaged =
    typeof packageJson['lint-staged'] === 'object' && packageJson['lint-staged']
      ? packageJson['lint-staged']
      : {};
  const lintStagedPatterns = Object.keys(lintStaged);
  const hasTsFiles = repoHasExtension('.', ['.ts', '.tsx']);
  const hasJsFiles = repoHasExtension('.', ['.js', '.jsx', '.cjs', '.mjs']);

  if (typeof scripts.lint !== 'string') {
    failures.push('package.json is missing a lint script.');
  } else {
    checks.push('package.json exposes lint script');
  }

  if (typeof scripts['lint:ci'] !== 'string') {
    failures.push('package.json is missing a lint:ci script.');
  } else {
    checks.push('package.json exposes lint:ci script');
  }

  if (typeof scripts['lint:fix'] !== 'string') {
    failures.push('package.json is missing a lint:fix script.');
  } else {
    checks.push('package.json exposes lint:fix script');
  }

  if (typeof scripts['format:check'] !== 'string') {
    failures.push('package.json is missing a format:check script.');
  } else {
    checks.push('package.json exposes format:check script');
  }

  if (lintStagedPatterns.length === 0) {
    failures.push('package.json is missing lint-staged configuration.');
  } else {
    checks.push('package.json contains lint-staged config');
  }

  if (hasTsFiles) {
    if (!lintStagedCovers(lintStagedPatterns, ['ts', 'tsx'])) {
      failures.push(
        'lint-staged does not cover TypeScript file patterns for this mixed-language repo.',
      );
    } else {
      checks.push('lint-staged covers TypeScript files');
    }
  }

  if (hasJsFiles) {
    if (!lintStagedCovers(lintStagedPatterns, ['js', 'jsx', 'cjs', 'mjs'])) {
      failures.push(
        'lint-staged does not cover JavaScript file patterns for this mixed-language repo.',
      );
    } else {
      checks.push('lint-staged covers JavaScript files');
    }
  }

  if (!pathExists('.github/workflows/super-linter.yml')) {
    failures.push('.github/workflows/super-linter.yml is missing.');
  } else {
    checks.push('.github/workflows/super-linter.yml present');
  }

  if (!pathExists('.github/linters/.markdown-lint.yml')) {
    failures.push('.github/linters/.markdown-lint.yml is missing.');
  } else {
    checks.push('.github/linters/.markdown-lint.yml present');
  }

  if (!pathExists('.github/linters/.yaml-lint.yml')) {
    failures.push('.github/linters/.yaml-lint.yml is missing.');
  } else {
    checks.push('.github/linters/.yaml-lint.yml present');
  }

  const huskyHook = readText('.husky/pre-commit') ?? '';
  if (!huskyHook.includes('lint-staged')) {
    failures.push('.husky/pre-commit does not invoke lint-staged.');
  } else {
    checks.push('.husky/pre-commit invokes lint-staged');
  }

  checks.forEach((check) => console.log(`SHIP-GATE [lint-surface] CHECK: ${check}`));

  if (failures.length > 0) {
    throw new Error(
      [
        'Canonical lint surface invariant failed.',
        ...failures.map((failure) => ` - ${failure}`),
        'Remediation: add the canonical Super-Linter workflow plus npm lint/lint-staged coverage for every active JS/TS surface.',
      ].join('\n'),
    );
  }
}

function getChangedFiles() {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const baseRef = process.env.GITHUB_BASE_REF;

  if (eventName !== 'pull_request' || !baseRef) {
    return [];
  }

  assertSafeGitRef(baseRef);
  execFileSync(
    'git',
    ['fetch', '--no-tags', 'origin', `${baseRef}:refs/remotes/origin/${baseRef}`],
    {
      stdio: 'inherit',
    },
  );
  const output = execFileSync(
    'git',
    ['diff', '--name-only', `refs/remotes/origin/${baseRef}...HEAD`],
    {
      encoding: 'utf8',
    },
  );

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const gates = [
  {
    id: 'lint-surface',
    required: true,
    run: validateCanonicalLintSurface,
  },
  {
    id: 'lint-clean',
    command: 'npm run lint:ci',
    required: true,
    skip: process.env.SHIP_GATE_SKIP_LINT === '1',
    skipReason: 'Handled by upstream CI step.',
  },
  {
    id: 'charter-integrity',
    command: 'node scripts/ci/charter-integrity-check.js',
    required: true,
  },
  {
    id: 'no-hardcoded-balance',
    command: 'node scripts/ci/no-hardcoded-balance.js',
    required: true,
  },
  {
    id: 'tenant-id-scope',
    command: 'node scripts/ci/tenant-id-scope-check.js',
    required: true,
  },
  {
    id: 'seed-fixture-alignment',
    command: 'node scripts/ci/seed-fixture-alignment-check.js',
    required: true,
  },
  {
    id: 'log-secret-leak',
    command: 'node scripts/ci/log-secret-leak-check.js',
    required: true,
  },
  {
    id: 'openapi-freeze',
    command: 'node scripts/ci/openapi-freeze-check.js',
    required: true,
  },
  {
    id: 'super-linter-clean',
    command: `docker run --rm -e VALIDATE_YAML=true -e VALIDATE_JSON=true -e VALIDATE_MARKDOWN=true -e VALIDATE_ALL_CODEBASE=false -e IGNORE_GITIGNORED_FILES=true -e FILTER_REGEX_INCLUDE="^(\\\\.github/|docs/|PROGRAM_CONTROL/|[^/]+\\\\.(md|yml|yaml|json)$)" -e FILTER_REGEX_EXCLUDE="(^|/)(LEGACY_CONFIGS|archive|node_modules|dist|build|coverage|out|\\\\.next)/" -e LINTER_RULES_PATH=.github/linters -e STRIP_DEFAULT_WORKSPACE_FOR_REGEX=true -e LOG_LEVEL=DEBUG -e GITHUB_ACTIONS=true -v ${shellEscape(`${process.cwd()}:/tmp/lint`)} ghcr.io/super-linter/super-linter:slim-v8`,
    required: false,
    skip: process.env.SHIP_GATE_RUN_SUPER_LINTER !== '1',
    skipReason: 'Advisory gate disabled by default. Set SHIP_GATE_RUN_SUPER_LINTER=1 to enable.',
  },
];

let failed = false;

let changedFiles = [];
const restrictedPathRegex = getRestrictedPathRegex();
try {
  changedFiles = getChangedFiles();
} catch (error) {
  console.error(
    'SHIP-GATE: unable to compute changed files for restricted-path check. Failing closed.',
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const restrictedFiles = changedFiles.filter((file) => restrictedPathRegex.test(file));
if (restrictedFiles.length > 0) {
  console.log('SHIP-GATE: restricted paths changed; strict invariants enforced.');
  restrictedFiles.forEach((file) => console.log(` - ${file}`));
}

for (const gate of gates) {
  if (gate.skip) {
    console.log(`SHIP-GATE [${gate.id}] SKIPPED: ${gate.skipReason}`);
    continue;
  }

  try {
    console.log(`SHIP-GATE [${gate.id}] RUN: ${gate.command ?? 'custom validator'}`);
    if (typeof gate.run === 'function') {
      gate.run();
    } else {
      runCommand(gate.command, { shell: '/bin/bash' });
    }
    console.log(`SHIP-GATE [${gate.id}] PASS`);
  } catch (error) {
    console.error(`SHIP-GATE [${gate.id}] FAIL`);
    console.error(error instanceof Error ? error.message : String(error));
    if (gate.required) {
      failed = true;
      break;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('SHIP-GATE: PASS');
