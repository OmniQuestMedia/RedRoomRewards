#!/usr/bin/env ts-node
/**
 * Seed a sandbox with one campaign of each promotion type, plus enough member
 * history to exercise the contribution bands.
 *
 * Without this, a freshly stood-up sandbox renders three empty states and tells
 * you nothing about whether the wiring works. With it, the member portal shows a
 * half-filled progress bar and a claimable offer on first load.
 *
 * Refuses to run against anything but a local database, and refuses in
 * production. Seeded rows are tagged `reason_code: SANDBOX_SEED` so they are
 * trivially identifiable and removable.
 *
 * Usage:
 *   npm run seed:promotions
 *   npm run seed:promotions -- --member sandbox-member-1
 */

import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import {
  PromotionCampaignModel,
  PromotionCampaignType,
  IMultiplierTerms,
  IProgressTerms,
  IOfferTerms,
} from '../src/db/models/promotion-campaign.model';
import { LedgerEntryModel } from '../src/db/models/ledger-entry.model';
import { WalletModel } from '../src/db/models/wallet.model';
import { TransactionType, TransactionReason } from '../src/wallets/types';

const SEED_REASON = 'SANDBOX_SEED';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Refuse anything that is not unmistakably a local sandbox. This script writes
 * ledger entries; pointing it at a real database would inject fabricated
 * financial history into an append-only store that has no delete path.
 */
function assertLocal(uri: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-promotions: refusing to run with NODE_ENV=production.');
  }
  const isLocal = /(^|@|\/\/)(localhost|127\.0\.0\.1|mongo)(:|\/)/.test(uri);
  if (!isLocal) {
    throw new Error(
      'seed-promotions: MONGODB_URI does not look local. This script writes append-only ' +
        'ledger rows and must never touch a shared or production database.',
    );
  }
}

async function seedCampaigns(tenantId: string): Promise<void> {
  const now = new Date();
  const inAMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  interface SeedCampaign {
    campaign_type: PromotionCampaignType;
    name: string;
    description: string;
    multiplier_terms: IMultiplierTerms | null;
    progress_terms: IProgressTerms | null;
    offer_terms: IOfferTerms | null;
    per_member_points_cap: number | null;
    campaign_points_budget: number | null;
  }

  const campaigns: SeedCampaign[] = [
    {
      campaign_type: 'PURCHASE_MULTIPLIER',
      name: 'Double Points Weekend',
      description: 'Earn 2× points on everything. Proven members earn more.',
      multiplier_terms: {
        multiplier: 2,
        band_multipliers: { NET_POSITIVE: 2.5, HIGH_MARGIN: 3 },
        merchant_id: null,
        event_class: null,
      },
      progress_terms: null,
      offer_terms: null,
      per_member_points_cap: 5_000,
      campaign_points_budget: 500_000,
    },
    {
      campaign_type: 'PROGRESS_BONUS',
      name: 'Spend £100, get 500 points',
      description: 'Fill the bar across as many orders as you like.',
      multiplier_terms: null,
      progress_terms: {
        metric: 'SPEND_UNITS',
        threshold: 100,
        bonus_points: 500,
        repeatable: true,
      },
      offer_terms: null,
      per_member_points_cap: 2_000,
      campaign_points_budget: 200_000,
    },
    {
      campaign_type: 'REDEMPTION_OFFER',
      name: '£10 off — 800 points',
      description: 'Put the points you already have towards your next order.',
      multiplier_terms: null,
      progress_terms: null,
      offer_terms: {
        points_price: 800,
        reward_type: 'DISCOUNT_CODE',
        reward_value: { discount_gbp: 10 },
        inventory_count: 500,
        max_per_member: 2,
      },
      per_member_points_cap: null,
      campaign_points_budget: null,
    },
  ];

  for (const c of campaigns) {
    const existing = await PromotionCampaignModel.findOne({
      tenant_id: { $eq: tenantId },
      name: { $eq: c.name },
    }).exec();

    if (existing) {
      console.log(`  = ${c.name} (already present, skipped)`);
      continue;
    }

    await PromotionCampaignModel.create({
      ...c,
      campaign_id: randomUUID(),
      tenant_id: tenantId,
      // Seeded straight to ACTIVE so the sandbox renders on first load.
      status: 'ACTIVE',
      starts_at: now,
      ends_at: inAMonth,
      points_granted_to_date: 0,
      points_burned_to_date: 0,
      offer_claims_to_date: 0,
      correlation_id: randomUUID(),
      reason_code: SEED_REASON,
      created_by: 'sandbox-seed',
      activated_at: now,
    });
    console.log(`  + ${c.name}`);
  }
}

/**
 * Give the member a purchase history that lands them in HIGH_MARGIN, so the
 * uplift ladder is actually observable in the sandbox. Four attributed
 * purchases of £100 clears the evidence floors (3 purchases, £50, 60% coverage)
 * and the margin ratio.
 */
async function seedMemberHistory(tenantId: string, memberId: string): Promise<void> {
  const existing = await LedgerEntryModel.countDocuments({
    tenant_id: { $eq: tenantId },
    accountId: { $eq: memberId },
  }).exec();

  if (existing > 0) {
    console.log(`  = history for ${memberId} (already present, skipped)`);
    return;
  }

  let balance = 0;
  for (let i = 0; i < 4; i++) {
    const points = 100;
    const before = balance;
    balance += points;

    await LedgerEntryModel.create({
      entryId: randomUUID(),
      transactionId: randomUUID(),
      tenant_id: tenantId,
      accountId: memberId,
      accountType: 'user',
      amount: points,
      type: TransactionType.CREDIT,
      balanceState: 'available',
      stateTransition: 'purchase-earn→available',
      reason: TransactionReason.PROMOTIONAL_AWARD,
      idempotencyKey: `${SEED_REASON}-${memberId}-order-${i}`,
      requestId: randomUUID(),
      balanceBefore: before,
      balanceAfter: balance,
      timestamp: new Date(Date.now() - (4 - i) * 24 * 60 * 60 * 1000),
      currency: 'points',
      correlationId: `${SEED_REASON}-order-${i}`,
      metadata: { spend_cents: 10_000, source: SEED_REASON, reason: 'sandbox purchase' },
    });
  }

  await WalletModel.findOneAndUpdate(
    { tenant_id: { $eq: tenantId }, userId: { $eq: memberId } },
    {
      $set: { availableBalance: balance, escrowBalance: 0, currency: 'points' },
      $setOnInsert: { tenant_id: tenantId, userId: memberId, version: 0 },
    },
    { upsert: true },
  ).exec();

  console.log(`  + 4 attributed purchases for ${memberId} (${balance} pts, £400 spend)`);
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
  if (!uri) {
    throw new Error('seed-promotions: MONGODB_URI is required.');
  }
  assertLocal(uri);

  const tenantId = arg('tenant', 'redroompleasures');
  const memberId = arg('member', 'sandbox-member-1');

  await mongoose.connect(uri);
  console.log(`\nSeeding tenant "${tenantId}":`);

  await seedCampaigns(tenantId);
  await seedMemberHistory(tenantId, memberId);

  console.log('\nDone. Mint a token with `npm run dev:token` and open the member portal.\n');
  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
