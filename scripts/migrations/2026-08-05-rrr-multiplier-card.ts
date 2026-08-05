#!/usr/bin/env ts-node
/**
 * Migration — Canon Amendment 2026-08: per-Standing-tier `rrr_multiplier` card.
 *
 * Two coordinated changes to the RRR earn economy (CEO directive):
 *   1. Remove the retired per-config earn lever from `earn_rate_configs`:
 *      `$unset` `inferno_multiplier` (retired Room-Heat "Inferno Bonus") and
 *      `rrr_member_tier` (drift — RRR has no member-tier ladder beyond Standing).
 *   2. Seed the tier benefits **card** `tier_benefit_configs` with one active
 *      row per Standing tier (Desire / Passion / Obsession / Reign) for the
 *      program tenant, each with `rrr_multiplier = 0` (0 % bonus, the CEO's
 *      admin-configurable default). Raising a tier's `rrr_multiplier` later is a
 *      new versioned row (insert + supersede), never an in-place edit.
 *
 * The program tenant is read from CONFIG (`RRR_PROGRAM_TENANT_ID`) — never a
 * hard-coded literal, same discipline as the wallet-tenant-id migration.
 *
 * Contract:
 *   - Idempotent: `$unset` is a no-op once fields are gone; card seeding skips a
 *     tier that already has an active (non-superseded) card. Safe to re-run.
 *   - No balance/ledger field is read or written.
 *   - `--dry-run` reports counts without writing.
 *   - `--unset` is the DOWN migration: supersedes the seeded cards (does not
 *     re-add the removed `earn_rate_configs` fields — that is a schema change).
 *   - Refuses to run without an explicit `RRR_PROGRAM_TENANT_ID` and MONGODB_URI.
 *
 * Usage:
 *   RRR_PROGRAM_TENANT_ID=<program-tenant> npm run migrate:rrr-multiplier-card -- --dry-run
 *   RRR_PROGRAM_TENANT_ID=<program-tenant> npm run migrate:rrr-multiplier-card
 *   RRR_PROGRAM_TENANT_ID=<program-tenant> npm run migrate:rrr-multiplier-card -- --unset   # rollback
 *
 * Run on development / staging first, then production (see infra/migrations/README.md).
 */

import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { EarnRateConfigModel } from '../../src/db/models/earn-rate-config.model';
import { TierBenefitConfigModel } from '../../src/db/models/tier-benefit-config.model';
import { RedRoomTier } from '../../src/interfaces/redroom-rewards';

interface Args {
  dryRun: boolean;
  unset: boolean;
}

// Seed cards — rrr_multiplier is 0 (0 % bonus) per CEO; the other per-tier
// benefit fields carry the prior intent so the card is complete.
const SEED_CARDS: Array<{
  tier: RedRoomTier;
  rrr_multiplier: number;
  double_points_days_per_year: number;
  birthday_bonus_days: number;
}> = [
  {
    tier: RedRoomTier.DESIRE,
    rrr_multiplier: 0,
    double_points_days_per_year: 4,
    birthday_bonus_days: 7,
  },
  {
    tier: RedRoomTier.PASSION,
    rrr_multiplier: 0,
    double_points_days_per_year: 6,
    birthday_bonus_days: 14,
  },
  {
    tier: RedRoomTier.OBSESSION,
    rrr_multiplier: 0,
    double_points_days_per_year: 8,
    birthday_bonus_days: 21,
  },
  {
    tier: RedRoomTier.REIGN,
    rrr_multiplier: 0,
    double_points_days_per_year: 10,
    birthday_bonus_days: 30,
  },
];

function parseArgs(argv: string[]): Args {
  return {
    dryRun: argv.includes('--dry-run'),
    unset: argv.includes('--unset'),
  };
}

function requireEnv(name: string): string {
  const value = (process.env[name] ?? '').trim();
  if (!value) {
    throw new Error(
      `${name} is required — set the canonical program tenant in config (no literal).`,
    );
  }
  return value;
}

function maskUri(uri: string): string {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^@]+)@/, '$1<redacted>@');
}

async function unsetRetiredEarnRateFields(args: Args): Promise<void> {
  const filter = {
    $or: [{ inferno_multiplier: { $exists: true } }, { rrr_member_tier: { $exists: true } }],
  };
  const count = await EarnRateConfigModel.countDocuments(filter);
  if (!args.dryRun) {
    await EarnRateConfigModel.updateMany(filter, {
      $unset: { inferno_multiplier: '', rrr_member_tier: '' },
    });
  }
  console.log(
    `  earn_rate_configs  unset inferno_multiplier + rrr_member_tier on ${count} doc(s)` +
      `${args.dryRun ? ' (DRY RUN)' : ''}`,
  );
}

async function seedTierBenefitCards(tenantId: string, args: Args): Promise<void> {
  const now = new Date();
  for (const card of SEED_CARDS) {
    const existing = await TierBenefitConfigModel.findOne({
      tenant_id: { $eq: tenantId },
      tier: { $eq: card.tier },
      superseded_at: null,
    });

    if (existing) {
      console.log(`  tier_benefit_configs  ${card.tier.padEnd(9)} active card exists — skip`);
      continue;
    }

    if (!args.dryRun) {
      await TierBenefitConfigModel.create({
        config_id: randomUUID(),
        tenant_id: tenantId,
        effective_at: now,
        superseded_at: null,
        correlation_id: randomUUID(),
        reason_code: 'CANON_2026_08_RRR_MULTIPLIER_SEED',
        created_by: 'migration:rrr-multiplier-card',
        tier: card.tier,
        rrr_multiplier: card.rrr_multiplier,
        double_points_days_per_year: card.double_points_days_per_year,
        birthday_bonus_days: card.birthday_bonus_days,
      });
    }
    console.log(
      `  tier_benefit_configs  ${card.tier.padEnd(9)} seed rrr_multiplier=${card.rrr_multiplier}` +
        `${args.dryRun ? ' (DRY RUN)' : ''}`,
    );
  }
}

async function unseedTierBenefitCards(tenantId: string, args: Args): Promise<void> {
  const filter = {
    tenant_id: { $eq: tenantId },
    reason_code: { $eq: 'CANON_2026_08_RRR_MULTIPLIER_SEED' },
    superseded_at: null,
  };
  const count = await TierBenefitConfigModel.countDocuments(filter);
  if (!args.dryRun) {
    await TierBenefitConfigModel.updateMany(filter, { $set: { superseded_at: new Date() } });
  }
  console.log(
    `  tier_benefit_configs  superseded ${count} seeded card(s)${args.dryRun ? ' (DRY RUN)' : ''}`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const uri = requireEnv('MONGODB_URI');
  const tenantId = requireEnv('RRR_PROGRAM_TENANT_ID');

  console.log(
    `migrate:rrr-multiplier-card: ${args.unset ? 'UNSET (rollback)' : 'apply'}` +
      `${args.dryRun ? ' (DRY RUN)' : ''}`,
  );
  console.log(`migrate:rrr-multiplier-card: MONGODB_URI host = ${maskUri(uri)}`);
  console.log(`migrate:rrr-multiplier-card: program tenant_id = ${tenantId}`);

  await mongoose.connect(uri);
  try {
    if (args.unset) {
      await unseedTierBenefitCards(tenantId, args);
    } else {
      await unsetRetiredEarnRateFields(args);
      await seedTierBenefitCards(tenantId, args);
    }
    console.log('migrate:rrr-multiplier-card: done.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('migrate:rrr-multiplier-card: FAILED');
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
