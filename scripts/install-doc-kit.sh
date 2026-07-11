#!/usr/bin/env bash
# ============================================================
# OmniQuest Media Inc. / iMagiNarratives Inc.
# © 2024–2026 OmniQuest Media Inc. All rights reserved.
# Proprietary and confidential. Unauthorized use prohibited.
# Governed by ZoneGPT (MaxZone / OQMIgpt) — Corpus v11
# ============================================================
#
# install-doc-kit.sh — self-contained bootstrap for the CLAUDE.md doc-freshness
# + source-of-truth kit. Drop it into ANY OQMInc repo and run it once; it writes
# the three scripts, two workflows, a CLAUDE.md skeleton (only if missing), and a
# SOURCE_OF_TRUTH template (only if missing), then regenerates the facts block,
# the classification manifest, and runs the pointer check.
#
# Usage:
#   bash install-doc-kit.sh [target-repo-dir]   # defaults to current directory
#
# Idempotent: re-running refreshes the scripts/workflows and regenerates the
# machine-managed blocks. It never overwrites an existing CLAUDE.md or
# SOURCE_OF_TRUTH.md — those hold curated prose.
set -euo pipefail

T="${1:-$(pwd)}"
if [ ! -d "$T" ]; then echo "install-doc-kit: target dir '$T' not found" >&2; exit 1; fi
mkdir -p "$T/scripts" "$T/.github/workflows" "$T/docs"
echo "install-doc-kit: installing into $T"

# --- scripts/refresh-claude-md.js ---
cat > "$T/scripts/refresh-claude-md.js" <<'KIT_REFRESH_JS'
// ============================================================
// OmniQuest Media Inc. / iMagiNarratives Inc.
// © 2024–2026 OmniQuest Media Inc. All rights reserved.
// Proprietary and confidential. Unauthorized use prohibited.
// Governed by ZoneGPT (MaxZone / OQMIgpt) — Corpus v11
// ============================================================
//
// refresh-claude-md.js — regenerates the mechanical-facts block inside
// CLAUDE.md so it never silently rots. PORTABLE: derives everything from
// generic repo signals (package.json, workspace dirs, lockfiles) and
// degrades gracefully when a signal is absent, so it drops into any repo
// unchanged. It rewrites ONLY the content between the generated markers —
// all curated prose is left untouched. No timestamp is written inside the
// block, so a run with no factual change produces no diff (and no commit).
//
// Usage: node scripts/refresh-claude-md.js [--check]
//   (default)  rewrite CLAUDE.md in place
//   --check    exit 1 if the block is stale (for CI); never writes

/* eslint-disable no-console, @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports -- portable CLI script (CommonJS; console is the interface) */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CLAUDE = path.join(ROOT, 'CLAUDE.md');
const BEGIN = '<!-- BEGIN:generated:repo-facts -->';
const END = '<!-- END:generated:repo-facts -->';

function exists(p) {
  try {
    fs.accessSync(path.join(ROOT, p));
    return true;
  } catch {
    return false;
  }
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
  } catch {
    return null;
  }
}

// Count immediate subdirectories of a dir (ignoring files + dotfiles).
function countSubdirs(rel) {
  try {
    return fs
      .readdirSync(path.join(ROOT, rel), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.')).length;
  } catch {
    return null;
  }
}

function detectPackageManager() {
  if (exists('yarn.lock')) return 'Yarn';
  if (exists('pnpm-lock.yaml')) return 'pnpm';
  if (exists('package-lock.json')) return 'npm';
  return 'unknown';
}

function trackedMarkdownCount() {
  // Best-effort: walk the tree without shelling out to git so the script
  // works in any checkout. Skips node_modules/.git/dist/.next.
  const SKIP = new Set(['node_modules', '.git', 'dist', '.next', 'coverage']);
  let count = 0;
  const stack = ['.'];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue;
        stack.push(path.join(dir, e.name));
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        count++;
      }
    }
  }
  return count;
}

