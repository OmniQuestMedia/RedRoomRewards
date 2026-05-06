# RedRoomRewards

Loyalty-points backend for OmniQuest Media Inc. — Node.js / TypeScript, NestJS, MongoDB.

> **Sovereign Policy:** [OQMI Infrastructure and Security Policy](OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md) — company-wide operational, security, and infrastructure authority (v1.0, effective 2026-05-06). All teams and agents must comply. Where any conflict arises with older security documents, this policy prevails.

## What this is

A loyalty platform: wallet management, point earn/redeem, ledger, tier engine,
webhooks, and fraud signals. Not a chat app, not a streaming platform, not a UI.

## Status

Alpha test prep landing — `v0.1.0-alpha.1` is the next cut. Waves A–D are
closed and the post-D wiring audit + security hardening (fail-closed
middleware, signup rate-limit, OpenAPI gated in production) shipped. The
Alpha documentation set is in: HMAC auth contract, UX integration brief,
staging deploy spec, alpha test pack, 9 wireframe specs (`docs/ux/`), and
the WordPress + Cyrano integration packets. Build clean
(`npm run build`); 550 tests / 57 suites pass under `npm run test:ci`. See
the [production schedule](.github/PRODUCTION_SCHEDULE.md) for ALP-1..ALP-8
detail.

## Key docs

| Doc | Purpose |
|-----|---------|
| [**Infrastructure & Security Policy**](OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md) | **Sovereign security & infra policy (v1.0)** |
| [Architecture](docs/UNIVERSAL_ARCHITECTURE.md) | System design |
| [API spec](api/openapi.yaml) | Endpoint contracts |
| [Domain glossary](docs/DOMAIN_GLOSSARY.md) | Naming authority |
| [Auth contract](docs/AUTH_CONTRACT.md) | HMAC service-to-service auth |
| [UX integration brief](docs/UX_INTEGRATION_BRIEF.md) | Design / front-end binding contract |
| [Staging deploy spec](docs/STAGING_DEPLOY_SPEC.md) | Alpha staging topology |
| [Alpha test pack](docs/ALPHA_TEST_PACK.md) | What gets exercised before tag |
| [CEO decisions](docs/RRR_CEO_DECISIONS_FINAL_2026-04-17.md) | Binding rulings |
| [Coding doctrine](.github/copilot-instructions.md) | AI + human dev rules |

## Quick start

```bash
cp .env.example .env   # fill in secrets
npm install
npm run build
npm test
```
