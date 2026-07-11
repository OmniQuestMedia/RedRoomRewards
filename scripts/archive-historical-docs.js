// ============================================================
// OmniQuest Media Inc. / iMagiNarratives Inc.
// © 2024–2026 OmniQuest Media Inc. All rights reserved.
// Proprietary and confidential. Unauthorized use prohibited.
// Governed by ZoneGPT (MaxZone / OQMIgpt) — Corpus v11
// ============================================================
//
// archive-historical-docs.js — the reports-scope archival pass. Quarantines
// spent point-in-time reports (the HISTORICAL bucket from classify-docs.js)
// into archive/<YYYY-MM>/ under the quarantine-and-burn policy in
// docs/SOURCE_OF_TRUTH.md. Nothing is deleted — git history preserves it, and
// the move is a reversible quarantine with a tripwire manifest.
//
// SCOPE (deliberately conservative by default):
//   default            — HISTORICAL docs at repo ROOT and under docs/ only
//                        (the visible clutter). Leaves PROGRAM_CONTROL history
//                        in place (already organized + governance-wired).
//   --include-program-control
//                      — ALSO sweep PROGRAM_CONTROL/REPORT_BACK/ and
//                        PROGRAM_CONTROL/DIRECTIVES/DONE/. Bigger shrink; only
//                        run with governance sign-off.
//
// GUARDRAILS (always): never touches a path containing ledger/consent/pii
// (fail-closed restricted-path gate), never re-archives files already under
// archive/, never touches CANONICAL/UNKNOWN docs (only HISTORICAL move).
//
// Usage:
//   node scripts/archive-historical-docs.js                 # dry-run (default)
//   node scripts/archive-historical-docs.js --apply         # perform the moves
//   node scripts/archive-historical-docs.js --apply --include-program-control

/* eslint-disable no-console, @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports -- portable CLI script (CommonJS; console is the interface) */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');
const INCLUDE_PC = process.argv.includes('--include-program-control');

// Mirrors the CI restricted-path gate — a doc whose path hits this is fail-closed.
const RESTRICTED = /(^|\/)(ledger|consent|pii)(\/|$)|(ledger|consent|pii)/i;

function historicalDocs() {
  const out = execSync('node scripts/classify-docs.js --json', { cwd: ROOT, encoding: 'utf8' });
  return JSON.parse(out).buckets.HISTORICAL;
}

function inScope(f) {
  if (f.startsWith('archive/')) return false; // already quarantined
  if (RESTRICTED.test(f)) return false; // restricted-path gate
  if (f.startsWith('PROGRAM_CONTROL/')) {
    return (
      INCLUDE_PC &&
      (f.startsWith('PROGRAM_CONTROL/REPORT_BACK/') ||
        f.startsWith('PROGRAM_CONTROL/DIRECTIVES/DONE/'))
    );
  }
  // repo root (no slash) or under docs/
  return !f.includes('/') || f.startsWith('docs/');
}

function ymNow() {
  // Regular CLI run — Date is available here (unlike workflow scripts).
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function banner(date, canonicalHint) {
  return (
    `> **ARCHIVED ${date}** — spent point-in-time report, quarantined per ` +
    `\`docs/SOURCE_OF_TRUTH.md\`. Not for current work; the live source of truth is ` +
    `${canonicalHint}. Git history preserves the original.\n\n`
  );
}

function main() {
  const ym = ymNow();
  const date = new Date().toISOString().slice(0, 10);
  const all = historicalDocs();
  const skippedRestricted = all.filter((f) => !f.startsWith('archive/') && RESTRICTED.test(f));
  const targets = all.filter(inScope);

  console.log(
    `archive-historical-docs: ${targets.length} doc(s) to quarantine ` +
      `(scope: root + docs/${INCLUDE_PC ? ' + PROGRAM_CONTROL history' : ''})`,
  );
  if (skippedRestricted.length) {
    console.log(
      `  ⚠ skipping ${skippedRestricted.length} restricted-path HISTORICAL doc(s) (ledger/consent/pii): ` +
        skippedRestricted.join(', '),
    );
  }
  if (!targets.length) {
    console.log('  nothing to do.');
    return;
  }
  for (const f of targets) console.log('  → archive/' + ym + '/' + f);

  if (!APPLY) {
    console.log('\nDry-run. Re-run with --apply to perform the moves.');
    return;
  }

  const manifestRows = [];
  for (const f of targets) {
    const dest = path.join('archive', ym, f);
    fs.mkdirSync(path.join(ROOT, path.dirname(dest)), { recursive: true });
    // git mv preserves history; fall back to fs rename if the file is untracked.
    try {
      execSync(`git mv "${f}" "${dest}"`, { cwd: ROOT, stdio: 'pipe' });
    } catch {
      fs.renameSync(path.join(ROOT, f), path.join(ROOT, dest));
      execSync(`git add "${dest}"`, { cwd: ROOT, stdio: 'pipe' });
    }
    // Prepend the archived banner.
    const abs = path.join(ROOT, dest);
    const body = fs.readFileSync(abs, 'utf8');
    fs.writeFileSync(
      abs,
      banner(date, '`README.md` / the canonical docs in `docs/SOURCE_OF_TRUTH.md`') + body,
    );
    execSync(`git add "${dest}"`, { cwd: ROOT, stdio: 'pipe' });
    manifestRows.push({ from: f, to: dest });
  }

  // Append to the tripwire manifest.
  const manifestPath = path.join(ROOT, 'archive', 'MANIFEST.md');
  let manifest = '';
  if (fs.existsSync(manifestPath)) {
    manifest = fs.readFileSync(manifestPath, 'utf8').replace(/\s+$/, '') + '\n\n';
  } else {
    manifest =
      '# Archive Manifest\n\n' +
      'Quarantined docs under the burn policy in `docs/SOURCE_OF_TRUTH.md`. If you ' +
      'consult one, set its `Consulted?` to the date + who, and promote the needed ' +
      'fact into the live canonical doc. Reach a green launch with an all-`no` ' +
      'column → the archive is provably dead → delete it in one `CHORE:` commit.\n\n';
  }
  manifest += `## Quarantined ${date}\n\n`;
  manifest += '| Original path | Archived path | Consulted? |\n';
  manifest += '| ------------- | ------------- | ---------- |\n';
  for (const r of manifestRows) manifest += `| \`${r.from}\` | \`${r.to}\` | no |\n`;
  manifest += '\n';
  fs.writeFileSync(manifestPath, manifest);
  execSync(`git add "${path.join('archive', 'MANIFEST.md')}"`, { cwd: ROOT, stdio: 'pipe' });

  // Regenerate machine-managed blocks so counts/classification stay honest.
  execSync('node scripts/refresh-claude-md.js', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/classify-docs.js', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/check-claude-md.js', { cwd: ROOT, stdio: 'inherit' });

  console.log(
    `\narchive-historical-docs: quarantined ${manifestRows.length} doc(s) into archive/${ym}/. ` +
      'Review the diff, keep the PR a draft for ratification, then merge.',
  );
}

main();
