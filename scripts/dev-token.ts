#!/usr/bin/env ts-node
/**
 * Mint a sandbox JWT for local / closed-server testing.
 *
 * RedRoomRewards has no /login endpoint by design — tokens come from an
 * external IdP (AccountsZone). In a closed sandbox that IdP does not exist, so
 * without this there is no way to call any authenticated endpoint and the
 * member portal cannot render a single screen.
 *
 * The token is a plain HS256 JWT signed with the same JWT_SECRET that
 * AuthMiddleware verifies, carrying the two claims the middleware reads:
 * `tenantId` and `userId`.
 *
 * ── Why this cannot become a back door ──────────────────────────────────────
 * It refuses to run when NODE_ENV=production, and it refuses to run against a
 * JWT_SECRET it did not find in the environment — it will not invent or default
 * one. It mints nothing that a holder of JWT_SECRET could not already mint; the
 * secret remains the only thing that matters. Charter §3.1.7 forbids backdoors
 * and master passwords, and this adds neither: no privilege escalation, no
 * bypass of AuthMiddleware, no special-cased identity.
 *
 * Usage:
 *   npm run dev:token                                  # defaults
 *   npm run dev:token -- --user member-1 --tenant redroompleasures
 *   npm run dev:token -- --ttl 24h
 */

import * as jwt from 'jsonwebtoken';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function main(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('dev-token: refusing to mint a token with NODE_ENV=production.');
    process.exit(1);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error(
      'dev-token: JWT_SECRET is not set. Set it in your .env (the same value the API verifies with).\n' +
        'This script will not invent or default a secret.',
    );
    process.exit(1);
  }

  const userId = arg('user', 'sandbox-member-1');
  const tenantId = arg('tenant', 'redroompleasures');
  // jsonwebtoken types `expiresIn` as a template-literal union it cannot infer
  // from a runtime string; the value is validated by jwt.sign itself.
  const ttl = arg('ttl', '12h') as jwt.SignOptions['expiresIn'];

  const token = jwt.sign({ userId, tenantId, sub: userId }, secret, { expiresIn: ttl });

  console.log(`\n  tenant : ${tenantId}`);
  console.log(`  user   : ${userId}`);
  console.log(`  expires: ${ttl}\n`);
  console.log(token);
  console.log('\nUse it as:  Authorization: Bearer <token>');
  console.log("In the member portal:  localStorage.setItem('rrr_token', '<token>')\n");
}

main();