function buildFacts() {
  const pkg = readJson('package.json') || {};
  const rows = [];

  rows.push(['Package manager', detectPackageManager()]);

  const node = pkg.engines && pkg.engines.node;
  if (node) rows.push(['Node engines', node]);

  const ws = pkg.workspaces;
  if (ws) {
    const list = Array.isArray(ws) ? ws : ws.packages || [];
    if (list.length) rows.push(['Workspace roots', list.join(', ')]);
  }

  const svc = countSubdirs('services');
  if (svc != null) rows.push(['Service directories', String(svc)]);

  const portals = countSubdirs('apps/portals');
  if (portals != null) rows.push(['Consumer portals', String(portals)]);

  rows.push(['Tracked markdown docs', String(trackedMarkdownCount())]);

  return rows;
}

// Rendered as a fenced code block ON PURPOSE: Prettier never reflows fenced
// content, so the generator's output and CI's --check agree byte-for-byte and
// the refresh workflow never fights the formatter. (A markdown table would get
// column-padded by Prettier, making the block perpetually "stale".)
function renderBlock(rows) {
  const width = rows.reduce((w, [k]) => Math.max(w, k.length), 0);
  const lines = [
    BEGIN,
    '<!-- Auto-generated by scripts/refresh-claude-md.js. Do not edit by hand. -->',
    '',
    '```text',
    ...rows.map(([k, v]) => `${k.padEnd(width)}  ${v}`),
    '```',
    '',
    END,
  ];
  return lines.join('\n');
}

function main() {
  const check = process.argv.includes('--check');

  if (!exists('CLAUDE.md')) {
    console.error('refresh-claude-md: no CLAUDE.md in ' + ROOT + ' — skipping.');
    process.exit(0); // absence is not a failure; portable no-op
  }

  const src = fs.readFileSync(CLAUDE, 'utf8');
  const block = renderBlock(buildFacts());

  const bi = src.indexOf(BEGIN);
  const ei = src.indexOf(END);

  if (bi === -1 || ei === -1) {
    console.error(
      'refresh-claude-md: markers not found in CLAUDE.md. Insert once:\n' +
        `  ${BEGIN}\n  ${END}\n` +
        'then re-run. Skipping to stay non-destructive.',
    );
    process.exit(check ? 1 : 0);
  }

  const next = src.slice(0, bi) + block + src.slice(ei + END.length);

  if (next === src) {
    console.log('refresh-claude-md: repo-facts block already current.');
    process.exit(0);
  }

  if (check) {
    console.error(
      'refresh-claude-md: repo-facts block is STALE. Run `node scripts/refresh-claude-md.js` and commit.',
    );
    process.exit(1);
  }

  fs.writeFileSync(CLAUDE, next);
  console.log('refresh-claude-md: repo-facts block updated.');
}

main();
KIT_REFRESH_JS

# --- scripts/check-claude-md.js ---
cat > "$T/scripts/check-claude-md.js" <<'KIT_CHECK_JS'
// ============================================================
// OmniQuest Media Inc. / iMagiNarratives Inc.
// © 2024–2026 OmniQuest Media Inc. All rights reserved.
// Proprietary and confidential. Unauthorized use prohibited.
// Governed by ZoneGPT (MaxZone / OQMIgpt) — Corpus v11
// ============================================================
//
// check-claude-md.js — fails CI when CLAUDE.md references a repo path that
// no longer exists (a "dangling pointer"). This is the cheap, high-value
// half of staleness detection: it can't judge whether prose is still true,
// but it guarantees every file/dir the doc points at is real. PORTABLE:
// pure path-existence checking, no repo-specific knowledge.
//
// It scans backtick-quoted tokens in CLAUDE.md that look like repo-relative
// paths (contain a "/", no spaces/globs/braces) and verifies each resolves
// to a file or directory. Prose, commands, and code identifiers are ignored
// because they are not path-shaped.
//
// Usage: node scripts/check-claude-md.js   (exit 1 if any pointer dangles)

