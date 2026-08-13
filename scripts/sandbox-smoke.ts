#!/usr/bin/env tsx
/**
 * Sandbox smoke test — proves the promotions layer works against a REAL
 * database, end to end, in one command.
 *
 * The unit suite mocks every Mongoose model, so it proves the logic and nothing
 * about the wiring. This script proves the wiring: that the service connects,
 * that a campaign can be authored and activated, that an unproven member gets
 * the base multiplier while a member with real attributed spend gets the uplift,
 * that a replay does not double-credit, that each movement lands in the ledger
 * under its own reason code, and that the liability report reflects all of it.
 *
 * It is the first thing to run after standing up a closed sandbox. If this
 * passes, a frontend can be wired with confidence; if it fails, the frontend
 * would only have surfaced the same failure later and less legibly.
 *
 * Requires a REPLICA SET (see docker-compose.yml) — on a standalone Mongo the
 * ledger's transaction path silently degrades and this test would be checking
 * weaker behaviour than production runs.
 *
 * Refuses to run against a non-local database: it writes append-only ledger
 * rows, which have no delete path.
 *
 * Usage:
 *   docker compose up -d
 *   npm run sandbox:smoke
 */

import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { connectDatabase, disconnectDatabase } from '../src/db/connection';
import { LedgerService } from '../src/ledger/ledger.service';
import { LedgerEntryModel } from '../src/db/models/ledger-entry.model';
import { MemberContributionService } from '../src/promotions/member-contribution.service';
import { PromotionEligibilityService } from '../src/promotions/promotion-eligibility.service';
import { PromotionCampaignService } from '../src/promotions/promotion-campaign.service';
import { PromotionEngineService } from '../src/promotions/promotion-engine.service';
import { PromotionLiabilityService } from '../src/promotions/promotion-liability.service';
import { GateGuardAVService } from '../src/services/gateguard-av.service';
import { WelfareGuardianScoreService } from '../src/services/welfare-guardian-score.service';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`,
  );
}

function assertLocal(uri: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('sandbox-smoke: refusing to run with NODE_ENV=production.');
  }
  if (!/(^|@|\/\/)(localhost|127\.0\.0\.1|mongo)(:|\/)/.test(uri)) {
    throw new Error(
      'sandbox-smoke: MONGODB_URI does not look local. This writes append-only ledger rows ' +
        'and must never touch a shared or production database.',
    );
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
  if (!uri) throw new Error('sandbox-smoke: MONGODB_URI is required.');
  assertLocal(uri);

  const tenantId = process.env.PROGRAM_TENANT_ID || 'redroompleasures';
  // Unique run id keeps repeat runs independent — idempotency keys and member
  // ids must not collide with a previous run's append-only rows.
  const run = randomUUID().slice(0, 8);
  const newMember = `smoke-new-${run}`;
  const provenMember = `smoke-proven-${run}`;

  await connectDatabase({ uri });
  console.log(`\nConnected. readyState=${mongoose.connection.readyState} (1 = connected)`);

  const isReplicaSet = await mongoose.connection
    .db!.admin()
    .command({ hello: 1 })
    .then((r: Record<string, unknown>) => Boolean(r.setName))
    .catch(() => false);
  console.log(
    isReplicaSet
      ? '  Replica set detected — ledger transactions will be exercised.'
      : '  WARNING: standalone Mongo. Ledger transactions degrade to no-session; ' +
          'this run tests weaker behaviour than production. Use docker-compose.yml.',
  );

  const ledger = new LedgerService();
  const contribution = new MemberContributionService();
  const eligibility = new PromotionEligibilityService(
    new GateGuardAVService(),
    new WelfareGuardianScoreService(),
    contribution,
  );
  const campaigns = new PromotionCampaignService();
  const engine = new PromotionEngineService(ledger, eligibility);
  const liability = new PromotionLiabilityService();

  console.log('\n1. Author + activate a double-points campaign with a margin ladder');
  const campaign = await campaigns.createCampaign({
    tenant_id: tenantId,
    campaign_type: 'PURCHASE_MULTIPLIER',
    name: `Smoke Double Points ${run}`,
    description: '2x points, 3x for proven members',
    starts_at: new Date(Date.now() - 3_600_000),
    ends_at: new Date(Date.now() + 86_400_000),
    multiplier_terms: {
      multiplier: 2,
      band_multipliers: { NET_POSITIVE: 2.5, HIGH_MARGIN: 3 },
      merchant_id: null,
      event_class: null,
    },
    per_member_points_cap: 5_000,
    campaign_points_budget: 500_000,
    reason_code: 'SANDBOX_SMOKE',
    created_by: 'sandbox-smoke',
  });
  check('campaign opens as DRAFT', campaign.status, 'DRAFT');
  const active = await campaigns.setStatus(campaign.campaign_id, tenantId, 'ACTIVE');
  check('campaign activates', active.status, 'ACTIVE');

  console.log('\n2. Unproven member gets the advertised base multiplier, no uplift');
  const r1 = await engine.applyPurchaseBonus({
    tenantId,
    memberId: newMember,
    basePoints: 100,
    spendCents: 10_000,
    merchantId: 'rrp',
    purchaseReference: `smoke-order-a-${run}`,
    idempotencyKey: `smoke-a-${run}`,
  });
  check('band is UNPROVEN', r1.contributionBand, 'UNPROVEN');
  check('bonus is base 2x (100)', r1.bonusPoints, 100);
  check('no uplift applied', r1.campaigns[0]?.upliftApplied, false);

  console.log('\n3. Build real attributed spend history (4 x £100 with spend_cents)');
  for (let i = 0; i < 4; i++) {
    await ledger.creditPoints(
      provenMember,
      100,
      'WOOCOMMERCE_ORDER',
      'smoke seed order',
      `smoke-seed-${run}-${i}`,
      undefined,
      undefined,
      { spend_cents: 10_000 },
    );
  }
  const profile = await contribution.getProfile(tenantId, provenMember);
  check('spend is attributed', profile.attributed_spend_cents, 40_000);
  check('attribution coverage is total', profile.attribution_coverage, 1);
  check('band is HIGH_MARGIN', profile.band, 'HIGH_MARGIN');

  console.log('\n4. Proven member gets the uplifted multiplier');
  const r2 = await engine.applyPurchaseBonus({
    tenantId,
    memberId: provenMember,
    basePoints: 100,
    spendCents: 10_000,
    merchantId: 'rrp',
    purchaseReference: `smoke-order-b-${run}`,
    idempotencyKey: `smoke-b-${run}`,
  });
  check('multiplier stepped to 3x', r2.campaigns[0]?.multiplierApplied, 3);
  check('uplift applied', r2.campaigns[0]?.upliftApplied, true);
  check('bonus is 200', r2.bonusPoints, 200);

  console.log('\n5. Replay of the same purchase does not double-credit');
  const r3 = await engine.applyPurchaseBonus({
    tenantId,
    memberId: provenMember,
    basePoints: 100,
    spendCents: 10_000,
    merchantId: 'rrp',
    purchaseReference: `smoke-order-b-${run}`,
    idempotencyKey: `smoke-b-${run}`,
  });
  check('replay grants nothing', r3.bonusPoints, 0);

  console.log('\n6. Ledger carries the promotion-specific reason code');
  const rows = await LedgerEntryModel.find({ accountId: { $eq: provenMember } })
    .lean()
    .exec();
  const bonusRows = rows.filter((r) => String(r.reason) === 'promotion_multiplier_bonus');
  check('exactly one multiplier-bonus entry', bonusRows.length, 1);
  check('entry amount matches the grant', bonusRows[0]?.amount, 200);

  console.log('\n7. Liability report reflects the grants');
  const report = await liability.getReport(tenantId);
  const row = report.campaigns.find((c) => c.campaign_id === campaign.campaign_id);
  check('campaign granted 300 points total', row?.points_granted, 300);
  check('one grant was uplifted', row?.uplifted_grants, 1);

  await disconnectDatabase();

  console.log(
    failures === 0
      ? '\nSANDBOX SMOKE: PASS — promotions layer is wired correctly end to end.\n'
      : `\nSANDBOX SMOKE: FAIL — ${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('\nSANDBOX SMOKE: ERROR —', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
