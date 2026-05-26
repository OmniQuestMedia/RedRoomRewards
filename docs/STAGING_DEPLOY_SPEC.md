# STAGING DEPLOY SPEC — RedRoomRewards (Alpha)

**Audience:** whoever provisions the staging environment — likely Kevin with
light support, or a contracted ops resource.

**Purpose:** describe the exact staging topology so the Alpha test pack can run
against a representative environment with Canadian data residency and
PIPEDA-clean posture.

**Status:** draft. Provisioning is owner-action; this doc is the blueprint.

---

## 1. Topology summary

```
                ┌────────────────────────────┐
                │   www.redroomrewards.com   │
                │  (apex — marketing/public) │
                └────────────────────────────┘

  ┌─────────────────────────────────┐    ┌────────────────────────────────┐
  │  api-staging.redroomrewards.com │    │ auth-staging.redroomrewards.com│
  │  DigitalOcean App Platform      │    │ DigitalOcean Droplet           │
  │  Region: TOR1 (Toronto)         │    │ Region: TOR1 (Toronto)         │
  │  Container: RRR Node/Nest API   │    │ Container: Keycloak + Postgres │
  └────────────┬────────────────────┘    └──────────────┬─────────────────┘
               │                                         │
               │  VPC peering (TOR1 private network)     │
               │                                         │
               ▼                                         │
  ┌─────────────────────────────────┐                    │
  │  MongoDB Atlas                  │                    │
  │  Region: ca-central-1 (Montreal)│                    │
  │  Tier: M10+ (replica set req'd) │                    │
  │  Network: PrivateLink to DO TOR1│                    │
  └─────────────────────────────────┘                    │
                                                         │
  ┌────────────────────────────────────────────────────┐ │
  │  DigitalOcean Spaces (S3-compatible)               │◀┘
  │  Region: TOR1                                      │
  │  Bucket: rrr-cold-logs (1y retention, archive)     │
  └────────────────────────────────────────────────────┘
```

All compute and data sit on Canadian soil. Cross-border disclosure obligations
under PIPEDA drop dramatically.

---

## 2. Decisions locked

| Decision                | Value                                             | Source                            |
| ----------------------- | ------------------------------------------------- | --------------------------------- |
| Hosting platform        | DigitalOcean App Platform + Droplet (TOR1)        | CEO 2026-04-28                    |
| Database                | MongoDB Atlas M10+ (ca-central-1)                 | CEO 2026-04-28                    |
| Identity provider       | Keycloak self-hosted (single realm for Alpha)     | CEO 2026-04-28                    |
| Service-to-service auth | HMAC-SHA256 per `docs/AUTH_CONTRACT.md`           | CEO 2026-04-28                    |
| Data residency          | Canada                                            | CEO 2026-04-28 (PIPEDA alignment) |
| Log retention           | 90 days hot + 1 year cold archive                 | CEO 2026-04-28                    |
| Apex domain             | `redroomrewards.com` (and `redroompleasures.com`) | CEO 2026-04-28                    |

---

## 3. Hostnames

| Purpose            | Hostname                          | Cert                                |
| ------------------ | --------------------------------- | ----------------------------------- |
| API (staging)      | `api-staging.redroomrewards.com`  | LE auto-renewed via DO App Platform |
| Keycloak (staging) | `auth-staging.redroomrewards.com` | LE auto-renewed via Caddy/Traefik   |
| Public marketing   | `www.redroomrewards.com`          | (out of scope for this spec)        |

DNS is managed by the apex owner (Kevin) at the registrar; A / CNAME records
pointing at the DO load-balancer endpoints once provisioned. Once production
go-live nears, mirror with `api.` and `auth.` (no `-staging`).

---

## 4. DigitalOcean App Platform — RRR API

### 4.1 Build

- **Source:** GitHub repo `OmniQuestMediaInc/RedRoomRewards`, branch `main`
  (auto-deploy on push to main; staging tracks main).
- **Build command:** `npm ci && npm run build`
- **Run command:** `npm run start:prod`
- **Node version:** ≥ 22 (per `package.json` engines).
- **Container size:** Basic tier (1 vCPU / 1 GB RAM) for Alpha. Scale up at
  production go-live based on observed load.

### 4.2 Environment variables

Sourced from DigitalOcean App Platform's secret manager. Mapping to
`.env.example`:

