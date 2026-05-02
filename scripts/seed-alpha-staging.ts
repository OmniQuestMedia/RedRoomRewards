#!/usr/bin/env ts-node
/**
 * Seed script for Alpha staging fixtures.
 *
 * Creates the named test fixtures referenced in `docs/ALPHA_TEST_PACK.md` §3
 * so that the test pack can run without ad-hoc data generation.
 *
 * Idempotent: safe to re-run. Existing fixtures are upserted to the
 * documented starting state. No fixture is destructively recreated; if a
 * test mutated a fixture's state, this script restores it.
 *
 * Environment safety:
 *   - Refuses to run if NODE_ENV === 'production'.
 *   - Refuses to run if MONGODB_URI host suggests a production cluster
 *     (configurable via SEED_PROD_HOST_DENYLIST env var).
 *   - Idempotency-keyed by fixture userId / modelId — never deletes.
 *
 * Usage:
 *   npm run seed:alpha-staging
 *   npm run seed:alpha-staging -- --dry-run   # plan only, no writes
 *
 * Authority: defers to docs/ALPHA_TEST_PACK.md §3 for the canonical
 * fixture list. If they disagree, the test pack wins and this script
 * gets a follow-up.
 */

import mongoose from 'mongoose';
import { TenantModel, ITenant } from '../src/db/models/tenant.model';
import { WalletModel, IWallet } from '../src/db/models/wallet.model';
import { ModelWalletModel, IModelWallet } from '../src/db/models/model-wallet.model';

interface SeedTenant {
  tenant_id: string;
  name: string;
  phase: 1 | 2;
}

interface SeedMemberWallet {
  userId: string;
  availableBalance: number;
  notes: string;
}

interface SeedModelWallet {
  modelId: string;
  earnedBalance: number;
  type: 'promotional' | 'earnings';
}

const TENANTS: SeedTenant[] = [
  { tenant_id: 'redroompleasures', name: 'RedRoomPleasures', phase: 1 },
  { tenant_id: 'cyrano', name: 'Cyrano', phase: 1 },
  { tenant_id: 'oqmi', name: 'OmniQuest Media Inc.', phase: 1 },
];

const MEMBER_WALLETS: SeedMemberWallet[] = [
  { userId: 'test-member-gold-001', availableBalance: 5000, notes: 'GOLD tier; canonical happy-path fixture' },
  { userId: 'test-member-plat-001', availableBalance: 10000, notes: 'PLATINUM tier; high-value redemption coverage' },
  { userId: 'test-member-diamond-001', availableBalance: 0, notes: 'Diamond Concierge; earn must be blocked (CEO D3)' },
  { userId: 'test-member-empty-001', availableBalance: 0, notes: 'Zero-balance; insufficient-balance coverage' },
];

const MODEL_WALLETS: SeedModelWallet[] = [
  { modelId: 'test-model-001', earnedBalance: 2500, type: 'earnings' },
];

const PROD_HOST_DENYLIST_DEFAULT = ['prod', 'production', 'live'];

function parseArgs(argv: string[]): { dryRun: boolean } {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

function refuseIfProd(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seed-alpha-staging: NODE_ENV=production — refusing to run. This script is for staging only.',
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('seed-alpha-staging: MONGODB_URI is required.');
  }

  const denylist = (process.env.SEED_PROD_HOST_DENYLIST ?? PROD_HOST_DENYLIST_DEFAULT.join(','))
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  const lowered = uri.toLowerCase();
  for (const needle of denylist) {
    if (lowered.includes(needle)) {
      throw new Error(
        `seed-alpha-staging: MONGODB_URI contains "${needle}" — refusing to run. ` +
          `If this is a false positive, set SEED_PROD_HOST_DENYLIST to a narrower list.`,
      );
    }
  }
}

