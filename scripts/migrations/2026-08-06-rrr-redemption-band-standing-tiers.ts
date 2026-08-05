#!/usr/bin/env ts-node
/**
 * Migration — Canon Amendment 2026-08: per-Standing-tier redemption band.
 *
 * Refolds `tier_cap_configs` off the retired per-merchant `GUEST…PLATINUM`
 * ladder onto the RRR Standing tiers (Desire / Passion / Obsession / Reign),
 * and adds the 5 % redemption floor alongside the per-tier cap:
 *
 *   DESIRE     5 % … 15 %
 *   PASSION    5 % … 25 %
 *   OBSESSION  5 % … 35 %
 *   REIGN      5 % … 45 %
 *
 * Two steps:
 *   1. Supersede any active legacy cap row (one carrying `tier_name`, not the
 *      new `tier` field) — stamp `superseded_at`. The band is now program-wide
 *      Standing-tier policy (tenant-scoped, no merchant_id).
 *   2. Seed one active card per Standing tier for the program tenant with its
 *      floor (5 %) and cap. Admin re-versions by insert + supersede.
 *
 * The program tenant is read from CONFIG (`RRR_PROGRAM_TENANT_ID`) — never a
 * hard-coded literal.
 *
 * Contract:
 *   - Idempotent: legacy-supersede skips rows already carrying `tier`; seeding
 *     skips a tier that already has an active card. Safe to re-run.
 *   - No balance/ledger field is read or written.
 *   - `--dry-run` reports counts without writing.
 *   - `--unset` is the DOWN migration: supersedes the seeded cards only.
 *   - Refuses to run without an explicit `RRR_PROGRAM_TENANT_ID` and MONGODB_URI.
 *
 * Usage:
 *   RRR_PROGRAM_TENANT_ID=<program-tenant> npm run migrate:rrr-redemption-band -- --dry-run
 *   RRR_PROGRAM_TENANT_ID=<program-tenant> npm run migrate:rrr-redemption-band
 *   RRR_PROGRAM_TENANT_ID=<program-tenant> npm run migrate:rrr-redemption-band -- --unset
 *
 * Run on development / staging first, then production (see infra/migrations/README.md).
 */

import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { TierCapConfigModel } from '../../src/db/models/tier-cap-config.model';
import { RedRoomTier } from '../../src/interfaces/redroom-rewards';

interface Args {
  dryRun: boolean;
  unset: boolean;
}

const REASON_CODE = 'CANON_2026_08_REDEMPTION_BAND_SEED';

// CEO-set redemption band per Standing tier: 5 % floor, per-tier cap.
const SEED_BANDS: Array<{
  tier: RedRoomTier;
  redemption_floor_pct: number;
  redemption_cap_pct: number;
}> = [
  { tier: RedRoomTier.DESIRE, redemption_floor_pct: 5, redemption_cap_pct: 15 },
  { tier: RedRoomTier.PASSION, redemption_floor_pct: 5, redemption_cap_pct: 25 },
  { tier: RedRoomTier.OBSESSION, redemption_floor_pct: 5, redemption_cap_pct: 35 },
  { tier: RedRoomTier.REIGN, redemption_floor_pct: 5, redemption_cap_pct: 45 },
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

async function supersedeLegacyCapRows(tenantId: string, args: Args): Promise<void> {
  // Legacy rows carry `tier_name` (retired ladder) and lack the new `tier` field.
  const filter = {
    tenant_id: { $eq: tenantId },
    superseded_at: null,
    tier: { $exists: false },
  };
  const count = await TierCapConfigModel.countDocuments(filter);
  if (!args.dryRun) {
    await TierCapConfigModel.updateMany(filter, { $set: { superseded_at: new Date() } });
  }
  console.log(
    `  tier_cap_configs  superseded ${count} legacy (tier_name) row(s)${args.dryRun ? ' (DRY RUN)' : ''}`,
  );
}

async function seedRedemptionBands(tenantId: string, args: Args): Promise<void> {
  const now = new Date();
  for (const band of SEED_BANDS) {
    const existing = await TierCapConfigModel.findOne({
      tenant_id: { $eq: tenantId },
      tier: { $eq: band.tier },
      superseded_at: null,
    });

    if (existing) {
      console.log(`  tier_cap_configs  ${band.tier.padEnd(9)} active card exists — skip`);
      continue;
    }

    if (!args.dryRun) {
      await TierCapConfigModel.create({
        config_id: randomUUID(),
        tenant_id: tenantId,
        effective_at: now,
        superseded_at: null,
        correlation_id: randomUUID(),
        reason_code: REASON_CODE,
        created_by: 'migration:rrr-redemption-band',
        tier: band.tier,
        redemption_floor_pct: band.redemption_floor_pct,
        redemption_cap_pct: band.redemption_cap_pct,
      });
    }
    console.log(
      `  tier_cap_configs  ${band.tier.padEnd(9)} seed ${band.redemption_floor_pct}%–${band.redemption_cap_pct}%` +
        `${args.dryRun ? ' (DRY RUN)' : ''}`,
    );
  }
}

async function unseedRedemptionBands(tenantId: string, args: Args): Promise<void> {
  const filter = {
    tenant_id: { $eq: tenantId },
    reason_code: { $eq: REASON_CODE },
    superseded_at: null,
  };
  const count = await TierCapConfigModel.countDocuments(filter);
  if (!args.dryRun) {
    await TierCapConfigModel.updateMany(filter, { $set: { superseded_at: new Date() } });
  }
  console.log(
    `  tier_cap_configs  superseded ${count} seeded band(s)${args.dryRun ? ' (DRY RUN)' : ''}`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const uri = requireEnv('MONGODB_URI');
  const tenantId = requireEnv('RRR_PROGRAM_TENANT_ID');

  console.log(
    `migrate:rrr-redemption-band: ${args.unset ? 'UNSET (rollback)' : 'apply'}` +
      `${args.dryRun ? ' (DRY RUN)' : ''}`,
  );
  console.log(`migrate:rrr-redemption-band: MONGODB_URI host = ${maskUri(uri)}`);
  console.log(`migrate:rrr-redemption-band: program tenant_id = ${tenantId}`);

  await mongoose.connect(uri);
  try {
    if (args.unset) {
      await unseedRedemptionBands(tenantId, args);
    } else {
      await supersedeLegacyCapRows(tenantId, args);
      await seedRedemptionBands(tenantId, args);
    }
    console.log('migrate:rrr-redemption-band: done.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('migrate:rrr-redemption-band: FAILED');
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
