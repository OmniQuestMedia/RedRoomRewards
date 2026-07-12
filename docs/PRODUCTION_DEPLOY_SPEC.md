# PRODUCTION DEPLOY SPEC — RedRoomRewards

**Audience:** whoever provisions production after Alpha test passes — likely
Kevin with light contracted-ops support.

**Purpose:** describe the production environment topology, the path from
"Alpha-passed staging" to "production-go-live," and the controls that must be in
place before any real customer points exist on the system.

**Status:** draft. Becomes runnable after `v0.1.0-alpha.1` is cut and the Alpha
test pack has passed.

**Authority:** mirrors `docs/STAGING_DEPLOY_SPEC.md` for shape; deviates only
where production-grade requirements differ. On any conflict, this spec wins for
production; staging spec wins for staging.

---

## 1. What changes between staging and production

| Concern           | Staging                               | Production                                                                      |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| Compute tier      | DO App Platform Basic (1 vCPU / 1 GB) | DO App Platform Professional (2+ vCPU / 4 GB), 2+ instances behind LB           |
| Mongo Atlas tier  | M10 (3-node replica)                  | M30 minimum (3-node replica) + dedicated cluster (no shared tier)               |
| Hostnames         | `api-staging.` / `auth-staging.`      | `api.redroomrewards.com` / `auth.redroomrewards.com`                            |
| Branch protection | none (auto-deploy on `main`)          | required: 1 reviewer + green CI + signed tag for deploy                         |
| Deploy trigger    | push to `main`                        | tag `v0.X.Y` (semver) — manual approval gate before deploy                      |
| Monitoring        | DO built-in + external uptime probe   | full APM (Datadog or equivalent) + dedicated incident channel                   |
| Log retention     | 90d hot + 1y cold                     | same — already at compliance baseline                                           |
| Backup            | Atlas continuous, 7d PITR             | Atlas continuous, 7d PITR + nightly logical export to Spaces (defense-in-depth) |
| Secrets           | DO App Platform encrypted env vars    | same + dedicated secret-rotation runbook                                        |
| Alerting          | none (operator polls)                 | PagerDuty / Better Uptime to on-call                                            |
| Status page       | none                                  | public status page (status.redroomrewards.com)                                  |
| WAF               | none                                  | Cloudflare in front of the API                                                  |

What does **not** change: the architecture topology (DO + Atlas + Keycloak), the
data residency (Canada), the auth contract (HMAC service-to-service + Keycloak
JWT), the invariants in `docs/OPERATIONAL_RUNBOOK.md` §0.

---

## 2. Topology summary

```
                  ┌────────────────────────────────────────┐
                  │ Cloudflare WAF + DDoS + caching layer  │
                  │ (TLS 1.2+ termination at edge)         │
                  └──────────────┬─────────────────────────┘
                                 │
   ┌─────────────────────────────┴─────────────────────────────┐
   │                                                            │
   ▼                                                            ▼
┌─────────────────────────────────┐    ┌────────────────────────────────────┐
│  api.redroomrewards.com         │    │ auth.redroomrewards.com            │
│  DigitalOcean App Platform      │    │ DigitalOcean Droplet (4 vCPU/8 GB) │
│  Region: TOR1 (Toronto)         │    │ Region: TOR1                        │
│  Container: RRR Node/Nest API   │    │ Container: Keycloak + managed PG    │
│  ≥ 2 instances behind LB        │    │ Caddy in front; daily snapshots     │
└────────────┬────────────────────┘    └──────────────────┬─────────────────┘
             │                                              │
             │  PrivateLink (no public DB)                  │
             │                                              │
             ▼                                              │
┌─────────────────────────────────┐                         │
│  MongoDB Atlas                  │                         │
│  Region: ca-central-1 (Montreal)│                         │
│  Tier: M30 minimum (replica)    │                         │
│  Continuous backup, PITR 7d     │                         │
│  Encryption at rest + transit   │                         │
└─────────────────────────────────┘                         │
                                                            │
┌────────────────────────────────────────────────────┐      │
│ DigitalOcean Spaces (S3-compatible)                │◀─────┘
│ Region: TOR1                                       │
│ Buckets:                                           │
│   rrr-cold-logs       (1y retention)               │
│   rrr-mongo-backups   (nightly logical exports)    │
└────────────────────────────────────────────────────┘
```

