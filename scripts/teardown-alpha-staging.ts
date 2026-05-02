#!/usr/bin/env ts-node
/**
 * Tear-down script for Alpha staging fixtures.
 *
 * Counterpart to scripts/seed-alpha-staging.ts. Removes every record
 * keyed off the test-* prefixed userIds / modelIds, plus the derived
 * Wallet, ModelWallet, EscrowItem, and PointLot records so a subsequent
 * seed run starts from a clean slate.
 *
 * Designed to be run between test-pack runs to reset fixture state.
 *
 * INVARIANT: this script NEVER deletes from the LedgerEntry collection.
 * The append-only ledger invariant (docs/OPERATIONAL_RUNBOOK.md §0) is
 * stated unconditionally — "Never UPDATE or DELETE a LedgerEntry row."
 * That invariant applies in staging too. If a destructive test polluted
 * the staging ledger with too many test-* entries to be tolerable, the
 * correct procedure is to drop the entire staging database and re-seed
 * (a documented manual step — see docs/SEED_ALPHA_STAGING.md §8.4),
 * not to add a flag here that DELETEs ledger rows.
 *
 * Environment safety (same as seed):
 *   - Refuses to run if NODE_ENV === 'production'.
 *   - Refuses to run if MONGODB_URI host suggests a production cluster
 *     (configurable via SEED_PROD_HOST_DENYLIST env var).
 *   - Operates only on records whose key prefix matches a test-fixture
 *     allowlist (TEST_USER_PREFIX, TEST_MODEL_PREFIX, TEST_OPERATOR_PREFIX).
 *     Will NEVER delete a record whose ID does not match.
 *
 * Usage:
 *   npm run teardown:alpha-staging -- --dry-run
 *   npm run teardown:alpha-staging
 *
 * Authority: defers to docs/ALPHA_TEST_PACK.md §3 (the canonical fixture
 * list) and to the §0 "ledger is append-only" invariant in
 * docs/OPERATIONAL_RUNBOOK.md.
 */

import mongoose from 'mongoose';
import { TenantModel } from '../src/db/models/tenant.model';
import { WalletModel } from '../src/db/models/wallet.model';
import { ModelWalletModel } from '../src/db/models/model-wallet.model';
import { PointLotModel } from '../src/db/models/point-lot.model';
import { EscrowItemModel } from '../src/db/models/escrow-item.model';
// LedgerEntryModel intentionally NOT imported. The append-only ledger
// invariant (docs/OPERATIONAL_RUNBOOK.md §0) forbids DELETE on ledger rows
// in any environment.

const TEST_USER_PREFIX = 'test-member-';
const TEST_MODEL_PREFIX = 'test-model-';
const TEST_OPERATOR_PREFIX = 'test-operator-';

const PROD_HOST_DENYLIST_DEFAULT = ['prod', 'production', 'live'];

interface Args {
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  // --include-ledger was previously supported; removed per append-only
  // invariant. Reject explicitly so anyone copying an old command sees
  // a clear error rather than silent acceptance.
  if (argv.includes('--include-ledger')) {
    throw new Error(
      'teardown-alpha-staging: --include-ledger is not supported. The append-only ' +
        'ledger invariant (docs/OPERATIONAL_RUNBOOK.md §0) forbids DELETE on ledger ' +
        'rows in any environment. To wipe ledger entries on staging, drop the entire ' +
        'staging database manually and re-run npm run seed:alpha-staging.',
    );
  }
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

function refuseIfProd(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'teardown-alpha-staging: NODE_ENV=production — refusing to run. This script is for staging only.',
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('teardown-alpha-staging: MONGODB_URI is required.');
  }

  const denylist = (process.env.SEED_PROD_HOST_DENYLIST ?? PROD_HOST_DENYLIST_DEFAULT.join(','))
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  const lowered = uri.toLowerCase();
  for (const needle of denylist) {
    if (lowered.includes(needle)) {
      throw new Error(
        `teardown-alpha-staging: MONGODB_URI contains "${needle}" — refusing to run. ` +
          `If this is a false positive, set SEED_PROD_HOST_DENYLIST to a narrower list.`,
      );
    }
  }
}

