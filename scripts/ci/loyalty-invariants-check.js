#!/usr/bin/env node
/**
 * CI: loyalty-invariants-check
 *
 * Scans source files to enforce loyalty-domain invariants:
 *
 * INV-001: LedgerEntry must never be mutated after creation.
 *          Detects direct calls to updateOne/updateMany/findOneAndUpdate
 *          on LedgerEntryModel outside of the model file itself.
 *
 * INV-002: ChargebackEvent records must include a correlation_id.
 *          Detects ChargebackEventModel.create / new ChargebackEventModel
 *          without correlation_id in the same statement block.
 *          (Heuristic — checks for the field in the surrounding 10 lines.)
 *
 * INV-003: AffiliateLink bonus_points_pct must be validated before persist.
 *          Ensures registerLink in AffiliateService validates pct (presence
 *          of isInteger check adjacent to bonus_points_pct assignment).
 *
 * Exit 1 on any violation.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');

let violations = 0;

function findFiles(dir, ext) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findFiles(full, ext));
    else if (entry.name.endsWith(ext)) results.push(full);
  }
  return results;
}

// INV-001: LedgerEntryModel must not be mutated outside ledger-entry.model.ts
const LEDGER_MODEL_FILE = 'ledger-entry.model.ts';
const MUTATION_METHODS = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'];
const tsFiles = findFiles(SRC, '.ts').filter((f) => !f.endsWith('.spec.ts'));

for (const file of tsFiles) {
  if (file.includes(LEDGER_MODEL_FILE)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('LedgerEntry') && !line.includes('ledger_entries')) continue;
    for (const method of MUTATION_METHODS) {
      if (line.includes(method)) {
        console.error(
          `INV-001 VIOLATION: ${path.relative(ROOT, file)}:${i + 1} — LedgerEntry mutation '${method}' outside model file`,
        );
        violations++;
      }
    }
  }
}

// INV-002: ChargebackEvent create must include correlation_id (heuristic window)
for (const file of tsFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (
      !lines[i].includes('ChargebackEventModel') ||
      (!lines[i].includes('create') && !lines[i].includes('new ChargebackEventModel'))
    )
      continue;
    const window = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 10)).join('\n');
    if (!window.includes('correlation_id')) {
      console.error(
        `INV-002 VIOLATION: ${path.relative(ROOT, file)}:${i + 1} — ChargebackEvent create missing correlation_id in surrounding context`,
      );
      violations++;
    }
  }
}

// INV-003: AffiliateService registerLink must validate bonus_points_pct
const affiliateServicePath = path.join(SRC, 'services/affiliate.service.ts');
if (fs.existsSync(affiliateServicePath)) {
  const content = fs.readFileSync(affiliateServicePath, 'utf8');
  if (!content.includes('isInteger') || !content.includes('bonus_points_pct')) {
    console.error(
      'INV-003 VIOLATION: src/services/affiliate.service.ts — registerLink must validate bonus_points_pct with Number.isInteger',
    );
    violations++;
  }
} else {
  console.error('INV-003 VIOLATION: src/services/affiliate.service.ts not found');
  violations++;
}

if (violations === 0) {
  console.log(`loyalty-invariants-check: OK (${tsFiles.length} files scanned, 3 invariants)`);
} else {
  console.error(`loyalty-invariants-check: ${violations} violation(s) found`);
  process.exit(1);
}
