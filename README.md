# RedRoomRewards

Loyalty-points backend for OmniQuest Media Inc. — Node.js / TypeScript, NestJS, MongoDB.

## What this is

A loyalty platform: wallet management, point earn/redeem, ledger, tier engine,
webhooks, and fraud signals. Not a chat app, not a streaming platform, not a UI.

## Status

Wave D in progress — observability, rate-limiting, and API hardening.
452 tests passing across 47 suites. Build clean (`npm run build`).
See [production schedule](.github/PRODUCTION_SCHEDULE.md) for task-level detail.

## Key docs

| Doc | Purpose |
|-----|---------|
| [Architecture](docs/UNIVERSAL_ARCHITECTURE.md) | System design |
| [API spec](api/openapi.yaml) | Endpoint contracts |
| [Domain glossary](docs/DOMAIN_GLOSSARY.md) | Naming authority |
| [CEO decisions](docs/RRR_CEO_DECISIONS_FINAL_2026-04-17.md) | Binding rulings |
| [Coding doctrine](.github/copilot-instructions.md) | AI + human dev rules |

## Quick start

```bash
cp .env.example .env   # fill in secrets
npm install
npm run build
npm test
```