All compute and data on Canadian soil. PIPEDA-aligned posture.

---

## 3. Hostnames + DNS

| Purpose          | Hostname                    | Cert                                             |
| ---------------- | --------------------------- | ------------------------------------------------ |
| API              | `api.redroomrewards.com`    | LE auto-renew via DO App Platform                |
| Keycloak         | `auth.redroomrewards.com`   | LE auto-renew via Caddy                          |
| Status page      | `status.redroomrewards.com` | depends on provider (Better Uptime / Statuspage) |
| Public marketing | `www.redroomrewards.com`    | (out of scope here)                              |

Apex (`redroomrewards.com`) and `www` already exist; the four subdomains above
are added as A / CNAME records pointing at the DO load balancer / Cloudflare
edge.

DNS owner: Kevin at the registrar. Cloudflare (if used as the WAF) becomes the
authoritative DNS for the apex once delegated.

---

## 4. App Platform — RRR API (production)

### 4.1 Build

- Source: `OmniQuestMedia/RedRoomRewards`, **tag-based deploy** (no auto-deploy
  on push).
- Build command: `npm ci && npm run build`
- Run command: `npm run start:prod`
- Container size: Professional tier, 2 vCPU / 4 GB minimum; scale up before
  scaling out where possible (Mongoose connection pools cost less when fewer
  instances each have a bigger pool).
- **Minimum 2 instances** behind the App Platform LB so a single-instance
  failure doesn't take the API down.

### 4.2 Deploy gate

Production deploys are tag-based and require a manual approval step:

1. Engineer opens a PR against `main`. CI green.
2. PR merged.
3. Engineer cuts a `v0.X.Y` tag at the merged SHA.
4. CI builds and tests the tag.
5. Manual approval in DO App Platform (or via a pre-deploy GitHub Actions
   workflow gating on a `production-approve` label).
6. Deploy.
7. Smoke-test (see §9 below).

Rollback: re-deploy the previous tag. Same procedure as `OPERATIONAL_RUNBOOK.md`
§9.2.

### 4.3 Environment variables

Same shape as `STAGING_DEPLOY_SPEC.md` §4.2 with these production overrides:

| Variable                       | Production value                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                     | `production`                                                                                         |
| `MONGODB_URI`                  | production Atlas cluster connection string                                                           |
| `JWT_SECRET`                   | production-only random 64-hex (different from staging)                                               |
| `QUEUE_AUTH_SECRET`            | production-only                                                                                      |
| `RRR_WEBHOOK_SECRET`           | production-only                                                                                      |
| `CORS_ORIGINS`                 | only the real merchant frontends (`https://www.redroompleasures.com`, `https://app.cyrano.<domain>`) |
| `RATE_LIMIT_PER_MINUTE`        | start at `100`; tune per-tenant after baseline traffic is observed                                   |
| `SIGNUP_RATE_LIMIT_PER_MINUTE` | `5` (RISK-002 — never loosen without explicit CEO approval)                                          |
| `LOG_LEVEL`                    | `info` (no `debug` in production, ever)                                                              |

**Production secrets are never reused from staging.** Generate fresh on
production-up.

### 4.4 Health probes

- DO App Platform liveness → `GET /health` every 30s.
- DO App Platform readiness → same endpoint, separate threshold.
- External uptime probe (Better Uptime) → `/health` every 60s; alert on > 2
  consecutive failures.
- Cloudflare health check at the edge.

### 4.5 Logging

- pino → stdout → DO retention (90d hot).
- Nightly export job rotates ≥ 90d-old logs to `rrr-cold-logs` Spaces bucket (1y
  retention, gzipped, partitioned by date).
- Optional: forward to Datadog or Better Stack for live dashboards. Decision
  deferred until production traffic baseline is known.

---

## 5. Keycloak Droplet (production)

### 5.1 Sizing

Production Keycloak Droplet sized for steady-state token issuance plus session
management:

- 4 vCPU / 8 GB RAM / 160 GB SSD (≈ $48–96/mo).
- DigitalOcean Managed Postgres (smallest production tier — 2 vCPU / 4 GB) for
  Keycloak's data store.
- Caddy in front for TLS termination; HSTS enabled
  (`max-age=31536000; includeSubDomains; preload`).

### 5.2 Realm

