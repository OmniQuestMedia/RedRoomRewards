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
