#!/usr/bin/env ts-node
/**
 * Reconcile CLI — runnable wrapper around ReconciliationService.
 *
 * Verifies that an account's ledger is internally consistent:
 *
 *   Wallet.balance == sum(LedgerEntry.delta) == calculatedBalance
 *
 * When a mismatch is detected, prints the report and exits 1 (so cron /
 * ops scripts can detect failure). NEVER auto-corrects balances — the
 * ledger is append-only and any divergence requires a documented
 * compensating entry per docs/OPERATIONAL_RUNBOOK.md §3.
 *
 * Usage:
 *   npm run reconcile -- --tenant-id=<id> --user-id=<id>
 *   npm run reconcile -- --tenant-id=<id> --model-id=<id>
 *   npm run reconcile -- --tenant-id=<id> --user-id=<id> --json
 *
 * Exit codes:
 *   0 — balanced (or no entries to reconcile)
 *   1 — mismatch detected (RECON_MISMATCH; surface for human review)
 *   2 — invocation / connection failure
 */

import mongoose from 'mongoose';
import { ReconciliationService } from '../src/services/reconciliation.service';
import { LedgerService } from '../src/ledger/ledger.service';

interface Args {
  tenantId: string;
  userId?: string;
  modelId?: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const eq = argv.find((a) => a.startsWith(`${flag}=`));
    if (eq) return eq.slice(flag.length + 1);
    const idx = argv.indexOf(flag);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    return undefined;
  };
  const tenantId = get('--tenant-id');
  if (!tenantId) {
    throw new Error('--tenant-id is required');
  }
  const userId = get('--user-id');
  const modelId = get('--model-id');
  if ((userId && modelId) || (!userId && !modelId)) {
    throw new Error('exactly one of --user-id or --model-id must be supplied');
  }
  return {
    tenantId,
    userId,
    modelId,
    json: argv.includes('--json'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const ledger = new LedgerService();
    const recon = new ReconciliationService(ledger);

    const result = args.userId
      ? await recon.reconcileUser(args.userId, args.tenantId)
      : await recon.reconcileModel(args.modelId!, args.tenantId);

    const accountKind = args.userId ? 'user' : 'model';
    const accountId = args.userId ?? args.modelId!;

    if (args.json) {
      // Structured output for piping into alerting / scripts.
      console.log(
        JSON.stringify({
          balanced: result.balanced,
          tenant_id: args.tenantId,
          account_kind: accountKind,
          account_id: accountId,
          calculated_balance: result.details.calculatedBalance,
          actual_balance: result.details.actualBalance,
          difference: result.details.difference,
          reported_at: result.details.reportedAt.toISOString(),
        }),
      );
    } else {
      // Human-readable.
      const status = result.balanced ? 'BALANCED' : 'MISMATCH';
      console.log(`reconcile: ${status}`);
      console.log(`  tenant_id          ${args.tenantId}`);
      console.log(`  ${accountKind.padEnd(18)} ${accountId}`);
      console.log(`  calculated_balance ${result.details.calculatedBalance}`);
      console.log(`  actual_balance     ${result.details.actualBalance}`);
      console.log(`  difference         ${result.details.difference}`);
      console.log(`  reported_at        ${result.details.reportedAt.toISOString()}`);
      if (!result.balanced) {
        console.log('');
        console.log('Mismatch surfaced. NEXT STEP: docs/OPERATIONAL_RUNBOOK.md §3.');
        console.log('Do not directly mutate Wallet.balance. Author a compensating');
        console.log('ledger entry via POST /admin/adjustments with reason_code: REVERSAL.');
      }
    }

    process.exitCode = result.balanced ? 0 : 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('reconcile: FAILED');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
