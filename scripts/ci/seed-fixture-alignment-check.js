#!/usr/bin/env node
/**
 * Seed-fixture alignment CI guard.
 *
 * Asserts that the fixture identifiers in `scripts/seed-alpha-staging.ts`
 * match the fixture identifiers documented in `docs/ALPHA_TEST_PACK.md` §3.
 *
 * Drift between these two files is the most likely real failure mode: a
 * test pack referencing `test-member-foo-002` that was never seeded, or a
 * seeded fixture that no test references and therefore silently bit-rots.
 *
 * Operators (`test-operator-*`) are intentionally excluded from the seed
 * script (they're auth-side, not balance-side) — this guard knows that
 * and only requires their presence in the test pack, not in the seed.
 *
 * Behavior:
 *   - Parses each file's fixture surface with deliberately narrow regex.
 *   - Reports any mismatch. Exits 1 on mismatch, 0 on alignment.
 *   - Designed to run from the repo root.
 *
 * Usage:
 *   node scripts/ci/seed-fixture-alignment-check.js
 *   node scripts/ci/seed-fixture-alignment-check.js --self-test
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEST_PACK = path.join(REPO_ROOT, 'docs', 'ALPHA_TEST_PACK.md');
const SEED_SCRIPT = path.join(REPO_ROOT, 'scripts', 'seed-alpha-staging.ts');

// Identifiers in the test pack §3 fixture table look like:
//   `test-member-gold-001`
//   `test-model-001`
//   `test-operator-oqmi-001`
const ID_RE = /`(test-(?:member|model|operator)-[a-z0-9-]+)`/g;

// In the seed script we expect to see the IDs as quoted string literals
// inside the fixture arrays. Same shape, single or double quoted.
const SEED_ID_RE = /['"](test-(?:member|model|operator)-[a-z0-9-]+)['"]/g;

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

function extractIds(source, re) {
  const ids = new Set();
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(source))) {
    ids.add(m[1]);
  }
  return ids;
}

function classify(id) {
  if (id.startsWith('test-member-')) return 'member';
  if (id.startsWith('test-model-')) return 'model';
  if (id.startsWith('test-operator-')) return 'operator';
  return 'unknown';
}

function compare(testPackIds, seedIds) {
  const errors = [];

  for (const id of testPackIds) {
    const cls = classify(id);
    if (cls === 'operator') continue; // operators not seeded by design
    if (!seedIds.has(id)) {
      errors.push(
        `${id} appears in docs/ALPHA_TEST_PACK.md §3 but is NOT seeded by scripts/seed-alpha-staging.ts`,
      );
    }
  }

  for (const id of seedIds) {
    const cls = classify(id);
    if (cls === 'operator') {
      errors.push(
        `${id} is seeded by scripts/seed-alpha-staging.ts but operators are auth-side, not balance-side; remove from the seed script`,
      );
      continue;
    }
    if (!testPackIds.has(id)) {
      errors.push(
        `${id} is seeded by scripts/seed-alpha-staging.ts but is NOT documented in docs/ALPHA_TEST_PACK.md §3`,
      );
    }
  }

  return errors;
}

function main() {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  // Both files are canonical for this guard. Missing-file cases must FAIL,
  // not silently pass — exit 0 here would let an accidental rename / delete
  // bypass the check. If either canonical file is genuinely going away, the
  // guard itself should be deliberately removed in the same PR.
  if (!fs.existsSync(TEST_PACK)) {
    console.error(
      `seed-fixture-alignment-check: REQUIRED FILE MISSING — ${path.relative(REPO_ROOT, TEST_PACK)}`,
    );
    console.error(
      'This is a canonical alignment-check input. If you intentionally removed it,\n' +
        'remove this CI guard in the same PR. Otherwise restore the file.',
    );
    return process.exit(1);
  }

  if (!fs.existsSync(SEED_SCRIPT)) {
    console.error(
      `seed-fixture-alignment-check: REQUIRED FILE MISSING — ${path.relative(REPO_ROOT, SEED_SCRIPT)}`,
    );
    console.error(
      'This is a canonical alignment-check input. If you intentionally removed it,\n' +
        'remove this CI guard in the same PR. Otherwise restore the file.',
    );
    return process.exit(1);
  }

  const testPackIds = extractIds(readFile(TEST_PACK), ID_RE);
  const seedIds = extractIds(readFile(SEED_SCRIPT), SEED_ID_RE);

  const errors = compare(testPackIds, seedIds);

  if (errors.length === 0) {
    console.log(
      `seed-fixture-alignment-check: OK (${testPackIds.size} test-pack IDs, ${seedIds.size} seed IDs)`,
    );
    return process.exit(0);
  }

  console.error(`seed-fixture-alignment-check: ${errors.length} mismatch(es):`);
  for (const err of errors) console.error(`  ${err}`);
  console.error(
    '\nFix: keep scripts/seed-alpha-staging.ts and docs/ALPHA_TEST_PACK.md §3 in lock-step.',
  );
  process.exit(1);
}

function selfTest() {
  // Inline mini-fixtures.
  const testPackOk = `
| Member (GOLD)     | \`test-member-gold-001\` |
| Model             | \`test-model-001\`        |
| Operator (OQMI)   | \`test-operator-oqmi-001\`|
`;
  const seedOk = `
{ userId: 'test-member-gold-001', availableBalance: 5000 },
{ modelId: 'test-model-001', earnedBalance: 2500 },
`;

  const okIds = compare(extractIds(testPackOk, ID_RE), extractIds(seedOk, SEED_ID_RE));
  if (okIds.length !== 0) {
    console.error(
      `SELF-TEST FAIL: aligned fixtures should report no errors; got: ${JSON.stringify(okIds)}`,
    );
    return false;
  }

  // Drift: seed missing a member.
  const seedDriftMissing = `{ userId: 'test-member-other-001', availableBalance: 5000 },`;
  const driftErrors = compare(
    extractIds(testPackOk, ID_RE),
    extractIds(seedDriftMissing, SEED_ID_RE),
  );
  if (driftErrors.length === 0) {
    console.error(`SELF-TEST FAIL: missing-from-seed should produce errors; got none`);
    return false;
  }

  // Drift: seed includes an operator (which the rule disallows).
  const seedDriftOperator = `{ userId: 'test-operator-oqmi-001', availableBalance: 0 },`;
  const operatorErrors = compare(
    extractIds(testPackOk, ID_RE),
    extractIds(seedDriftOperator, SEED_ID_RE),
  );
  if (!operatorErrors.some((e) => /operators are auth-side/.test(e))) {
    console.error(
      `SELF-TEST FAIL: seeded-operator should be flagged; got: ${JSON.stringify(operatorErrors)}`,
    );
    return false;
  }

  console.log('seed-fixture-alignment-check self-test: OK');
  return true;
}

main();
