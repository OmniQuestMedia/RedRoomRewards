/**
 * Startup ledger-connection guard.
 *
 * The service must not accept traffic without a live ledger connection. This
 * was not always true: `connectDatabase()` existed but nothing called it, so
 * the app booted with `mongoose.connection.readyState === 0`, every model query
 * buffered against a connection that would never arrive, and
 * `LedgerService.withTransactionSafety` silently took its no-session fallback —
 * running multi-document financial writes with no transaction.
 *
 * That failure is invisible to the rest of the suite, which mocks every
 * Mongoose model. So this spec boots the real entrypoint as a child process and
 * asserts the property directly: given no database, the process exits non-zero
 * and never reaches its listener.
 *
 * It deliberately does NOT need a running MongoDB — it proves the *refusal*
 * path, which is the safety-critical half. The success path (that it serves
 * correctly *with* a database) is covered by `npm run sandbox:smoke`, which
 * requires a real replica set.
 */

import { spawnSync } from 'child_process';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ENTRYPOINT = path.join(REPO_ROOT, 'src', 'main.ts');

/** Marker that main.ts logs only after app.listen() has bound the port. */
const LISTENING_MARKER = 'running on';

interface BootResult {
  status: number | null;
  output: string;
}

function boot(env: Record<string, string | undefined>, timeoutMs: number): BootResult {
  const result = spawnSync('npx', ['tsx', ENTRYPOINT], {
    cwd: REPO_ROOT,
    timeout: timeoutMs,
    encoding: 'utf8',
    env: {
      ...process.env,
      // Cleared unless the case under test supplies them.
      MONGODB_URI: undefined,
      DATABASE_URL: undefined,
      NODE_ENV: 'test',
      JWT_SECRET: 'startup-guard-spec-secret',
      ...env,
    } as NodeJS.ProcessEnv,
  });

  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

describe('Startup — ledger connection guard', () => {
  it('refuses to start when no database URI is configured', () => {
    const { status, output } = boot({ PORT: '3991' }, 60_000);

    expect(status).toBe(1);
    expect(output).toContain('refusing to start without a ledger connection');
  }, 90_000);

  it('refuses to start — and never listens — when the database is unreachable', () => {
    // A syntactically valid URI pointing at a closed port. The short
    // serverSelectionTimeoutMS keeps the test quick; without the guard the
    // process would sail past this and bind the port anyway.
    const { status, output } = boot(
      {
        MONGODB_URI: 'mongodb://127.0.0.1:59999/rrr-startup-guard?serverSelectionTimeoutMS=3000',
        PORT: '3992',
      },
      90_000,
    );

    expect(status).not.toBe(0);
    // The load-bearing assertion: the listener was never reached. A service
    // that binds its port without a ledger is the exact regression this guards.
    expect(output).not.toContain(LISTENING_MARKER);
  }, 120_000);
});
