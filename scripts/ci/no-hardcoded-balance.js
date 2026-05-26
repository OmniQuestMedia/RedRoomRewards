#!/usr/bin/env node
/**
 * No-hardcoded-balance CI guard (Task B-008).
 *
 * Enforces the schedule invariant:
 *   "No hardcoded balance values in `src/` outside test files."
 *
 * Scans every `*.ts` file under `src/` (excluding `*.spec.ts`,
 * `*.test.ts`, and any path containing `__tests__/`) for assignments
 * to a `*[Bb]alance*` identifier whose right-hand side is a non-zero
 * numeric literal. Zero is allowed (legitimate initial-state seeding).
 * A line with the trailing comment `// ci-allow: balance-value` is
 * exempted (used for index-definition lines like
 * `WalletSchema.index({ availableBalance: 1 })`).
 *
 * Exits 0 on a clean tree, 1 on any violation. Designed to run from
 * the repo root.
 *
 * Usage:
 *   node scripts/ci/no-hardcoded-balance.js
 *   node scripts/ci/no-hardcoded-balance.js --self-test
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');

// Match `<word>[Bb]alance<word>?: <digits>` or `... = <digits>`
// Skip lines whose RHS is exactly `0` or `0,` or `0;` (zero is allowed).
// Skip lines containing `index({` (mongoose schema indexes).
// Skip lines containing the explicit allow-comment.
const BALANCE_ASSIGN_RE =
  /(^|[^A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*[Bb]alance[A-Za-z0-9_]*)\s*[:=]\s*(-?\d[\d_]*(?:\.\d+)?)\b/;

const ALLOW_COMMENT = '// ci-allow: balance-value';

function isExcludedFile(rel) {
  return (
    rel.endsWith('.spec.ts') ||
    rel.endsWith('.test.ts') ||
    rel.includes(`${path.sep}__tests__${path.sep}`) ||
    rel.includes('/__tests__/')
  );
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      yield full;
    }
  }
}

function findViolations(rootDir = SRC_DIR) {
  const violations = [];
  if (!fs.existsSync(rootDir)) return violations;

  for (const file of walk(rootDir)) {
    const rel = path.relative(REPO_ROOT, file);
    if (isExcludedFile(rel)) continue;

    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(ALLOW_COMMENT)) continue;
      // Schema-index lines (`Schema.index({ availableBalance: 1 })`) are
      // index orderings, not balance values; exempt them.
      if (/Schema\.index\s*\(/.test(line)) continue;

      const m = line.match(BALANCE_ASSIGN_RE);
      if (!m) continue;

      const fieldName = m[2];
      const value = m[3];

      // Allow zero (initial-state seeding).
      if (/^-?0(\.0+)?$/.test(value)) continue;

      // Allow obvious type-annotation lines (`balance: number`, etc.) —
      // these don't match the regex anyway, but defensive.
      violations.push({
        file: rel,
        line: i + 1,
        snippet: line.trim(),
        field: fieldName,
        value,
      });
    }
  }
  return violations;
}

function selfTest() {
  const tmpDir = path.join(REPO_ROOT, '.tmp-balance-guard-fixture');
  const tmpSrc = path.join(tmpDir, 'src');
  const tmpFile = path.join(tmpSrc, 'bad-fixture.ts');
  const cleanFile = path.join(tmpSrc, 'clean-fixture.ts');
  const allowedFile = path.join(tmpSrc, 'allowed-fixture.ts');

  try {
    fs.mkdirSync(tmpSrc, { recursive: true });
    fs.writeFileSync(
      tmpFile,
      [
        'export const wallet = {',
        '  availableBalance: 12450,',
        '  escrowBalance: 0,',
        '};',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      cleanFile,
      ['export const wallet = {', '  availableBalance: 0,', '  escrowBalance: 0,', '};', ''].join(
        '\n',
      ),
    );
    fs.writeFileSync(
      allowedFile,
      ['export const wallet = {', `  availableBalance: 12450, ${ALLOW_COMMENT}`, '};', ''].join(
        '\n',
      ),
    );

    const v = findViolations(tmpSrc);

    const expectedFile = path.relative(REPO_ROOT, tmpFile);
    const offenders = v.filter((x) => x.file === expectedFile);
    const cleanHits = v.filter((x) => x.file === path.relative(REPO_ROOT, cleanFile));
    const allowedHits = v.filter((x) => x.file === path.relative(REPO_ROOT, allowedFile));

    if (offenders.length !== 1 || offenders[0].field !== 'availableBalance') {
      console.error(
        `SELF-TEST FAIL: bad-fixture.ts should produce exactly one violation on availableBalance; got: ${JSON.stringify(offenders)}`,
      );
      return false;
    }
    if (cleanHits.length !== 0) {
      console.error(
        `SELF-TEST FAIL: clean-fixture.ts (zero-only) should produce no violations; got: ${JSON.stringify(cleanHits)}`,
      );
      return false;
    }
    if (allowedHits.length !== 0) {
      console.error(
        `SELF-TEST FAIL: allowed-fixture.ts (with allow-comment) should produce no violations; got: ${JSON.stringify(allowedHits)}`,
      );
      return false;
    }
    console.log('no-hardcoded-balance self-test: OK');
    return true;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const v = findViolations();
  if (v.length === 0) {
    console.log('no-hardcoded-balance: OK (0 violations across src/)');
    process.exit(0);
  }

  console.error(`no-hardcoded-balance: ${v.length} violation(s) found:`);
  for (const x of v) {
    console.error(`  ${x.file}:${x.line}  ${x.field} = ${x.value}`);
    console.error(`    ${x.snippet}`);
  }
  console.error(
    '\nFix: replace the hardcoded value with a value sourced from the ledger /' +
      ' wallet service, or add `' +
      ALLOW_COMMENT +
      '` if the literal is a justified non-balance use (e.g. an index ordering).',
  );
  process.exit(1);
}

main();