/* eslint-disable no-console, @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports -- portable CLI script (CommonJS; console is the interface) */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CLAUDE = path.join(ROOT, 'CLAUDE.md');

// A token is a candidate path if it is path-shaped and not obviously prose.
// Require at least one "/", allow letters/digits/._- and slashes only.
const PATH_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+\/?$/;

// Tokens we never treat as paths even if they look path-shaped.
const IGNORE_PREFIXES = ['http:', 'https:', 'git@', 'ca-central-']; // regions, URLs

function looksLikePath(tok) {
  if (tok.includes('*') || tok.includes('{') || tok.includes('}')) return false;
  if (tok.includes('://')) return false;
  if (IGNORE_PREFIXES.some((p) => tok.startsWith(p))) return false;
  return PATH_RE.test(tok);
}

function pathExists(rel) {
  const clean = rel.replace(/\/$/, '');
  try {
    fs.accessSync(path.join(ROOT, clean));
    return true;
  } catch {
    return false;
  }
}

function main() {
  if (!fs.existsSync(CLAUDE)) {
    console.error('check-claude-md: no CLAUDE.md found — nothing to check.');
    process.exit(0);
  }

  const raw = fs.readFileSync(CLAUDE, 'utf8');

  // Strip fenced code blocks (``` … ``` and ~~~ … ~~~) FIRST. Their triple
  // backticks otherwise corrupt inline-span pairing (the opening fence pairs
  // with the closing fence and swallows everything between), and the "paths"
  // inside a fenced layout tree are illustrative art, not real pointers.
  const src = raw.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '');

  // Pull every `backtick-quoted` inline span, then keep the path-shaped ones.
  const tokens = new Set();
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const tok = m[1].trim();
    if (looksLikePath(tok)) tokens.add(tok);
  }

  const missing = [];
  for (const tok of tokens) {
    if (!pathExists(tok)) missing.push(tok);
  }

  if (missing.length) {
    console.error('check-claude-md: CLAUDE.md references paths that do not exist:');
    for (const p of missing.sort()) console.error('  ✗ ' + p);
    console.error(
      '\nEither fix the reference or restore the path. ' +
        'If a path is intentionally illustrative, remove the backticks so it is not treated as a pointer.',
    );
    process.exit(1);
  }

  console.log(`check-claude-md: OK — ${tokens.size} path references all resolve.`);
}

main();
KIT_CHECK_JS

# --- scripts/classify-docs.js ---
cat > "$T/scripts/classify-docs.js" <<'KIT_CLASSIFY_JS'
// ============================================================
// OmniQuest Media Inc. / iMagiNarratives Inc.
// © 2024–2026 OmniQuest Media Inc. All rights reserved.
// Proprietary and confidential. Unauthorized use prohibited.
// Governed by ZoneGPT (MaxZone / OQMIgpt) — Corpus v11
// ============================================================
//
// classify-docs.js — buckets every tracked markdown doc into
// CANONICAL / HISTORICAL / UNKNOWN so a human can ratify what is the source
// of truth and what is a spent point-in-time report safe to archive.
// PORTABLE + reproducible: run it in any repo to get the same classification.
//
// Buckets (this is "reports scope" — deliberately conservative):
//   CANONICAL  — pinned source-of-truth docs. Seeded from
//                .github/required-files.txt (*.md entries) + a built-in
//                authority set. NEVER an archival candidate.
//   HISTORICAL — spent point-in-time reports: anything under a report
//                directory (REPORT_BACK/, DIRECTIVES/DONE/, archive/) OR a
//                strong report-named file at repo root / docs/ / PROGRAM_CONTROL/.
//                These are the ONLY archival candidates at reports scope.
//   UNKNOWN    — everything else. Left ALONE; needs human judgement, not a bot.
//
// It writes no timestamp, so output is stable unless the doc set changes.
// Usage: node scripts/classify-docs.js            (writes docs/DOC_CLASSIFICATION.md)
//        node scripts/classify-docs.js --json      (prints JSON to stdout, no write)

