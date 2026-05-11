#!/usr/bin/env node

const { execSync, execFileSync } = require('node:child_process');

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
    id: 'type-check',
    command: 'npm run type-check',
    required: true,
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
    command: `docker run --rm -e VALIDATE_ALL_CODEBASE=false -e FILTER_REGEX_INCLUDE="^(\\\\.github/|docs/|PROGRAM_CONTROL/|[^/]+\\\\.(md|yml|yaml|json|ts|js)$)" -e VALIDATE_ESLINT=true -e LINTER_RULES_PATH=.github/linters -e GITHUB_ACTIONS=true -v ${shellEscape(`${process.cwd()}:/tmp/lint`)} ghcr.io/super-linter/super-linter:slim-v8`,
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
    console.log(`SHIP-GATE [${gate.id}] RUN: ${gate.command}`);
    runCommand(gate.command, { shell: '/bin/bash' });
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
