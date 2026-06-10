#!/usr/bin/env ts-node

import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

interface ShipGate {
  id: string;
  description: string;
  required: boolean;
  command?: string;
  run?: () => void;
  skip?: boolean;
  skipReason?: string;
}

function runCommand(command: string, options: Record<string, unknown> = {}): void {
  execSync(command, {
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
}

function getRestrictedPathRegex(): RegExp {
  const pattern =
    process.env.RESTRICTED_PATH_REGEX || '^(src\\/(ledger|wallets|consent)\\/|.*\\bpii\\b.*)';
  return new RegExp(pattern, 'i');
}

function assertSafeGitRef(ref: string): void {
  if (!/^[A-Za-z0-9._/-]+$/.test(ref)) {
    throw new Error(`Unsafe git ref value: ${ref}`);
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function pathExists(relativePath: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

function readText(relativePath: string): string | null {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function readDirectoryEntries(relativePath: string): fs.Dirent[] {
  try {
    return fs.readdirSync(path.join(REPO_ROOT, relativePath), { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to scan ${relativePath} for ship-gate language detection: ${message}`);
  }
}

function repoHasExtension(dir: string, extensions: string[]): boolean {
  const absoluteDir = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(absoluteDir)) {
    return false;
  }

  for (const entry of readDirectoryEntries(dir)) {
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

function lintStagedCovers(patterns: string[], extensions: string[]): boolean {
  const normalizedPatterns = patterns
    .join(' ')
    .replace(/[{}*.,!?()[\]\/\\-]/g, ' ')
    .toLowerCase();
  const coveragePattern = new RegExp(`(^|\\s)(${extensions.join('|')})(\\s|$)`);

  return coveragePattern.test(normalizedPatterns);
}

function validateCrossRepoLintParity(): void {
  const failures: string[] = [];
  const checks: string[] = [];
  const packageJsonRaw = readText('package.json');
  let packageJson: {
    scripts?: Record<string, string>;
    'lint-staged'?: Record<string, unknown>;
  } = {};

  const eslintConfigFiles = [
    '.eslintrc.js',
    '.eslintrc.cjs',
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
  ];
  const eslintConfigPresent = eslintConfigFiles.some((f) => pathExists(f));
  if (!eslintConfigPresent) {
    failures.push('.eslintrc.js is missing at the repo root.');
  } else {
    checks.push('.eslintrc.js present at repo root');
  }

  if (!packageJsonRaw) {
    failures.push('package.json is missing or unreadable.');
  } else {
    try {
      packageJson = JSON.parse(packageJsonRaw) as {
        scripts?: Record<string, string>;
        'lint-staged'?: Record<string, unknown>;
      };
    } catch {
      failures.push('package.json is not valid JSON.');
    }
  }

  const scripts = packageJson.scripts ?? {};
  const lintStaged = packageJson['lint-staged'] ?? {};
  const lintStagedPatterns = Object.keys(lintStaged);
  const hasTsFiles = repoHasExtension('.', ['.ts', '.tsx']);
  const hasJsFiles = repoHasExtension('.', ['.js', '.jsx', '.cjs', '.mjs']);
  const hasPythonFiles = repoHasExtension('.', ['.py']);

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

  if (typeof scripts['lint:ci-js'] !== 'string') {
    failures.push('package.json is missing a lint:ci-js script.');
  } else {
    checks.push('package.json exposes lint:ci-js script');
  }

  if (typeof scripts['lint:ci-python'] !== 'string') {
    failures.push('package.json is missing a lint:ci-python script.');
  } else {
    checks.push('package.json exposes lint:ci-python script');
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

  if (hasTsFiles && !lintStagedCovers(lintStagedPatterns, ['ts', 'tsx'])) {
    failures.push(
      'lint-staged does not cover TypeScript file patterns for this mixed-language repo.',
    );
  } else if (hasTsFiles) {
    checks.push('lint-staged covers TypeScript files');
  }

  if (hasJsFiles && !lintStagedCovers(lintStagedPatterns, ['js', 'jsx', 'cjs', 'mjs'])) {
    failures.push(
      'lint-staged does not cover JavaScript file patterns for this mixed-language repo.',
    );
  } else if (hasJsFiles) {
    checks.push('lint-staged covers JavaScript files');
  }

  if (hasPythonFiles && !lintStagedCovers(lintStagedPatterns, ['py'])) {
    failures.push('lint-staged does not cover Python file patterns for this mixed-language repo.');
  } else if (hasPythonFiles) {
    checks.push('lint-staged covers Python files');
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

  checks.forEach((check) => console.log(`SHIP-GATE [cross-repo-lint-parity] CHECK: ${check}`));

  if (failures.length > 0) {
    throw new Error(
      [
        'Cross-repo lint parity invariant failed.',
        ...failures.map((failure) => ` - ${failure}`),
        'Remediation: align canonical lint/super-linter surfaces and mixed-language lint script contracts.',
      ].join('\n'),
    );
  }
}

function getChangedFiles(): string[] {
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

const gates: ShipGate[] = [
  {
    id: 'type-check',
    description: 'TypeScript no-emit type-check must pass',
    command: 'npm run type-check',
    required: true,
  },
  {
    id: 'cross-repo-lint-parity',
    description: 'Canonical mixed-language lint and Super-Linter surfaces are present',
    required: true,
    run: validateCrossRepoLintParity,
  },
  {
    id: 'lint-clean',
    description: 'Repository lint gate must pass',
    command: 'npm run lint:ci',
    required: true,
    skip: process.env.SHIP_GATE_SKIP_LINT === '1',
    skipReason: 'Handled by upstream CI step.',
  },
  {
    id: 'charter-integrity',
    description: 'Charter integrity schedule checks must pass',
    command: 'node scripts/ci/charter-integrity-check.js',
    required: true,
  },
  {
    id: 'no-hardcoded-balance',
    description: 'Hardcoded balance invariant must pass',
    command: 'node scripts/ci/no-hardcoded-balance.js',
    required: true,
  },
  {
    id: 'tenant-id-scope',
    description: 'Tenant-id scope checks must pass',
    command: 'node scripts/ci/tenant-id-scope-check.js',
    required: true,
  },
  {
    id: 'seed-fixture-alignment',
    description: 'Seed fixture alignment checks must pass',
    command: 'node scripts/ci/seed-fixture-alignment-check.js',
    required: true,
  },
  {
    id: 'log-secret-leak',
    description: 'Log secret leak checks must pass',
    command: 'node scripts/ci/log-secret-leak-check.js',
    required: true,
  },
  {
    id: 'openapi-freeze',
    description: 'OpenAPI freeze checks must pass',
    command: 'node scripts/ci/openapi-freeze-check.js',
    required: true,
  },
  {
    id: 'super-linter-clean',
    description: 'Advisory Super-Linter run for governance/docs/config surfaces',
    command: `docker run --rm -e VALIDATE_YAML=true -e VALIDATE_JSON=true -e VALIDATE_MARKDOWN=true -e VALIDATE_ALL_CODEBASE=false -e IGNORE_GITIGNORED_FILES=true -e FILTER_REGEX_INCLUDE="^(\\\\.github/|docs/|PROGRAM_CONTROL/|[^/]+\\\\.(md|yml|yaml|json)$)" -e FILTER_REGEX_EXCLUDE="(^|/)(LEGACY_CONFIGS|archive|node_modules|dist|build|coverage|out|\\\\.next)/" -e LINTER_RULES_PATH=.github/linters -e STRIP_DEFAULT_WORKSPACE_FOR_REGEX=true -e LOG_LEVEL=DEBUG -e GITHUB_ACTIONS=true -v ${shellEscape(`${process.cwd()}:/tmp/lint`)} ghcr.io/super-linter/super-linter:slim-v8`,
    required: false,
    skip: process.env.SHIP_GATE_RUN_SUPER_LINTER !== '1',
    skipReason: 'Advisory gate disabled by default. Set SHIP_GATE_RUN_SUPER_LINTER=1 to enable.',
  },
];

let failed = false;

let changedFiles: string[] = [];
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
    console.log(
      `SHIP-GATE [${gate.id}] RUN: ${gate.command ?? 'custom validator'} (${gate.description})`,
    );
    if (typeof gate.run === 'function') {
      gate.run();
    } else if (gate.command) {
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
