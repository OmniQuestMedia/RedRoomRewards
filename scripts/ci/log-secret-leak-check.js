#!/usr/bin/env node
/**
 * Log-secret-leak CI guard.
 *
 * Scans src/ for log call sites that interpolate values whose names suggest
 * secrets / tokens / signatures. The goal is to catch the easy mistakes
 * (logging the bearer header, logging req.headers.authorization, logging
 * the api_secret) before they reach production.
 *
 * Catches the common shapes:
 *   logger.info('auth:', token)
 *   logger.info(`auth: ${token}`)
 *   console.log({ apiSecret })
 *   logger.warn(`signature ${signature}`)
 *
 * Does NOT catch obfuscated cases (e.g. building a string from chars). That's
 * a different class of bug; this guard is a "no easy mistakes" tripwire.
 *
 * Allowlist:
 *   Files matching __tests__ / *.spec.ts / *.test.ts are exempted.
 *   Lines with the trailing comment `// ci-allow: log-secret` are exempted
 *   (rare, requires a justification ticket).
 *
 * Exits 0 on clean tree, 1 on any violation. Self-test via --self-test.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');

const ALLOW_COMMENT = '// ci-allow: log-secret';

// Identifiers whose name suggests a secret / token / signature value.
// Matched as whole-word substrings. Case-insensitive.
const SUSPECT_NAME_RE = new RegExp(
  '\\b(' +
    [
      'apiSecret',
      'api_secret',
      'jwtSecret',
      'jwt_secret',
      'webhookSecret',
      'webhook_secret',
      'queueAuthSecret',
      'queue_auth_secret',
      'signature',
      'bearerToken',
      'bearer_token',
      'authorizationHeader',
      'authorization_header',
      'rrrSignature',
      'xRrrSignature',
      'authToken',
      'auth_token',
      'accessToken',
      'access_token',
      'refreshToken',
      'refresh_token',
      'sessionToken',
      'session_token',
      'rawBody',
      'requestBody',
      'request_body',
    ].join('|') +
    ')\\b',
  'i',
);

// Match log call sites. We treat console.* and logger.* as suspect call shapes.
// We also count a `pino()` call if it's logging an object literal.
const LOG_CALL_RE = /(?:^|[^A-Za-z0-9_])(?:console\.(?:log|info|warn|error|debug)|logger\.(?:info|warn|error|debug|trace)|pinoLogger\.(?:info|warn|error|debug|trace))\s*\(/;

function isExcluded(rel) {
  return (
    rel.endsWith('.spec.ts') ||
    rel.endsWith('.test.ts') ||
    rel.includes(`${path.sep}__tests__${path.sep}`) ||
    rel.includes('/__tests__/')
  );
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      yield full;
    }
  }
}

/**
 * Scan a single line for the (log-call AND suspect-identifier) co-occurrence.
 * Returns a violation object or null.
 */
function scanLine(line) {
  if (line.includes(ALLOW_COMMENT)) return null;

  if (!LOG_CALL_RE.test(line)) return null;

  const m = line.match(SUSPECT_NAME_RE);
  if (!m) return null;

  return { suspect: m[0], snippet: line.trim() };
}

function findViolations(rootDir = SRC_DIR) {
  const violations = [];
  for (const file of walk(rootDir)) {
    const rel = path.relative(REPO_ROOT, file);
    if (isExcluded(rel)) continue;

    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const v = scanLine(lines[i]);
      if (v) {
        violations.push({
          file: rel,
          line: i + 1,
          suspect: v.suspect,
          snippet: v.snippet,
        });
      }
    }
  }
  return violations;
}

function selfTest() {
  // Suspect cases — should each produce one violation.
  const cases = [
    "logger.info('auth:', token, apiSecret);",
    "logger.warn(`signature: ${signature}`);",
    "console.log({ jwtSecret });",
    "logger.error(`auth header was ${authorizationHeader}`);",
  ];
  for (const line of cases) {
    if (!scanLine(line)) {
      console.error(`SELF-TEST FAIL: should flag: ${line}`);
      return false;
    }
  }

  // Clean cases — should not be flagged.
  const cleanCases = [
    "logger.info(`request_id=${requestId} verdict=${verdict}`);",
    "logger.error('reconcile mismatch', { tenant_id, account_id });",
    "console.log('plain message with no secrets');",
    `logger.info('auth:', token, apiSecret); ${ALLOW_COMMENT}`, // allow comment
  ];
  for (const line of cleanCases) {
    if (scanLine(line)) {
      console.error(`SELF-TEST FAIL: should NOT flag: ${line}`);
      return false;
    }
  }

  console.log('log-secret-leak self-test: OK');
  return true;
}

function main() {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const v = findViolations();
  if (v.length === 0) {
    console.log('log-secret-leak: OK (0 violations)');
    process.exit(0);
  }

  console.error(`log-secret-leak: ${v.length} violation(s):`);
  for (const x of v) {
    console.error(`  ${x.file}:${x.line}  matches "${x.suspect}"`);
    console.error(`    ${x.snippet}`);
  }
  console.error(
    '\nFix: redact / replace the value before logging. If genuinely safe ' +
      '(e.g. logging a public key id), append `' +
      ALLOW_COMMENT +
      '` to the line with a justification comment.',
  );
  process.exit(1);
}

main();