| Variable                       | Source                                                            | Notes                                                                     |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `NODE_ENV`                     | literal `production`                                              | Gates OpenAPI docs (per #319), enables hardening                          |
| `MONGODB_URI`                  | Atlas connection string                                           | TLS enabled; replica-set parameter included                               |
| `DATABASE_URL`                 | mirror of `MONGODB_URI`                                           | Compat alias                                                              |
| `JWT_SECRET`                   | random 64-hex                                                     | (Will be replaced by Keycloak public-key validation in a later iteration) |
| `QUEUE_AUTH_SECRET`            | random 64-hex                                                     | Required                                                                  |
| `RRR_WEBHOOK_SECRET`           | random 64-hex                                                     | Phase-1 shared secret per AUTH_CONTRACT §8                                |
| `TOKEN_EXPIRY_SECONDS`         | `900`                                                             | 15 min                                                                    |
| `PORT`                         | `3000`                                                            | DO App Platform proxies                                                   |
| `API_BASE_PATH`                | `/api/v1`                                                         |                                                                           |
| `LOG_LEVEL`                    | `info`                                                            |                                                                           |
| `LOG_FORMAT`                   | `json`                                                            | Structured logs for log shipping                                          |
| `RATE_LIMIT_PER_MINUTE`        | `100`                                                             | Per IP                                                                    |
| `SIGNUP_RATE_LIMIT_PER_MINUTE` | `5`                                                               | RISK-002                                                                  |
| `CORS_ORIGINS`                 | `https://www.redroomrewards.com,https://www.redroompleasures.com` | Adjust as merchant front-ends come online                                 |
| `GATEGUARD_AV_API_KEY`         | from GateGuard admin console                                      | Required for AV gate                                                      |
| `GATEGUARD_AV_ENDPOINT`        | `https://api.gateguard.omniquestmedia.com`                        |                                                                           |
| `SERVICE_BUREAU_ENABLED`       | `true`                                                            | Multi-tenant mode                                                         |

All secrets generated with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` or
`openssl rand -hex 32`. Never reuse across environments.

### 4.3 Health checks

Three endpoints, three audiences:

| Endpoint            | Purpose                                                              | Status semantics                                                            |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /health`       | Combined human/external summary — version, DB readyState, components | Always 200 if process responds; body `status` is `ok` or `degraded`         |
| `GET /health/live`  | Orchestrator **liveness** — restart container on failure             | Always 200 if process can respond. Failure means process is dead → restart. |
| `GET /health/ready` | Orchestrator **readiness** — gate traffic on DB readiness            | 200 when Mongo `readyState === 1`; **503** otherwise. Roll-out gate.        |

Configuration:

- DO App Platform **liveness** probe → `GET /health/live`, 5s interval,
  3-failure restart threshold.
- DO App Platform **readiness** probe → `GET /health/ready`, 10s interval,
  2-failure remove-from-rotation threshold (so a slow Atlas reconnect doesn't
  take an instance out for a single blip).
- External uptime probe (Better Uptime / UptimeRobot) → `GET /health`, 1-minute
  interval, alert on non-200 OR `status: degraded`.

The legacy single-`/health` endpoint stays in place so older probes continue to
work; new orchestration must use `/health/live` and `/health/ready` so DB blips
don't trigger spurious container restarts.

### 4.4 Logging

- App emits structured JSON via pino to stdout.
- DO App Platform forwards stdout to its built-in log retention (configure to 90
  days hot).
- Optional ship-out to Datadog or Better Stack if/when budget supports it.
- Older-than-90-days logs archived to DigitalOcean Spaces bucket `rrr-cold-logs`
  with 1-year lifecycle policy.

---

## 5. Keycloak Droplet

### 5.1 Why a Droplet not App Platform

Keycloak needs:

- Persistent volume for its embedded Postgres (or external Postgres).
- Long-lived session storage.
- Fine-grained network rules.

DO Droplet is the cleaner fit. App Platform would force ephemeral filesystem
semantics that Keycloak doesn't love.

### 5.2 Sizing

- Basic Droplet, 2 vCPU / 4 GB RAM / 80 GB SSD (≈ $24/mo). Can downsize to 2 GB
  RAM if budget pressure; Keycloak runs but with less headroom.
- DigitalOcean Managed Postgres (smallest tier) for Keycloak's data store. Keeps
  backups and HA out of the operator's hands.

### 5.3 Realm configuration (Alpha)

- **Single realm** named `rrr-alpha`.
- Tenant claim in JWT: `tenant_id` populated from a user attribute or group
  mapping.
- Roles: `member`, `model`, `merchant_admin`, `oqmi_operator` (matches §2 of the
  UX integration brief).
- Token lifetimes: access token 15 min, refresh token 30 days.
- Public clients (browser apps): one per merchant front-end, configured with
  PKCE.
- Confidential clients (server-side flows): one for each merchant backend that
  needs to issue tokens; secret-rotated per the same 90-day cadence as HMAC
  keys.
- Sessions: SSO timeout 8 hours.
- Email / SMTP: deferred until UX is live.

### 5.4 Reverse proxy + TLS

- Caddy in front of Keycloak, terminating TLS for
  `auth-staging.redroomrewards.com`.
- HTTP → HTTPS redirect.
- HSTS enabled, `max-age=31536000; includeSubDomains`.

### 5.5 Backup

- Daily snapshot of the Droplet (DO native).
- Daily logical backup of the Keycloak database (managed Postgres → automated
  backups).
- Retention: 30 days. Keycloak realm export to JSON committed to a separate
  private repo monthly (manual).

---

## 6. MongoDB Atlas

### 6.1 Provisioning

- Project: `RedRoomRewards`
- Cluster: `rrr-staging-tor` (or similar)
- Cloud provider: AWS (Atlas managed) — region **ca-central-1** (Montreal)
- Tier: **M10** minimum (replica set required for `mongoose.startSession`
  transactions per B-006). M10 gives 2 GB RAM, 10 GB storage, 3-node replica
  set.
- Backup: continuous cloud backup, 7-day point-in-time recovery.
- Encryption: at-rest (default) + in-transit (TLS, default).

### 6.2 Network access

- **No 0.0.0.0/0 entries**, ever.
- Atlas PrivateLink endpoint to DigitalOcean TOR1 VPC. (If not feasible, fall
  back to IP allowlist of the DO App Platform egress IPs + Keycloak Droplet IP.)
- Database user per service (one for the API, one for migrations, one read-only
  for ops).

### 6.3 Initial migration

- `infra/migrations/` already contains schema baseline — run on first deploy.
- Confirm `mongoose.startSession` transactions actually work post-deploy with a
  smoke test against the M10 replica set.

---

## 7. Secrets

| Secret                            | Where it lives                                                       |
| --------------------------------- | -------------------------------------------------------------------- |
| `JWT_SECRET`, `QUEUE_AUTH_SECRET` | DO App Platform encrypted env vars                                   |
| `RRR_WEBHOOK_SECRET`              | DO App Platform encrypted env vars                                   |
| `MONGODB_URI` (with credentials)  | DO App Platform encrypted env vars                                   |
| `GATEGUARD_AV_API_KEY`            | DO App Platform encrypted env vars                                   |
| Per-tenant HMAC `api_secret`      | DO App Platform secret manager, namespaced by `tenant_id`            |
| Keycloak admin password           | DO Droplet `.env` (chmod 600), backed up to encrypted secret manager |
| Keycloak realm signing keys       | Generated by Keycloak; backed up via realm export                    |

**Never** in repo. **Never** in Slack/email/git commit messages. **Never** in
error responses or logs.

---

## 8. Logging + retention (per CEO 2026-04-28)

- **Hot tier (90 days):** queryable structured logs in the DO App Platform
  built-in log retention + Keycloak Droplet `journalctl`. Searchable by
  `request_id`, `tenant_id`, `user_id`, severity.
- **Cold tier (1 year):** nightly export to DigitalOcean Spaces bucket
  `rrr-cold-logs`, lifecycle-policied to delete after 365 days. Compressed
  (gzip), partitioned by date prefix.
- **Ledger entries:** retained **forever** in MongoDB. This is the financial
  source-of-truth and is not part of the log retention policy.

What does NOT get logged:

- Bearer tokens (full or partial).
- HMAC signatures (full or partial).
- HMAC `api_secret` values.
- Full request bodies for state-changing operations (only `request_id`,
  `tenant_id`, `idempotency_key`, verdict).
- PII beyond what's necessary for tracing (no full names, no birthdates, no
  government IDs in logs — those live in primary records, not logs).

