# Database Migrations

**Status**: Scaffolded only - no migrations yet

## Purpose

Database migration scripts for schema versioning and evolution.

## Guidelines

When creating migrations:
- Use timestamp-based naming (e.g., `20251215_create_wallets_table.sql`)
- Include both `up` and `down` migration scripts
- Test migrations on development and staging first
- Never modify existing migrations (create new ones instead)
- Document breaking changes clearly

## Required Indexes

For performance, ensure these indexes exist when implementing:
- Wallet lookups by userId (unique)
- Transaction lookups by userId
- Transaction lookups by idempotencyKey (unique)
- Transaction lookups by timestamp

## Audit Trail Requirements

All transaction tables must support 7+ year retention.