/* eslint-disable no-console, @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports -- portable CLI script (CommonJS; console is the interface) */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const OUT = path.join('docs', 'DOC_CLASSIFICATION.md');

// Built-in authorities that are canonical in every OQMInc repo regardless of
// required-files.txt. Matched by basename or exact path.
const BUILTIN_CANONICAL = new Set([
  'CLAUDE.md',
  'README.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
]);

// Directories whose markdown is inherently a spent report.
const REPORT_DIRS = [
  'PROGRAM_CONTROL/REPORT_BACK/',
  'PROGRAM_CONTROL/DIRECTIVES/DONE/',
  'archive/',
];

// Basename patterns that mark a report/status snapshot. Only applied to docs at
// repo root, docs/, or PROGRAM_CONTROL/ so product content is never swept in.
const REPORT_NAME_RE =
  /(REPORT-BACK|-report|_REPORT|-REPORT|FINAL-|_SUMMARY|-SUMMARY|SWEEP|CLEANUP|HYGIENE|VALIDATION|DASHBOARD|STATUS|HOMESTRETCH|COMPLETION|RELEASE-NOTE|^AUDIT-\d|^PHASE[-_]|^P0\.)/i;

const REPORT_NAME_DIRS = ['', 'docs/', 'PROGRAM_CONTROL/']; // '' == repo root

