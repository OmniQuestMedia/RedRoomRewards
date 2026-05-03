# RedRoom Rewards™ — Production Deployment Checklist

_Last refreshed: 2026-05-03. Waves A–D + post-D wiring audit closed. Alpha test prep landing._

## Pre-deploy verification

- [ ] `npm run build` succeeds
- [ ] `npm run test:ci` passes (current floor: 550 tests / 57 suites; Jest coverage thresholds enforced)
- [ ] All mandatory 18+ GateGuard AV hooks are active
- [ ] Promotional Bonus bucket enforced everywhere
- [ ] Fail-closed middlewares wired globally; explicit public-route allowlist verified
- [ ] OpenAPI docs gated behind `NODE_ENV !== 'production'` (or explicit feature flag)
- [ ] Signup endpoint rate-limit (RISK-002) active
- [ ] Health check at `/health` returns 200 with DB connectivity + version
- [ ] CI guards green: charter-integrity, no-hardcoded-balance, tenant-id-scope, openapi-drift

## Infrastructure prerequisites

- [ ] MongoDB **replica set** provisioned (required for `mongoose.startSession` transactions per B-006) — single-node Mongo will not work
- [ ] Secrets stored in a managed secret store (e.g. AWS Secrets Manager, Doppler) — never in repo or plaintext on host
- [ ] TLS 1.2+ terminated in front of the API; HTTP→HTTPS redirect
- [ ] Per-tenant HMAC keys provisioned for Phase-1 merchants (RedRoomPleasures, Cyrano) — see [`docs/AUTH_CONTRACT.md`](docs/AUTH_CONTRACT.md)
- [ ] Structured-log sink wired (pino → CloudWatch / Datadog / equivalent)
- [ ] External uptime probe against `/health`

## Staging deployment steps

1. `npm run build`
2. Populate environment variables from `.env.example` against the secret store
3. `npm run start:prod`
4. Verify:
   - Member signup requires AV and is rate-limited
   - AwardingWallet CSV works
   - Creator gifting panel works
   - Burn & reporting endpoints work
   - Tier earning multipliers + gift redemption (#321) behave per spec
   - Webhook emit succeeds against a test merchant; HMAC signature validates on receive

## Production go-live

- Tag the release SHA (e.g. `v0.1.0-alpha.1` for Alpha)
- Update PRODUCTION_SCHEDULE.md with final SHA
- Enable branch protection (require up-to-date, require CI)
- Confirm monitoring / logging / alerting wired
- Confirm rate limiting active on all public routes
- Rotate any default secrets shipped in `.env.example`

Engine is feature-complete for Alpha. Remaining gates are operational (hosting, monitoring, merchant-integration handshake) — see `.github/PRODUCTION_SCHEDULE.md` § ALPHA TEST PREP.