async function upsertTenant(t: SeedTenant, dryRun: boolean): Promise<'created' | 'updated' | 'unchanged'> {
  const existing = await TenantModel.findOne({ tenant_id: t.tenant_id }).lean();
  if (!existing) {
    if (!dryRun) {
      await TenantModel.create({
        tenant_id: t.tenant_id,
        name: t.name,
        status: 'active',
        phase: t.phase,
        default_currency: 'points',
        notes: 'Seeded by scripts/seed-alpha-staging.ts',
      } as Partial<ITenant>);
    }
    return 'created';
  }
  // Restore canonical fields if drifted.
  const drifted =
    existing.name !== t.name || existing.phase !== t.phase || existing.status !== 'active';
  if (drifted) {
    if (!dryRun) {
      await TenantModel.updateOne(
        { tenant_id: t.tenant_id },
        { $set: { name: t.name, phase: t.phase, status: 'active' } },
      );
    }
    return 'updated';
  }
  return 'unchanged';
}

async function upsertMemberWallet(w: SeedMemberWallet, dryRun: boolean): Promise<'created' | 'reset' | 'unchanged'> {
  const existing = await WalletModel.findOne({ userId: w.userId }).lean();
  if (!existing) {
    if (!dryRun) {
      await WalletModel.create({
        userId: w.userId,
        availableBalance: w.availableBalance,
        escrowBalance: 0,
        currency: 'points',
        version: 0,
      } as Partial<IWallet>);
    }
    return 'created';
  }
  const drifted =
    existing.availableBalance !== w.availableBalance || existing.escrowBalance !== 0;
  if (drifted) {
    if (!dryRun) {
      await WalletModel.updateOne(
        { userId: w.userId },
        { $set: { availableBalance: w.availableBalance, escrowBalance: 0 }, $inc: { version: 1 } },
      );
    }
    return 'reset';
  }
  return 'unchanged';
}

async function upsertModelWallet(m: SeedModelWallet, dryRun: boolean): Promise<'created' | 'reset' | 'unchanged'> {
  const existing = await ModelWalletModel.findOne({ modelId: m.modelId }).lean();
  if (!existing) {
    if (!dryRun) {
      await ModelWalletModel.create({
        modelId: m.modelId,
        earnedBalance: m.earnedBalance,
        currency: 'points',
        type: m.type,
        version: 0,
      } as Partial<IModelWallet>);
    }
    return 'created';
  }
  const drifted = existing.earnedBalance !== m.earnedBalance || existing.type !== m.type;
  if (drifted) {
    if (!dryRun) {
      await ModelWalletModel.updateOne(
        { modelId: m.modelId },
        { $set: { earnedBalance: m.earnedBalance, type: m.type }, $inc: { version: 1 } },
      );
    }
    return 'reset';
  }
  return 'unchanged';
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv.slice(2));

  refuseIfProd();

  console.log(`seed-alpha-staging: starting${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`seed-alpha-staging: MONGODB_URI host = ${maskUri(process.env.MONGODB_URI!)}`);

  await mongoose.connect(process.env.MONGODB_URI!);

  try {
    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const t of TENANTS) {
      const r = await upsertTenant(t, dryRun);
      console.log(`  tenant  ${t.tenant_id.padEnd(20)}  ${r}`);
      if (r === 'created') created++;
      else if (r === 'updated') updated++;
      else unchanged++;
    }

    for (const w of MEMBER_WALLETS) {
      const r = await upsertMemberWallet(w, dryRun);
      console.log(`  wallet  ${w.userId.padEnd(28)}  ${r}  (avail=${w.availableBalance})`);
      if (r === 'created') created++;
      else if (r === 'reset') updated++;
      else unchanged++;
    }

    for (const m of MODEL_WALLETS) {
      const r = await upsertModelWallet(m, dryRun);
      console.log(`  model   ${m.modelId.padEnd(28)}  ${r}  (earned=${m.earnedBalance})`);
      if (r === 'created') created++;
      else if (r === 'reset') updated++;
      else unchanged++;
    }

    console.log(
      `seed-alpha-staging: done. created=${created} updated=${updated} unchanged=${unchanged}${dryRun ? ' (DRY RUN — no writes)' : ''}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

function maskUri(uri: string): string {
  // Strip credentials before logging.
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^@]+)@/, '$1<redacted>@');
}

main().catch((err) => {
  console.error('seed-alpha-staging: FAILED');
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
