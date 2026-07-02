#!/usr/bin/env ts-node
/**
 * Migration — RRR-#2 Phase A backfill: stamp `tenant_id` on the money store.
 *
 * Sets `tenant_id` on every `wallets` / `model_wallets` / `escrow_items`
 * document that lacks one, to the single canonical OmniQuest PROGRAM tenant.
 * OmniQuest's sites (ChatNow, Synthi, RedRoomPleasures, RedRoomRewards.com) are
 * MERCHANTS within ONE program tenant — wallets scope by program, unified
 * across merchants — so a single program tenant_id is correct and does not
 * fragment balances. (merchant_id lives on the ledger / EarnRateConfig, never
 * on the wallet.)
 *
 * The program tenant is read from CONFIG (`RRR_PROGRAM_TENANT_ID`) — never a
 * hard-coded literal, same discipline as the WooCommerce earn-rate refactor.
 *
 * Contract:
 *   - Idempotent: only writes docs missing `tenant_id`; safe to re-run.
 *   - No balance field is read or written — pure isolation-key backfill.
 *   - `--dry-run` reports counts without writing.
 *   - `--unset` is the DOWN migration: removes `tenant_id` from docs that carry
 *     the program tenant (rollback of this backfill only).
 *   - Refuses to run without an explicit `RRR_PROGRAM_TENANT_ID` and MONGODB_URI.
 *
 * Usage:
 *   RRR_PROGRAM_TENANT_ID=<program-tenant> npm run migrate:wallet-tenant-id -- --dry-run
 *   RRR_PROGRAM_TENANT_ID=<program-tenant> npm run migrate:wallet-tenant-id
 *   RRR_PROGRAM_TENANT_ID=<program-tenant> npm run migrate:wallet-tenant-id -- --unset   # rollback
 *
 * Run on development / staging first, then production (see infra/migrations/README.md).
 */

import mongoose from 'mongoose';
import { WalletModel } from '../../src/db/models/wallet.model';
import { ModelWalletModel } from '../../src/db/models/model-wallet.model';
import { EscrowItemModel } from '../../src/db/models/escrow-item.model';

interface Args {
  dryRun: boolean;
  unset: boolean;
}

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

// Models keyed by their collection label for reporting. Each is a mongoose
// model whose docs may be missing `tenant_id`.
const TARGETS: Array<{ label: string; model: mongoose.Model<unknown> }> = [
  { label: 'wallets', model: WalletModel as unknown as mongoose.Model<unknown> },
  { label: 'model_wallets', model: ModelWalletModel as unknown as mongoose.Model<unknown> },
  { label: 'escrow_items', model: EscrowItemModel as unknown as mongoose.Model<unknown> },
];

async function backfill(tenantId: string, args: Args): Promise<void> {
  for (const { label, model } of TARGETS) {
    if (args.unset) {
      const filter = { tenant_id: { $eq: tenantId } };
      const count = await model.countDocuments(filter);
      if (!args.dryRun) {
        await model.updateMany(filter, { $unset: { tenant_id: '' } });
      }
      console.log(
        `  ${label.padEnd(14)} unset tenant_id on ${count} doc(s)${args.dryRun ? ' (DRY RUN)' : ''}`,
      );
      continue;
    }

    // Only docs missing tenant_id — idempotent.
    const filter = { tenant_id: { $in: [null, undefined] } };
    const count = await model.countDocuments(filter);
    if (!args.dryRun) {
      await model.updateMany(filter, { $set: { tenant_id: tenantId } });
    }
    console.log(
      `  ${label.padEnd(14)} set tenant_id="${tenantId}" on ${count} doc(s)${args.dryRun ? ' (DRY RUN)' : ''}`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const uri = requireEnv('MONGODB_URI');
  const tenantId = requireEnv('RRR_PROGRAM_TENANT_ID');

  console.log(
    `migrate:wallet-tenant-id: ${args.unset ? 'UNSET (rollback)' : 'backfill'}${args.dryRun ? ' (DRY RUN)' : ''}`,
  );
  console.log(`migrate:wallet-tenant-id: MONGODB_URI host = ${maskUri(uri)}`);
  console.log(`migrate:wallet-tenant-id: program tenant_id = ${tenantId}`);

  await mongoose.connect(uri);
  try {
    await backfill(tenantId, args);
    console.log('migrate:wallet-tenant-id: done.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('migrate:wallet-tenant-id: FAILED');
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
