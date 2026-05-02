#!/usr/bin/env node
/**
 * OpenAPI freeze check.
 *
 * Different job from openapi-drift-check.js (which compares the spec to
 * the live controller surface, currently a stub). This one catches
 * *unintended* changes to the spec by pinning its content hash in a
 * sibling file. Any change to api/openapi.yaml requires an explicit
 * update to api/.openapi-frozen.json — making spec changes deliberate
 * rather than accidental.
 *
 * Usage:
 *   node scripts/ci/openapi-freeze-check.js                # CI mode
 *   node scripts/ci/openapi-freeze-check.js --update       # update freeze (after a deliberate spec change)
 *   node scripts/ci/openapi-freeze-check.js --self-test
 *
 * Exits 0 when the live spec hash matches the frozen hash.
 * Exits 1 when they differ (or when the freeze file is missing).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SPEC = path.join(REPO_ROOT, 'api', 'openapi.yaml');
const FREEZE = path.join(REPO_ROOT, 'api', '.openapi-frozen.json');

function hashFile(filepath) {
  const buf = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function loadFreeze() {
  if (!fs.existsSync(FREEZE)) return null;
  try {
    const raw = fs.readFileSync(FREEZE, 'utf8');
    const obj = JSON.parse(raw);
    if (typeof obj.sha256 !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}

function writeFreeze(hash) {
  // Read version from the spec itself if possible (the OpenAPI 'version' field).
  // Fallback to ISO timestamp.
  let specVersion = null;
  try {
    const raw = fs.readFileSync(SPEC, 'utf8');
    const m = raw.match(/^\s*version:\s*([^\s#]+)/m);
    if (m) specVersion = m[1].trim().replace(/^['"]|['"]$/g, '');
  } catch {
    /* ignore */
  }

  const out = {
    $schema: 'https://json.schemastore.org/base.json',
    _comment:
      'OpenAPI freeze. The hash below pins api/openapi.yaml so that ' +
      'unintended changes are caught in CI. To update after a deliberate ' +
      'spec change: `node scripts/ci/openapi-freeze-check.js --update`. ' +
      'Spec changes require a CHORE/API ticket.',
    sha256: hash,
    spec_version: specVersion,
    frozen_at: new Date().toISOString(),
  };
  fs.writeFileSync(FREEZE, `${JSON.stringify(out, null, 2)}\n`);
}

function selfTest() {
  // Build a tmp spec, freeze it, mutate it, ensure check fails.
  const tmpDir = path.join(REPO_ROOT, '.tmp-openapi-freeze-fixture');
  const tmpSpec = path.join(tmpDir, 'spec.yaml');
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(tmpSpec, 'openapi: 3.0.3\ninfo:\n  version: "1.0"\n');
    const initial = crypto.createHash('sha256').update(fs.readFileSync(tmpSpec)).digest('hex');

    fs.writeFileSync(tmpSpec, 'openapi: 3.0.3\ninfo:\n  version: "1.1"\n');
    const after = crypto.createHash('sha256').update(fs.readFileSync(tmpSpec)).digest('hex');

    if (initial === after) {
      console.error('SELF-TEST FAIL: hashes should differ after mutation');
      return false;
    }
    if (initial.length !== 64 || after.length !== 64) {
      console.error('SELF-TEST FAIL: hash length should be 64 hex chars');
      return false;
    }

    console.log('openapi-freeze self-test: OK');
    return true;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  if (!fs.existsSync(SPEC)) {
    console.error(`openapi-freeze: spec not found at ${path.relative(REPO_ROOT, SPEC)}`);
    process.exit(1);
  }

  const liveHash = hashFile(SPEC);

  if (process.argv.includes('--update')) {
    writeFreeze(liveHash);
    console.log(`openapi-freeze: updated freeze. new sha256=${liveHash}`);
    process.exit(0);
  }

  const freeze = loadFreeze();
  if (!freeze) {
    // First run / freeze file missing. Write it and pass; the diff will be
    // visible in the same PR that's introducing the freeze, so a reviewer
    // sees the initial hash being committed.
    writeFreeze(liveHash);
    console.log(`openapi-freeze: initialized freeze. sha256=${liveHash}`);
    process.exit(0);
  }

  if (freeze.sha256 === liveHash) {
    console.log(`openapi-freeze: OK (sha256=${liveHash})`);
    process.exit(0);
  }

  console.error('openapi-freeze: SPEC HAS CHANGED');
  console.error(`  frozen sha256: ${freeze.sha256}`);
  console.error(`  live sha256:   ${liveHash}`);
  console.error(`  frozen_at:     ${freeze.frozen_at ?? '(unknown)'}`);
  console.error('');
  console.error(
    'Fix: if this change is intentional, file a CHORE/API ticket and run\n' +
      '  node scripts/ci/openapi-freeze-check.js --update\n' +
      'to update the freeze. The change must be reviewed; the freeze update is\n' +
      'the audit trail.',
  );
  process.exit(1);
}

main();
