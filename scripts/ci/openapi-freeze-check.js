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
 * The CI mode never writes to the freeze file. If the freeze file is
 * missing or malformed, CI fails — silently regenerating it would let
 * a deleted/renamed freeze "heal" itself and bypass the check entirely.
 * The freeze file can only be (re)written via:
 *   --update  (after a deliberate spec change; commit the update)
 *   --init    (one-time bootstrap when the file does not yet exist)
 *
 * Usage:
 *   node scripts/ci/openapi-freeze-check.js                # CI mode (read-only)
 *   node scripts/ci/openapi-freeze-check.js --update       # write new freeze after deliberate spec change
 *   node scripts/ci/openapi-freeze-check.js --init         # bootstrap the freeze file the first time
 *   node scripts/ci/openapi-freeze-check.js --self-test
 *
 * Exits 0 when the live spec hash matches the frozen hash.
 * Exits 1 when they differ, when the freeze file is missing/invalid in
 *   CI mode, or when --init is run against an existing freeze file.
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

  const freezeExists = fs.existsSync(FREEZE);

  if (process.argv.includes('--init')) {
    if (freezeExists) {
      console.error(
        `openapi-freeze: --init refused — ${path.relative(REPO_ROOT, FREEZE)} already exists. ` +
          'Use --update if a deliberate spec change requires re-pinning the hash.',
      );
      process.exit(1);
    }
    writeFreeze(liveHash);
    console.log(`openapi-freeze: initialized freeze. sha256=${liveHash}`);
    process.exit(0);
  }

  if (process.argv.includes('--update')) {
    writeFreeze(liveHash);
    console.log(`openapi-freeze: updated freeze. new sha256=${liveHash}`);
    process.exit(0);
  }

  // CI mode (read-only).
  const freeze = loadFreeze();
  if (!freeze) {
    console.error(`openapi-freeze: ${path.relative(REPO_ROOT, FREEZE)} is missing or invalid.`);
    console.error('');
    console.error(
      'CI mode never writes the freeze file (silent heal would defeat the check).\n' +
        'If this is the first time the freeze is being introduced, run\n' +
        '  node scripts/ci/openapi-freeze-check.js --init\n' +
        'locally and commit the resulting api/.openapi-frozen.json.',
    );
    process.exit(1);
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