---

## 9. Provisioning order

In the order the operator should create things:

1. Reserve hostnames in DNS — A/CNAME to placeholders.
2. Provision MongoDB Atlas cluster (ca-central-1, M10, 3-node replica set,
   network locked down).
3. Provision DigitalOcean Droplet for Keycloak (TOR1, 2 vCPU / 4 GB), install
   Caddy + Keycloak + managed Postgres.
4. Provision DigitalOcean Spaces bucket for cold log archive.
5. Provision DigitalOcean App Platform app pointed at the GitHub repo, branch
   `main`.
6. Wire env vars (§4.2) into App Platform.
7. Wire VPC peering / PrivateLink so App Platform → Atlas traffic stays private.
8. Run schema migrations against Atlas.
9. Smoke test:
   - `GET /health` returns 200 with `status: ok`, DB connectivity, and the
     version string from `package.json`.
   - `GET /health/live` returns 200 with `{"status":"live"}`.
   - `GET /health/ready` returns 200 with
     `{"status":"ready", "database":{"connected":true,"readyState":1}}`.
     Disconnect Mongo briefly and confirm it returns **503** with
     `{"status":"not_ready"}` before re-checking.
   - `POST /webhooks/external/award` round-trips a signed test payload.
   - `GET /api/docs` is **not** reachable in production mode
     (NODE_ENV=production gate).
   - Signup endpoint enforces 5/min rate limit.
   - A `mongoose.startSession`-backed transaction commits and rolls back as
     expected.