function maskUri(uri: string): string {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^@]+)@/, '$1<redacted>@');
}

/**
 * Build a Mongo regex filter that matches strings starting with any of the
 * given prefixes. Anchored to start-of-string so we never match a record
 * whose ID *contains* "test-" in the middle.
 */
function prefixFilter(prefixes: string[]): { $regex: RegExp } {
  const escaped = prefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return { $regex: new RegExp(`^(${escaped.join('|')})`) };
}

async function teardown(args: Args): Promise<void> {
  console.log(`teardown-alpha-staging: starting${args.dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`teardown-alpha-staging: MONGODB_URI host = ${maskUri(process.env.MONGODB_URI!)}`);
  console.log('teardown-alpha-staging: ledger entries are PRESERVED (append-only invariant)');

  const userPrefixFilter = prefixFilter([TEST_USER_PREFIX, TEST_OPERATOR_PREFIX]);
  const modelPrefixFilter = prefixFilter([TEST_MODEL_PREFIX]);

  let totalDeleted = 0;

  // 1. Wallets keyed by test userId
  {
    const filter = { userId: userPrefixFilter };
    const matched = await WalletModel.countDocuments(filter);
    if (!args.dryRun && matched > 0) {
      const r = await WalletModel.deleteMany(filter);
      totalDeleted += r.deletedCount ?? 0;
    }
    console.log(`  Wallet               matched=${matched}  ${args.dryRun ? '(dry)' : 'deleted'}`);
  }

  // 2. Model wallets keyed by test modelId
  {
    const filter = { modelId: modelPrefixFilter };
    const matched = await ModelWalletModel.countDocuments(filter);
    if (!args.dryRun && matched > 0) {
      const r = await ModelWalletModel.deleteMany(filter);
      totalDeleted += r.deletedCount ?? 0;
    }
    console.log(`  ModelWallet          matched=${matched}  ${args.dryRun ? '(dry)' : 'deleted'}`);
  }

  // 3. Escrow items linked to test users or models
  {
    const filter = { $or: [{ userId: userPrefixFilter }, { modelId: modelPrefixFilter }] };
    const matched = await EscrowItemModel.countDocuments(filter);
    if (!args.dryRun && matched > 0) {
      const r = await EscrowItemModel.deleteMany(filter);
      totalDeleted += r.deletedCount ?? 0;
    }
    console.log(`  EscrowItem           matched=${matched}  ${args.dryRun ? '(dry)' : 'deleted'}`);
  }

  // 4. PointLots — wallet_id is the userId on the wallet
  {
    const filter = { wallet_id: userPrefixFilter };
    const matched = await PointLotModel.countDocuments(filter);
    if (!args.dryRun && matched > 0) {
      const r = await PointLotModel.deleteMany(filter);
      totalDeleted += r.deletedCount ?? 0;
    }
    console.log(`  PointLot             matched=${matched}  ${args.dryRun ? '(dry)' : 'deleted'}`);
  }

  // LedgerEntry is intentionally not deleted by this script — see the file
  // header. To wipe ledger entries on staging, drop the staging database
  // manually and re-run npm run seed:alpha-staging.

  // Tenants are NEVER torn down by this script. Tenants are seeded for the
  // life of the staging environment; if you need to remove a tenant row,
  // do it manually with a documented justification.
  const tenantCount = await TenantModel.countDocuments({});
  console.log(`  Tenant               (preserved; ${tenantCount} present)`);
  console.log('  LedgerEntry          (preserved; append-only invariant)');

  console.log(
    `teardown-alpha-staging: done. records-removed=${totalDeleted}${args.dryRun ? ' (DRY RUN — no writes)' : ''}`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  refuseIfProd();

  await mongoose.connect(process.env.MONGODB_URI!);

  try {
    await teardown(args);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('teardown-alpha-staging: FAILED');
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
