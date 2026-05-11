#!/usr/bin/env node

import { execFileSync, execSync } from 'node:child_process';

type ShipGateInvariant = {
  id: string;
  description: string;
  command: string;
  required: boolean;
  skip?: boolean;
  skipReason?: string;
};

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

export const INVARIANTS: ShipGateInvariant[] = [
  {
    id: 'python-lint-clean',
    description: 'flake8 (fatal) + black + isort',
    command: [
      'flake8 src tests --count --select=E9,F63,F7,F82 --show-source --statistics',
      'black --check --line-length=100 src tests',
      'isort --check-only --profile black src tests',
    ].join(' && '),
    required: true,
  },
  {
    id: 'js-lint-clean',
    description: 'eslint + prettier + tsc (if JS/TS files present)',
    command: 'npm run lint:ci-js || echo "No JS lint configured — advisory"',
    required: false,
  },
  {
    id: 'super-linter-gate',
    description: 'YAML/JSON/MD governance files (advisory)',
    command: 'echo "Super-Linter advisory — implement in Phase 0.6"',
    required: false,
  },
  {
    id: 'charter-integrity',
    description: 'Production schedule charter integrity check',
    command: 'node scripts/ci/charter-integrity-check.js',
    required: true,
  },
  {
    id: 'no-hardcoded-balance',
    description: 'Prohibit hardcoded balance constants in src',
    command: 'node scripts/ci/no-hardcoded-balance.js',
    required: true,
  },
  {
    id: 'tenant-id-scope',
    description: 'Enforce tenant_id query scoping in services',
    command: 'node scripts/ci/tenant-id-scope-check.js',
    required: true,
  },
  {
    id: 'seed-fixture-alignment',
    description: 'Ensure fixtures and seed data remain aligned',
    command: 'node scripts/ci/seed-fixture-alignment-check.js',
    required: true,
  },
  {
    id: 'log-secret-leak',
    description: 'Reject potential secret/token leaks in logs',
    command: 'node scripts/ci/log-secret-leak-check.js',
    required: true,
  },
  {
    id: 'openapi-freeze',
    description: 'Detect OpenAPI contract drift',
    command: 'node scripts/ci/openapi-freeze-check.js',
    required: true,
  },
  {
    id: 'super-linter-clean',
    description: 'Run advisory Super-Linter in local docker mode',
    command: `docker run --rm -e VALIDATE_ALL_CODEBASE=false -e FILTER_REGEX_INCLUDE="^(\\\\.github/|docs/|PROGRAM_CONTROL/|[^/]+\\\\.(md|yml|yaml|json)$)" -e VALIDATE_MARKDOWN=true -e VALIDATE_JSON=true -e VALIDATE_YAML=true -e LINTER_RULES_PATH=.github/linters -e GITHUB_ACTIONS=true -v ${shellEscape(`${process.cwd()}:/tmp/lint`)} ghcr.io/super-linter/super-linter:slim-v8`,
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

for (const invariant of INVARIANTS) {
  if (invariant.skip) {
    console.log(`SHIP-GATE [${invariant.id}] SKIPPED: ${invariant.skipReason}`);
    continue;
  }

  try {
    console.log(`SHIP-GATE [${invariant.id}] RUN: ${invariant.command}`);
    runCommand(invariant.command, { shell: '/bin/bash' });
    console.log(`SHIP-GATE [${invariant.id}] PASS`);
  } catch (error) {
    console.error(`SHIP-GATE [${invariant.id}] FAIL`);
    console.error(error instanceof Error ? error.message : String(error));
    if (invariant.required) {
      failed = true;
      break;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('SHIP-GATE: PASS');