The production realm is `rrr` (no `-alpha` suffix). Provisioned per
`docs/KEYCLOAK_REALM_SPEC.md` §12, with these production differences:

- Real SMTP wired (provider TBD; see §11 of the realm spec).
- Theme rebrand (visual; out of this spec — creative agency owns).
- Token lifetimes unchanged from spec.
- Public clients pointed at production frontend hostnames.

### 5.3 Backup

- Daily Droplet snapshot.
- Daily Postgres backup (managed; 30 days retained).
- **Weekly realm export** to the audit repo (vs monthly on staging) — production
  cadence is tighter because lost realm config is operationally expensive to
  rebuild.

---

## 6. MongoDB Atlas (production)

### 6.1 Cluster

- Project: `RedRoomRewards`
- Cluster: `rrr-production-tor`
- Cloud provider: AWS, region **ca-central-1**.
- Tier: **M30 minimum** (8 GB RAM, 40 GB storage, 3-node replica). Upgrade to
  M40 / M60 as load demands.
- Backup: continuous cloud backup, **7-day PITR retained**.
- Encryption: at-rest (default) + in-transit (TLS, default) + (optional,
  post-go-live) customer-managed keys via AWS KMS.

### 6.2 Network access

- **No `0.0.0.0/0` entries**, ever.
- Atlas PrivateLink to the DO TOR1 VPC.
- Three database users (least-privilege):
  - `rrr-api` — read/write, scoped to the production database. Used by the API.
  - `rrr-migrations` — schema-change permissions. Used only during deploy.
  - `rrr-readonly-ops` — read-only, used for operator queries and scripts.
- Database users rotated on the same 90-day cadence as HMAC keys.

### 6.3 Sharded vs replica

Stay on a **replica set** for production go-live. Sharding is a future scale-up;
do not pre-shard. Adding sharding later is a real migration but a doable one;
pre-sharding for traffic that doesn't exist yet is a worse waste.

---

## 7. Branch protection + CI gates

Required before production go-live:

- `main` branch protected.
- Required status checks: all File & Schema Checks (charter integrity,
  no-hardcoded-balance, tenant_id scope, seed-fixture alignment, OpenAPI drift,
  schema validation), Super-Linter, Tests.
- Required reviews: 1 (CEO or designated reviewer).
- No force-push to `main`.
- No deletion of `main`.
- Linear history preferred (squash merges).
- Tag-pushed deploys require additional approval (see §4.2).

---

## 8. Cloudflare / WAF

Production sits behind Cloudflare for:

- TLS termination at edge.
- DDoS mitigation.
- WAF rules (SQL injection / XSS / known-bad-bot signatures).
- Bot management (block headless browsers, residential-proxy abuse).
- Rate-limiting at the edge as a second line of defense (App Platform's per-IP
  limits remain the first line).
- Geo-blocking if compliance ever requires it (PIPEDA-only by default; no
  preemptive geo-block but the lever is there).

DNS is delegated to Cloudflare for the apex once the WAF is wired.

---

## 9. Smoke-test list (run immediately after deploy)

Reuse the staging smoke-test gate from `STAGING_DEPLOY_SPEC.md` §9 with these
additions:

- [ ] `GET /health` returns 200, body shows production version SHA matching the
      deployed tag.
- [ ] TLS A+ rating on Qualys SSL Labs for `api.redroomrewards.com` and
      `auth.redroomrewards.com`.
- [ ] HSTS header present and `max-age >= 31536000`.
- [ ] OpenAPI docs are NOT reachable (`/api/docs` and `/api/openapi.yaml` return
      404 / 401).
- [ ] Signup endpoint enforces 5/min rate-limit.
- [ ] Webhook receive HMAC verification works (test merchant fires a signed
      delivery; correct verdict).
- [ ] A `mongoose.startSession`-backed transaction commits and rolls back (run a
      test escrow hold + refund).
- [ ] Cloudflare WAF logs at least one bot challenge event (look at the
      dashboard 5 min after go-live).
- [ ] External uptime probe is green and alerts on a forced fault.
- [ ] PagerDuty (or equivalent) test alert fires and pages the on-call.
- [ ] Logs in DO show production version SHA and no plaintext secrets in a
      sample of 100 lines.

---

## 10. Production go-live order

In the order the operator should execute:

1. **Pre-flight:** Alpha test pack passed at a known SHA on staging;
   `v0.1.0-alpha.1` cut.
2. Provision production Atlas cluster (M30, ca-central-1, replica, network
   locked).
3. Provision production Keycloak Droplet (4 vCPU / 8 GB) + managed Postgres +
   Caddy.
4. Configure production Keycloak realm (`rrr`) per `KEYCLOAK_REALM_SPEC.md`,
   with SMTP and theme rebrand.
5. Provision production DO App Platform app, **NOT auto-deploying on push**.
   Wire env vars from secret manager (production-only secrets).
6. Configure Cloudflare in front of the API and Keycloak hosts; enable WAF /
   rate-limit / TLS.
7. Wire DNS: `api.`, `auth.`, `status.` records to the right edges.
8. Enable branch protection on `main`.
9. Wire production HMAC keys for Phase-1 merchants (RedRoomPleasures, Cyrano).
   Hand them over via secure channels per `OPERATIONAL_RUNBOOK.md` §5.4. **Do
   not reuse staging keys.**
10. Set up monitoring + alerting (PagerDuty / Better Uptime / Datadog).
11. Cut the production tag (e.g. `v0.2.0`) at a known-good `main` SHA. Manual
    approval. Deploy.
12. Run §9 smoke-test list.
13. If everything green: declare production-up and notify integrators.

If any step fails: stop, do not proceed. Production is the place where halts
cost less than races.

---

## 11. Cost ballpark (production-grade, USD/month)

| Line                                         | Monthly (USD) |
| -------------------------------------------- | ------------: |
| DO App Platform Professional (2 instances)   |       $80–160 |
| DO Droplet 4 vCPU / 8 GB (Keycloak)          |        $48–96 |
| DO Managed Postgres (smallest production)    |        $30–60 |
| DO Spaces (cold logs + Mongo backups)        |        $10–20 |
| MongoDB Atlas M30 (ca-central-1)             |      $200–280 |
| Cloudflare (Pro plan minimum)                |           $20 |
| External uptime probe                        |           $10 |
| PagerDuty / Better Uptime alerting           |        $20–50 |
| Optional: Datadog APM                        |       $50–200 |
| **Total (production, lean)**                 |     **~$470** |
| **Total (production, fuller observability)** |     **~$700** |

These are within reach for a closed-beta loyalty engine with two Phase-1
merchants. Scale up the Atlas tier and App Platform instance count as real
traffic dictates — do not over-provision.

---

## 12. What this spec deliberately does not cover

- **Disaster recovery procedures** — separate document,
  `docs/DISASTER_RECOVERY_RUNBOOK.md`.
- **Incident response** — covered by `docs/OPERATIONAL_RUNBOOK.md`.
- **Application security review** — covered by `SECURITY.md` and the existing
  CodeQL / Super-Linter / B-009 / etc. CI guards.
- **Data subject rights / PIPEDA request handling** — separate compliance
  procedure (post-go-live deliverable).
- **Penetration testing** — recommended within 90 days of go-live; scope and
  provider TBD.
- **mTLS, HSM-backed signing, customer-managed encryption keys** — out of
  go-live scope. Revisit if a regulated rail (FINTRAC-touching) ever lands.

---

## 13. Open items before production-up

Tracked here because they don't fit cleanly elsewhere. Each must be closed
before §10 can begin.

- [ ] Alpha test pack passed at the same SHA being tagged for production.
- [ ] `v0.1.0-alpha.1` cut and tested on staging for ≥ 7 days continuously.
- [ ] Two-person on-call rotation defined (per `OPERATIONAL_RUNBOOK.md` §15).
- [ ] Status page provider chosen and wired.
- [ ] Cloudflare account + Pro plan provisioned.
- [ ] PagerDuty / Better Uptime account provisioned.
- [ ] Production secrets generated and stored in DO secret manager (NOT in repo,
      NOT reused from staging).
- [ ] Production realm export checked into the audit repo with first cycle
      complete.
- [ ] PIPEDA compliance review (separate ticket; light-touch since the
      architecture is Canada-resident by design).

When all checked, production cut-over is gated only by the §10 procedure itself.

---

_This spec is a living document until production is up and stable. Updates
require a CHORE: commit and (after go-live) a PR review by an operator who has
run a production deploy._
