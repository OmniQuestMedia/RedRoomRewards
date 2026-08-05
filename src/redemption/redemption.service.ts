/**
 * Redemption Service — Screen 06
 *
 * Handles member point redemptions applied to qualifying merchant orders.
 * Implements the escrow-based state machine:
 *   Validation → Pending (escrow held) → Settled / Partial / Refunded
 *
 * API bindings:
 *   POST /redemptions  (idempotent, idempotency_key required)
 *   GET  /redemptions/eligible (tier cap check)
 *
 * Error codes raised:
 *   TIER_CAP_EXCEEDED      — redemptionAmount > (cap_pct / 100) * eligibleMerchandiseValue
 *   TIER_MIN_NOT_MET       — redemptionAmount < (floor_pct / 100) * eligibleMerchandiseValue
 *   INSUFFICIENT_BALANCE   — availableBalance < redemptionAmount
 *   IDEMPOTENCY_REPLAY     — returned on duplicate idempotency_key (cached result)
 *
 * @module redemption/redemption.service
 */

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { LedgerService } from '../ledger/ledger.service';
import { WalletModel } from '../db/models/wallet.model';
import { EscrowItemModel } from '../db/models/escrow-item.model';
import { TierCapConfigModel } from '../db/models/tier-cap-config.model';
import { RedRoomTier } from '../interfaces/redroom-rewards';
import { TransactionType, TransactionReason } from '../wallets/types';
import { resolveTenantId } from '../config/program-tenant';

/** Member's RRR Standing tier drives the redemption band. */
type TierName = RedRoomTier;

/** Allowed reason codes for Screen 07 that may appear as escrow annotations */
export const MERCHANT_REDEMPTION_FEATURE_TYPE = 'merchant_order' as const;

/** Default escrow hold duration in hours before the escrow auto-expires (v2 stub) */
const ESCROW_HOLD_HOURS = 72;

// ── Request / Response shapes ──────────────────────────────────────────────

export interface CreateRedemptionRequest {
  /** Member placing the redemption */
  userId: string;
  /** Merchant whose order is being paid */
  merchantId: string;
  /** Tenant owning this merchant */
  tenantId: string;
  /** Merchant-side order reference (used as queueItemId / idempotency anchor) */
  orderId: string;
  /**
   * Merchandise-eligible order value in the merchant's unit — the merchandise
   * subtotal ONLY, already excluding taxes / shipping / handling /
   * customs-import-excise charges (points may not be redeemed against those).
   * The tier redemption band is applied to this value.
   */
  eligibleMerchandiseValue: number;
  /** RRR points the member wants to apply */
  redemptionAmount: number;
  /** Caller-supplied idempotency key (required) */
  idempotencyKey: string;
  /** Tracing ID */
  requestId: string;
  /** Member's current RRR Standing tier (DESIRE | PASSION | OBSESSION | REIGN) */
  tierName: TierName;
}

export interface CreateRedemptionResponse {
  redemptionId: string;
  escrowId: string;
  userId: string;
  orderId: string;
  redemptionAmount: number;
  newAvailableBalance: number;
  escrowBalance: number;
  /** ISO-8601 timestamp when the escrow hold will expire (informational) */
  escrowExpiry: string;
  status: 'pending';
}

export interface GetEligibleRequest {
  userId: string;
  merchantId: string;
  tenantId: string;
  /**
   * Merchandise-eligible order value (subtotal excluding taxes / shipping /
   * handling / customs-import-excise) that the redemption band is applied to.
   */
  eligibleMerchandiseValue: number;
  tierName: TierName;
}

export interface GetEligibleResponse {
  eligible: boolean;
  availableBalance: number;
  tierName: string;
  tierFloorPct: number;
  tierCapPct: number;
  /** Minimum points redeemable (the floor of the band, subject to balance). */
  minRedeemableAmount: number;
  maxRedeemableAmount: number;
  /** Informational copy slot: "{tierFloorPct}%–{tierCapPct}% of merchandise". */
  tierBandLabel: string;
}

// ── Error classes ──────────────────────────────────────────────────────────

export class TierCapExceededError extends Error {
  public readonly code = 'TIER_CAP_EXCEEDED';
  constructor(
    public readonly allowed: number,
    public readonly requested: number,
    public readonly capPct: number,
  ) {
    super(`Redemption amount ${requested} exceeds tier cap of ${capPct}% (max ${allowed})`);
    this.name = 'TierCapExceededError';
  }
}

