// ============================================================
// OmniQuest Media Inc. / iMagiNarratives Inc.
// © 2024–2026 OmniQuest Media Inc. All rights reserved.
// Proprietary and confidential. Unauthorized use prohibited.
// Governed by ZoneGPT (MaxZone / OQMIgpt) — Corpus v11
// ============================================================
//
// rule_applied_id: GOVERNANCE-EQ-v1
//
// canonical-mirror-selfcheck.js — distributed defense-in-depth for canonical
// artifacts (fleet doc-kit). PORTABLE and ZERO-COUPLING: it reads a per-repo
// manifest (.canonical-mirrors.json) that pins the SHA-256 of each canonical
// artifact this repo mirrors, and verifies the local mirror still matches that
// pin. No network, no cross-repo token, no dependencies. If the manifest is
// absent or empty it is a clean no-op, so the file drops into any OQMInc repo
// unchanged.
//
// The pinned hash is the contract. When a canonical changes, OmniComplianceZone
// (the control plane, services/drift-detection) opens the sync PR that updates
// both the mirror file and its pinned hash here — this self-check is the local
// tripwire that keeps a mirror from silently diverging between those syncs.
//
// Advisory by default: exits 0 even on drift so it never breaks an unrelated
// pipeline. Set CANONICAL_MIRROR_ENFORCE=1 (repo variable) to fail CI on drift.
//
// Usage: node scripts/canonical-mirror-selfcheck.js

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TAG = 'canonical-mirror-selfcheck';
const MANIFEST = '.canonical-mirrors.json';

// Must match OmniComplianceZone canonical-mirror.ts normaliseContent():
// CRLF -> LF, then strip trailing blank lines.
function normalise(content) {
  return content.replace(/\r\n/g, '\n').replace(/\n+$/, '');
}

function sha256(content) {
  const hash = crypto.createHash('sha256');
  return hash.update(normalise(content), 'utf8').digest('hex');
}

function readManifest() {
  const abs = path.resolve(process.cwd(), MANIFEST);
  if (!fs.existsSync(abs)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`${TAG}: cannot parse ${MANIFEST}: ${err.message}`);
    return [];
  }
}

function evaluate(entry) {
  if (!entry.path || !entry.canonicalSha256) {
    return { status: 'SKIP', entry };
  }
  if (!fs.existsSync(entry.path)) {
    return { status: 'MISSING', entry };
  }
  const localHash = sha256(fs.readFileSync(entry.path, 'utf8'));
  const status = localHash === entry.canonicalSha256 ? 'IN_SYNC' : 'DRIFTED';
  return { status, entry, localHash };
}

function reportDrift(result) {
  const expected = `         expected ${result.entry.canonicalSha256}`;
  const actual = `         actual   ${result.localHash}`;
  console.log(expected);
  console.log(actual);
}

function main() {
  const manifest = readManifest();
  if (manifest === null) {
    console.log(`${TAG}: no ${MANIFEST} — nothing to check.`);
    return 0;
  }
  if (manifest.length === 0) {
    console.log(`${TAG}: ${MANIFEST} is empty — no mirrors registered.`);
    return 0;
  }

  const results = manifest.map(evaluate);
  let drifted = 0;
  let missing = 0;
  for (const result of results) {
    const ref = result.entry.canonical || result.entry.artifactId || '';
    const label = String(result.status).padEnd(8);
    const line = `${label} ${result.entry.path}  (canonical ${ref})`;
    console.log(line);
    if (result.status === 'DRIFTED') {
      drifted += 1;
      reportDrift(result);
    } else if (result.status === 'MISSING') {
      missing += 1;
    }
  }

  const summary = `${TAG}: ${results.length} checked, ${drifted} drifted, ${missing} missing`;
  console.log(summary);

  const flag = process.env.CANONICAL_MIRROR_ENFORCE;
  const enforce = flag === '1' || flag === 'true';
  if (drifted + missing > 0) {
    const failMsg = `${TAG}: drift detected — failing (CANONICAL_MIRROR_ENFORCE set).`;
    const advisoryMsg = `${TAG}: drift detected — advisory only; OmniComplianceZone will open a sync PR.`;
    console.log(enforce ? failMsg : advisoryMsg);
    return enforce ? 1 : 0;
  }
  console.log(`${TAG}: all mirrors in sync.`);
  return 0;
}

process.exitCode = main();
