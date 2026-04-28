# RedRoomRewards

Loyalty-points backend for OmniQuest Media Inc. — Node.js / TypeScript, NestJS, MongoDB.

## What this is

A loyalty platform: wallet management, point earn/redeem, ledger, tier engine,
webhooks, and fraud signals. Not a chat app, not a streaming platform, not a UI.

## Status

Alpha test prep. Waves A–D closed; post-D wiring audit + security hardening
landed (fail-closed middleware, signup rate-limit, OpenAPI gated in prod).
Build clean (`npm run build`); test suite green at last CI run.
See [production schedule](.github/PRODUCTION_SCHEDULE.md) for task-level detail
and the open Alpha-prep work list.

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