10. Hand the staging URL to the Alpha test pack runner.

---

## 10. Cost ballpark (USD/month, Alpha-grade)

Order-of-magnitude only. Real bills will come in within ±20%.

| Line                                         | Monthly (USD) |
| -------------------------------------------- | ------------: |
| DO App Platform Basic                        |        $12–25 |
| DO Droplet 2 vCPU / 4 GB (Keycloak)          |           $24 |
| DO Managed Postgres (smallest, for Keycloak) |           $15 |
| DO Spaces bucket + 1y archive                |            $5 |
| MongoDB Atlas M10 (ca-central-1)             |           $57 |
| External uptime probe                        |         $0–10 |
| **Total (Alpha)**                            |     **~$120** |

Production-grade scaling (M30 Atlas, larger DO tiers, paid log shipping) would
land closer to $400–600/mo, comfortably within reach when revenue starts
flowing.

---

## 11. What this spec deliberately does not cover

- **Production environment** — same shape, separate cluster, hostnames `api.`
  and `auth.`. Provisioned at production go-live, not Alpha.
- **CI/CD pipeline details** — the existing `.github/workflows/` runs CI on
  push; deploy hook to DO App Platform is auto-deploy on `main`. Production
  should require a tag-based deploy, but that's a production-go-live concern.
- **Disaster recovery runbook** — Atlas + DO snapshots cover RPO; RTO procedure
  deferred to production-readiness.
- **WAF / DDoS** — DO App Platform has basic protection; if Alpha attracts
  attention we'll layer Cloudflare. Not blocking Alpha.
- **mTLS, key escrow, HSM-backed signing** — out of scope; revisit if regulated
  rails become relevant.

---

## 12. Open items before staging is "ready"

Tracked as ALP-4 in `.github/PRODUCTION_SCHEDULE.md`.

- [ ] DO App Platform app provisioned and wired to repo
- [ ] DO Droplet provisioned with Keycloak + Caddy + managed Postgres
- [ ] DO Spaces bucket created with lifecycle policy
- [ ] MongoDB Atlas cluster provisioned in ca-central-1, M10+, network locked
- [ ] PrivateLink / VPC peering verified (no public DB exposure)
- [ ] All env vars wired from secret manager (none in plaintext on disk)
- [ ] DNS records pointing at the right LBs
- [ ] TLS certs auto-renewing
- [ ] Smoke-test list (§9 step 9) all green
- [ ] Phase-1 tenant rows seeded (RedRoomPleasures, Cyrano) with HMAC keys
      generated and shared securely with their integrators

When all of those check, staging is "Alpha-ready" and ALP-5 (test pack) can
begin.

---

_This spec is a living document until staging is live. Once green, it freezes
and any change requires a CHORE/INFRA ticket._