function trackedMarkdown() {
  try {
    return execSync('git ls-files "*.md"', { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadPinnedCanonical() {
  const pinned = new Set();
  const rf = path.join(ROOT, '.github', 'required-files.txt');
  try {
    for (const line of fs.readFileSync(rf, 'utf8').split('\n')) {
      const f = line.trim();
      if (!f || f.startsWith('#')) continue;
      if (f.toLowerCase().endsWith('.md')) pinned.add(f);
    }
  } catch {
    /* no required-files.txt in this repo — fine */
  }
  return pinned;
}

function inAnyDir(file, dirs) {
  return dirs.some((d) => file.startsWith(d));
}

function atNameDir(file) {
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  return REPORT_NAME_DIRS.includes(dir);
}

function classify(files, pinned) {
  const buckets = { CANONICAL: [], HISTORICAL: [], UNKNOWN: [] };
  for (const f of files) {
    const base = f.slice(f.lastIndexOf('/') + 1);
    if (pinned.has(f) || BUILTIN_CANONICAL.has(base)) {
      buckets.CANONICAL.push(f);
    } else if (inAnyDir(f, REPORT_DIRS) || (atNameDir(f) && REPORT_NAME_RE.test(base))) {
      buckets.HISTORICAL.push(f);
    } else {
      buckets.UNKNOWN.push(f);
    }
  }
  for (const k of Object.keys(buckets)) buckets[k].sort();
  return buckets;
}

function renderMarkdown(buckets, pinnedCount) {
  const total = buckets.CANONICAL.length + buckets.HISTORICAL.length + buckets.UNKNOWN.length;
  const list = (arr) => (arr.length ? arr.map((f) => `- \`${f}\``).join('\n') : '_none_');
  // Summary rendered as a fenced block (Prettier-stable — a markdown table
  // would be column-padded by the formatter and churn against regeneration).
  return `# Doc Classification (generated)

<!-- Auto-generated by scripts/classify-docs.js. Do not edit by hand. -->

Reproducible triage of every tracked markdown doc, at **reports scope**: only
HISTORICAL docs are archival candidates. CANONICAL is pinned source-of-truth
(never archived). UNKNOWN is left alone pending human judgement.

\`\`\`text
CANONICAL   ${buckets.CANONICAL.length}   source of truth (${pinnedCount} pinned via required-files.txt) — never archived
HISTORICAL  ${buckets.HISTORICAL.length}   spent point-in-time reports — archival candidates
UNKNOWN     ${buckets.UNKNOWN.length}   needs human ratification — left alone
TOTAL       ${total}
\`\`\`

## CANONICAL — source of truth (do not archive)

${list(buckets.CANONICAL)}

## HISTORICAL — archival candidates (spent reports)

These are safe to \`git mv\` into \`archive/\` under the quarantine policy in
\`docs/SOURCE_OF_TRUTH.md\`. Git history preserves them regardless.

${list(buckets.HISTORICAL)}

## UNKNOWN — human ratification required

Not touched at reports scope. Promote to CANONICAL, mark SUPERSEDED, or leave.

${list(buckets.UNKNOWN)}
`;
}

function main() {
  const files = trackedMarkdown();
  const pinned = loadPinnedCanonical();
  const buckets = classify(files, pinned);

  if (process.argv.includes('--json')) {
    process.stdout.write(
      JSON.stringify(
        {
          counts: {
            CANONICAL: buckets.CANONICAL.length,
            HISTORICAL: buckets.HISTORICAL.length,
            UNKNOWN: buckets.UNKNOWN.length,
          },
          buckets,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  fs.writeFileSync(path.join(ROOT, OUT), renderMarkdown(buckets, pinned.size));
  console.log(
    `classify-docs: ${OUT} written — ` +
      `CANONICAL ${buckets.CANONICAL.length}, ` +
      `HISTORICAL ${buckets.HISTORICAL.length}, ` +
      `UNKNOWN ${buckets.UNKNOWN.length}.`,
  );
}

main();
KIT_CLASSIFY_JS

# --- scripts/archive-historical-docs.js ---
cat > "$T/scripts/archive-historical-docs.js" <<'KIT_ARCHIVE_JS'
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
KIT_ARCHIVE_JS

# --- .github/workflows/claude-md-refresh.yml ---
cat > "$T/.github/workflows/claude-md-refresh.yml" <<'KIT_WF_REFRESH'
# Refresh CLAUDE.md generated facts block.
# Regenerates the machine-managed <!-- generated:repo-facts --> block from live
# repo signals and self-commits [skip ci] when (and only when) a fact changed.
# Modeled on repo-manifest.yml. Portable: copy verbatim into any repo that has a
# CLAUDE.md carrying the markers.
name: Refresh CLAUDE.md

# Runs on the default branch only, so the committed facts block is maintained
# post-merge without self-committing to every working branch (which would race
# the pre-merge CLAUDE.md Check gate).
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v5.0.1

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Regenerate repo-facts block
        run: node scripts/refresh-claude-md.js

      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add CLAUDE.md
          git diff --staged --quiet || git commit -m "CHORE: refresh CLAUDE.md repo-facts [skip ci]"
          git push
KIT_WF_REFRESH

# --- .github/workflows/claude-md-check.yml ---
cat > "$T/.github/workflows/claude-md-check.yml" <<'KIT_WF_CHECK'
# CLAUDE.md staleness gate.
# Fails a PR when CLAUDE.md references a repo path that no longer exists, or when
# the generated facts block is out of date. Cheap, fast, and portable — copy
# verbatim into any repo that has a CLAUDE.md.
name: CLAUDE.md Check

on:
  push:
    branches: [main, "claude/**", "feature/**", "fix/**"]
  pull_request:
    branches: [main, "claude/**", "feature/**", "fix/**"]

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v5.0.1

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Dangling-pointer check
        run: node scripts/check-claude-md.js

      - name: Generated facts up-to-date check
        run: node scripts/refresh-claude-md.js --check

      - name: Doc classification up-to-date check
        run: |
          node scripts/classify-docs.js
          git diff --exit-code docs/DOC_CLASSIFICATION.md
KIT_WF_CHECK

# --- CLAUDE.md (skeleton, only if absent) ---
if [ ! -f "$T/CLAUDE.md" ]; then
cat > "$T/CLAUDE.md" <<'KIT_CLAUDE_SKELETON'
# CLAUDE.md

Guidance for AI assistants (Claude Code and others) working in this repository.
Read this before making changes. When it conflicts with a governance document,
the governance document wins.

> **Last verified:** TODO. The prose in this file is hand-curated; the
> _Repo facts_ block below is machine-generated by
> `scripts/refresh-claude-md.js` (a workflow keeps it current). CI
> (`scripts/check-claude-md.js`) fails if any path this file references stops
> existing. See [Keeping this file fresh](#keeping-this-file-fresh).

<!-- BEGIN:generated:repo-facts -->
<!-- END:generated:repo-facts -->

---

## What this is

<!-- TODO: one paragraph — what this repo is, who uses it, how it fits OQMInc. -->

---

## Non-negotiable invariants

<!-- TODO: the CI/governance-enforced rules for THIS repo. Common OQMInc ones:
     Advisory-Only AI boundary; fail-closed ledger/consent/pii paths; FIZ
     four-line commits; append-only provenance; WelfareWatch; age-gating;
     Canada-only PII residency; DOMAIN_GLOSSARY naming authority. -->

---

## Environment & tooling

<!-- TODO: package manager, Node/runtime, build/test/lint commands. -->

---

## Governance & authority

<!-- TODO: link this repo's authority docs. -->

- **`docs/SOURCE_OF_TRUTH.md`** — the override map for docs: which doc is
  canonical per domain, the CANONICAL/SUPERSEDED/HISTORICAL/UNKNOWN lifecycle,
  and the archive quarantine-and-burn policy. Machine triage in
  `docs/DOC_CLASSIFICATION.md` (regenerated by `scripts/classify-docs.js`).

---

## Keeping this file fresh

This file is split into **curated prose** (changed by hand) and a **generated
facts block** (never edited by hand). Two mechanisms fight rot:

- **`scripts/refresh-claude-md.js`** rewrites the `<!-- BEGIN:generated:repo-facts -->`
  block from live repo signals. It writes no timestamp, so it only diffs when a
  fact changed. A workflow (`.github/workflows/claude-md-refresh.yml`) runs it
  on push to the default branch and self-commits `[skip ci]`. Run it locally
  with `node scripts/refresh-claude-md.js`; `--check` exits non-zero if stale.
- **`scripts/check-claude-md.js`** runs in CI (`.github/workflows/claude-md-check.yml`)
  and fails if any repo path referenced in this file has stopped existing.

This kit is repo-agnostic and copied verbatim across OQMInc repositories.
KIT_CLAUDE_SKELETON
  echo "install-doc-kit: wrote CLAUDE.md skeleton (fill in the TODO prose)."
else
  echo "install-doc-kit: CLAUDE.md exists — leaving prose untouched."
  if ! grep -q 'BEGIN:generated:repo-facts' "$T/CLAUDE.md"; then
    echo "install-doc-kit: NOTE — existing CLAUDE.md has no <!-- BEGIN:generated:repo-facts --> markers." >&2
    echo "install-doc-kit:        Add these two lines where you want the facts block, then re-run:" >&2
    echo "install-doc-kit:          <!-- BEGIN:generated:repo-facts -->" >&2
    echo "install-doc-kit:          <!-- END:generated:repo-facts -->" >&2
  fi
fi

# --- docs/SOURCE_OF_TRUTH.md (template, only if absent) ---
if [ ! -f "$T/docs/SOURCE_OF_TRUTH.md" ]; then
cat > "$T/docs/SOURCE_OF_TRUTH.md" <<'KIT_SOT_TEMPLATE'
# Source of Truth — Document Lifecycle & Canonical Index

**Authority:** OmniQuest Media Inc. (OQMInc™) · Governed by ZoneGPT (MaxZone /
OQMIgpt) — Corpus v11

This file is the **override map** for documentation. A doc is authoritative
because this index says so — not because of its filename or its position in the
tree. When two docs disagree, the one named canonical here wins; the other is
Superseded and must carry a banner pointing here.

---

## 1. Document lifecycle states

| State          | Meaning                                                  | Action                                                     |
| -------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| **CANONICAL**  | Current source of truth for its domain.                  | Keep. Update in place. Never archive.                      |
| **SUPERSEDED** | Replaced by a canonical doc.                             | Banner → archive after ratification.                       |
| **HISTORICAL** | Spent point-in-time report (status/summary/report-back). | Archive under the quarantine rule.                         |
| **UNKNOWN**    | Not yet triaged.                                         | Human decides: promote, mark superseded, or leave.         |

Machine triage of every tracked doc into CANONICAL / HISTORICAL / UNKNOWN is
regenerated by `scripts/classify-docs.js` into `docs/DOC_CLASSIFICATION.md`.

---

## 2. Canonical index (curated)

<!-- TODO: list THIS repo's canonical doc per domain. Mark CI-pinned docs
     (in .github/required-files.txt) so a mover updates that list in lockstep. -->

| Domain                | Canonical doc | Supersedes |
| --------------------- | ------------- | ---------- |
| AI-assistant guidance | `CLAUDE.md`   | ad hoc onboarding notes |
| Contributor workflow  | `CONTRIBUTING.md` | scattered PR notes |
| Repo overview         | `README.md`   | `*_SUMMARY.md` / status snapshots |

---

## 3. Quarantine & burn policy

Archives are a **quarantine, not a graveyard**. Git history keeps every version,
so quarantine is reversible and burning is cheap.

1. **Archive, don't delete.** `git mv` a SUPERSEDED/HISTORICAL doc into
   `archive/<YYYY-MM>/…` preserving its path, with a banner:
   `> ARCHIVED <date> — superseded by <canonical> / spent report. Not for current work.`
2. **Tripwire.** `archive/MANIFEST.md` logs each quarantined doc with a
   `consulted?` column. If anyone needs an archived doc, they log it and
   promote that fact into the live canonical doc.
3. **Burn on green launch.** Reach a ship milestone with an empty `consulted?`
   log → the archive is provably dead → delete it in one `CHORE:` commit.

---

## 4. Governance guardrails (do not fast-path these)

- **Governance/doctrine docs are Human-Review Category** — archiving/editing
  them requires CEO merge. Reports-scope archival is fast-path.
- **`.github/required-files.txt` is a CI gate** — moving a pinned doc without
  updating that list breaks structure validation.
- **Restricted-path gate** — a doc whose path contains `ledger`/`consent`/`pii`
  trips the fail-closed gate on move.

---

## 5. Current scope

Classification + indexing only. Archival is **reports scope** (the HISTORICAL
bucket). SUPERSEDED working docs and governance retirement are deferred to
ratified, CEO-gated follow-ups.
KIT_SOT_TEMPLATE
  echo "install-doc-kit: wrote docs/SOURCE_OF_TRUTH.md template (curate the canonical index)."
else
  echo "install-doc-kit: docs/SOURCE_OF_TRUTH.md exists — leaving it untouched."
fi

# --- regenerate machine-managed blocks + verify ---
cd "$T"
if command -v node >/dev/null 2>&1; then
  node scripts/refresh-claude-md.js || true
  node scripts/classify-docs.js || true
  node scripts/check-claude-md.js || echo "install-doc-kit: pointer check reported issues (see above)." >&2
else
  echo "install-doc-kit: node not found — install Node and run the three scripts in scripts/ manually." >&2
fi

echo "install-doc-kit: done. Review CLAUDE.md + docs/SOURCE_OF_TRUTH.md, commit on a branch, open a draft PR."