export class TierMinNotMetError extends Error {
  public readonly code = 'TIER_MIN_NOT_MET';
  constructor(
    public readonly minRequired: number,
    public readonly requested: number,
    public readonly floorPct: number,
  ) {
    super(
      `Redemption amount ${requested} is below the ${floorPct}% tier floor (min ${minRequired})`,
    );
    this.name = 'TierMinNotMetError';
  }
}

export class InsufficientBalanceError extends Error {
  public readonly code = 'INSUFFICIENT_BALANCE';
  constructor(
    public readonly available: number,
    public readonly required: number,
  ) {
    super(`Insufficient balance: required ${required}, available ${available}`);
    this.name = 'InsufficientBalanceError';
  }
}

export class NoCapConfigError extends Error {
  constructor(tenantId: string, tierName: string) {
    super(`No active tier cap config for tenant=${tenantId} tier=${tierName}`);
    this.name = 'NoCapConfigError';
  }
}

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class RedemptionService {
  constructor(private readonly ledgerService: LedgerService) {}

  /**
   * POST /redemptions
   *
   * Validates tier cap and available balance, then moves `redemptionAmount`
   * points from the member's available balance into escrow, tied to the
   * merchant order (`orderId`). Returns the escrow details needed by the UI.
   *
   * Idempotent on `idempotencyKey` — callers receive the same response on
   * replay without creating a second ledger entry (IDEMPOTENCY_REPLAY).
   */
  async createRedemption(request: CreateRedemptionRequest): Promise<CreateRedemptionResponse> {
    // 1. Check idempotency — reuse LedgerService's lightweight mechanism
    const claimed = await this.ledgerService.claimIdempotency(
      request.idempotencyKey,
      'merchant_redemption',
    );
    if (!claimed) {
      // Duplicate request — retrieve existing escrow record for this key
      const existing = await EscrowItemModel.findOne({
        'metadata.idempotencyKey': { $eq: request.idempotencyKey },
      }).lean();
      if (existing) {
        const wallet = await WalletModel.findOne({
          tenant_id: { $eq: resolveTenantId(request.tenantId) },
          userId: { $eq: request.userId },
        }).lean();
        return {
          redemptionId: (existing as { escrowId: string }).escrowId,
          escrowId: (existing as { escrowId: string }).escrowId,
          userId: request.userId,
          orderId: request.orderId,
          redemptionAmount: (existing as { amount: number }).amount,
          newAvailableBalance: wallet?.availableBalance ?? 0,
          escrowBalance: wallet?.escrowBalance ?? 0,
          escrowExpiry: this.escrowExpiry(),
          status: 'pending',
        };
      }
    }

    // 2. Validate tier redemption band (floor + cap) against merchandise value
    await this.validateTierCap(
      request.tenantId,
      request.tierName,
      request.eligibleMerchandiseValue,
      request.redemptionAmount,
    );

    // 3. Read wallet and validate available balance
    const tenantId = resolveTenantId(request.tenantId);
    const wallet = await WalletModel.findOne({
      tenant_id: { $eq: tenantId },
      userId: { $eq: request.userId },
    });
    if (!wallet) {
      throw new Error(`Wallet not found for userId=${request.userId}`);
    }
    if (wallet.availableBalance < request.redemptionAmount) {
      throw new InsufficientBalanceError(wallet.availableBalance, request.redemptionAmount);
    }

    const previousAvailable = wallet.availableBalance;
    const previousEscrow = wallet.escrowBalance;
    const currentVersion = wallet.version;

    // 4. Atomically update wallet balances with optimistic locking
    const updated = await WalletModel.findOneAndUpdate(
      {
        tenant_id: { $eq: tenantId },
        userId: { $eq: request.userId },
        version: { $eq: currentVersion },
      },
      {
        $inc: {
          availableBalance: -request.redemptionAmount,
          escrowBalance: request.redemptionAmount,
          version: 1,
        },
      },
      { new: true },
    );
    if (!updated) {
      // Optimistic lock conflict — retry once
      return this.createRedemption(request);
    }

    // 5. Create escrow item record
    const escrowId = uuidv4();
    const redemptionId = uuidv4();
    await EscrowItemModel.create({
      escrowId,
      tenant_id: tenantId,
      userId: request.userId,
      amount: request.redemptionAmount,
      status: 'held',
      queueItemId: request.orderId,
      featureType: MERCHANT_REDEMPTION_FEATURE_TYPE,
      reason: TransactionReason.MERCHANT_ORDER_REDEMPTION,
      metadata: {
        redemptionId,
        merchantId: request.merchantId,
        tenantId: request.tenantId,
        eligibleMerchandiseValue: request.eligibleMerchandiseValue,
        tierName: request.tierName,
        idempotencyKey: request.idempotencyKey,
        requestId: request.requestId,
      },
    });

    // 6. Write immutable ledger entry
    const correlationId = redemptionId;
    await this.ledgerService.createEntry({
      transactionId: redemptionId,
      accountId: request.userId,
      accountType: 'user',
      amount: -request.redemptionAmount,
      type: TransactionType.DEBIT,
      balanceState: 'escrow',
      stateTransition: 'available→escrow',
      reason: TransactionReason.MERCHANT_ORDER_REDEMPTION,
      idempotencyKey: request.idempotencyKey,
      requestId: request.requestId,
      balanceBefore: previousAvailable,
      balanceAfter: previousAvailable - request.redemptionAmount,
      correlationId,
      escrowId,
      queueItemId: request.orderId,
      featureType: MERCHANT_REDEMPTION_FEATURE_TYPE,
      metadata: {
        merchantId: request.merchantId,
        tenantId: request.tenantId,
        orderId: request.orderId,
        tierName: request.tierName,
      },
    });

    return {
      redemptionId,
      escrowId,
      userId: request.userId,
      orderId: request.orderId,
      redemptionAmount: request.redemptionAmount,
      newAvailableBalance: previousAvailable - request.redemptionAmount,
      escrowBalance: previousEscrow + request.redemptionAmount,
      escrowExpiry: this.escrowExpiry(),
      status: 'pending',
    };
  }

  /**
   * GET /redemptions/eligible
   *
   * Returns the member's current available balance alongside the tier cap for
   * this merchant, so the client can render the slider constraints and copy
   * slots ("X% max redemption").
   */
  async getEligible(request: GetEligibleRequest): Promise<GetEligibleResponse> {
    const wallet = await WalletModel.findOne({ userId: { $eq: request.userId } }).lean();
    const availableBalance = wallet?.availableBalance ?? 0;

    const capConfig = await TierCapConfigModel.findOne({
      tenant_id: { $eq: request.tenantId },
      tier: { $eq: request.tierName },
      superseded_at: null,
    })
      .sort({ effective_at: -1 })
      .lean();

    if (!capConfig) {
      throw new NoCapConfigError(request.tenantId, request.tierName);
    }

    const tierFloorPct = capConfig.redemption_floor_pct;
    const tierCapPct = capConfig.redemption_cap_pct;
    const maxFromCap = Math.floor((tierCapPct / 100) * request.eligibleMerchandiseValue);
    const minRequired = Math.ceil((tierFloorPct / 100) * request.eligibleMerchandiseValue);
    const maxRedeemableAmount = Math.min(maxFromCap, availableBalance);
    // Eligible only when the balance can cover the floor AND the tier cap is at
    // least the floor (tiny merchandise values can round the cap below the floor).
    const eligible =
      minRequired > 0 && maxFromCap >= minRequired && availableBalance >= minRequired;

    return {
      eligible,
      availableBalance,
      tierName: request.tierName,
      tierFloorPct,
      tierCapPct,
      minRedeemableAmount: minRequired,
      maxRedeemableAmount,
      tierBandLabel: `${tierFloorPct}%–${tierCapPct}% of merchandise`,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async validateTierCap(
    tenantId: string,
    tierName: TierName,
    eligibleMerchandiseValue: number,
    redemptionAmount: number,
  ): Promise<void> {
    const capConfig = await TierCapConfigModel.findOne({
      tenant_id: { $eq: tenantId },
      tier: { $eq: tierName },
      superseded_at: null,
    })
      .sort({ effective_at: -1 })
      .lean();

    if (!capConfig) {
      throw new NoCapConfigError(tenantId, tierName);
    }

    const maxAllowed = Math.floor((capConfig.redemption_cap_pct / 100) * eligibleMerchandiseValue);
    const minRequired = Math.ceil(
      (capConfig.redemption_floor_pct / 100) * eligibleMerchandiseValue,
    );

    if (redemptionAmount > maxAllowed) {
      throw new TierCapExceededError(maxAllowed, redemptionAmount, capConfig.redemption_cap_pct);
    }
    if (redemptionAmount < minRequired) {
      throw new TierMinNotMetError(minRequired, redemptionAmount, capConfig.redemption_floor_pct);
    }
  }

  /** ISO-8601 timestamp ESCROW_HOLD_HOURS hours from now */
  private escrowExpiry(): string {
    const expiry = new Date(Date.now() + ESCROW_HOLD_HOURS * 60 * 60 * 1000);
    return expiry.toISOString();
  }
}
