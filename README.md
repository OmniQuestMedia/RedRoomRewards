# RedRoomRewards

> **Sovereign Policy:**
> [OQMI Infrastructure and Security Policy](OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md)
> — company-wide operational, security, and infrastructure authority (v1.0,
> effective 2026-05-06). All teams and agents must comply. Where any conflict
> arises with older security documents, this policy prevails.

[![Program Control](https://img.shields.io/badge/Program_Control-DIRECTIVES-blue?style=flat-square)](PROGRAM_CONTROL/DIRECTIVES/QUEUE/)
[![Production Schedule](https://img.shields.io/badge/Production_Schedule-ACTIVE-green?style=flat-square)](.github/PRODUCTION_SCHEDULE.md)
[![CI](https://github.com/OmniQuestMediaInc/RedRoomRewards/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml)
[![Fast-Path](https://img.shields.io/badge/Fast--Path-Copilot_Internal-blueviolet?style=flat-square)](.github/workflows/copilot-internal.yml)
[![Ship-Gate](https://img.shields.io/badge/Ship--Gate-Required-black?style=flat-square)](PROGRAM_CONTROL/ship-gate-verifier.ts)

## Purpose

RedRoomRewards (RRR) is the **advanced loyalty and rewards engine** for the
OmniQuest Media Inc. cam/toy ecosystem. It provides:

- **Wallet & ledger** — append-only point balances, earn, redeem, escrow, expiry
- **Tier engine** — member tiers driven by accrual thresholds
- **Multi-tenant SaaS** — one loyalty backend powering multiple merchant
  platforms
- **Webhooks & fraud signals** — event-driven integration for connected
  platforms
- **Compliance-first** — PIPEDA-aligned, PII-minimized, full audit trail

RRR is a **backend service only**. It contains no UI, no streaming, no chat, and
no game logic. External platforms integrate via the
[API spec](api/openapi.yaml).

## Tenants & Integrations

| Tenant / Integration     | Role                    | Notes                                                                                                                                               |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ChatNow.Zone**         | Primary merchant tenant | Phase 1 live integration                                                                                                                            |
| **Cyrano**               | Merchant tenant         | Phase 1 — cam platform loyalty earn/redeem                                                                                                          |
| **RedRoomPleasures**     | Merchant tenant         | Phase 1 — adult toy / eComm rewards                                                                                                                 |
| **Marketplace / eComms** | eCommerce channel       | Point earn on purchases via WordPress WooCommerce plugin                                                                                            |
| **WordPress plugin**     | Integration bridge      | `integrations/wordpress-redroompleasures/` — syncs purchase events to RRR earn API                                                                  |
| **OKIB**                 | Advisory intelligence   | OmniQuest Knowledge & Intelligence Bus — gated personalization/nudge context (scaffolding, `OKIB_ENABLED`, off by default; never in the money path) |

Integration contracts: [HMAC auth contract](docs/AUTH_CONTRACT.md) ·
[UX integration brief](docs/UX_INTEGRATION_BRIEF.md) ·
[API spec](api/openapi.yaml)

## Status

Alpha test prep landing — `v0.1.0-alpha.1` is the next cut. Waves A–D are closed
and the post-D wiring audit + security hardening (fail-closed middleware, signup
rate-limit, OpenAPI gated in production) shipped. The Alpha documentation set is
in: HMAC auth contract, UX integration brief, staging deploy spec, alpha test
pack, 9 wireframe specs (`docs/ux/`), and the WordPress + Cyrano integration
packets. Build clean (`npm run build`); 585 tests / 60 suites pass under
`npm run test:ci`. See the [production schedule](.github/PRODUCTION_SCHEDULE.md)
for ALP-1..ALP-8 detail.

**OKIB integration:** scaffolding landed on `feat/okib-integration` — gated
`OkibIntegrationService` (off by default via `OKIB_ENABLED`), integration plan,
and a rewards-qualification review. Inert until a real OKIB endpoint is
provisioned and the `OKIB` term is ratified in the domain glossary. Next: define
the OKIB request/response contract and wire creator-affinity → `resolveBonus` →
`awardPoints` (plan §6, Wave 3).

## Key docs

| Doc                                                                                | Purpose                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| [**Governance**](OQMI_GOVERNANCE.md)                                               | **Company-wide engineering governance (v1.0)** |
| [**Infrastructure & Security Policy**](OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md) | **Sovereign security & infra policy (v1.0)**   |
| [Program Control directives](PROGRAM_CONTROL/DIRECTIVES/QUEUE/)                    | Active work orders and governance directives   |
| [Architecture](docs/UNIVERSAL_ARCHITECTURE.md)                                     | System design                                  |
| [API spec](api/openapi.yaml)                                                       | Endpoint contracts                             |
| [Domain glossary](docs/DOMAIN_GLOSSARY.md)                                         | Naming authority                               |
| [Auth contract](docs/AUTH_CONTRACT.md)                                             | HMAC service-to-service auth                   |
| [UX integration brief](docs/UX_INTEGRATION_BRIEF.md)                               | Design / front-end binding contract            |
| [Staging deploy spec](docs/STAGING_DEPLOY_SPEC.md)                                 | Alpha staging topology                         |
| [Alpha test pack](docs/ALPHA_TEST_PACK.md)                                         | What gets exercised before tag                 |
| [CEO decisions](docs/RRR_CEO_DECISIONS_FINAL_2026-04-17.md)                        | Binding rulings                                |
| [Coding doctrine](.github/copilot-instructions.md)                                 | AI + human dev rules                           |
| [OKIB integration plan](docs/okib-integration-plan.md)                             | OKIB personalization integration (scaffolding) |
| [Rewards qualification review](docs/rewards-qualification-review.md)               | Purchase → earn qualification rules + gaps     |

## Corporate boilerplate

- **Legal entity:** OmniQuest Media Inc. (Ontario corporation)
- **Jurisdiction:** Ontario, Canada
- **Infrastructure residency standard:** Canada-only production data residency
  (`ca-central-1` or equivalent Canadian regions)
- **Rule tag for this refresh:** `[rule_applied_id: GOVERNANCE-EQ-v1]`

## Quick start

```bash
cp .env.example .env   # fill in secrets
npm install
npm run build
npm test
npm run ship-gate
```

### Lint & format

```bash
# Full lint gate (used in CI — must pass before merging):
npm run lint:ci

# Auto-fix all lint + formatting issues across the repo:
npm run lint:fix

# Check formatting only:
npm run format:check

# Type-check only:
npm run type-check
```

> The pre-commit hook runs `lint-staged` automatically on staged files. Run
> `npm run lint:fix` manually after a fresh clone to ensure a clean baseline.

### CI fast-path + ship-gate

- `copilot/*`, `grok/*`, and `agent/*` branches run the fast-path workflow:
  `.github/workflows/copilot-internal.yml`
- Main CI executes `npm run ship-gate` via
  `PROGRAM_CONTROL/ship-gate-verifier.ts`
- Advisory lint governance runs in `.github/workflows/super-linter.yml`
- Non-financial PRs target auto-merge when required checks are green/gray per
  governance labels and branch protection

### With Docker (local dev services)

```bash
# Start MongoDB + Redis (see infra/ for config)
docker-compose -f infra/docker-compose.yml up -d

cp .env.example .env   # fill in secrets
npm install
npm run build
npm test
```

> **Note:** `infra/docker-compose.yml` is scaffolded — see `infra/README.md` for
> current status. For staging topology see
> [Staging deploy spec](docs/STAGING_DEPLOY_SPEC.md).
