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
import { TierEngineService } from '../services/tier-engine.service';
import { WalletModel } from '../db/models/wallet.model';
import { EscrowItemModel } from '../db/models/escrow-item.model';
import { TierCapConfigModel } from '../db/models/tier-cap-config.model';
import { ValuationConfigModel } from '../db/models/valuation-config.model';
import { RedRoomTier } from '../interfaces/redroom-rewards';
import { TransactionType, TransactionReason } from '../wallets/types';
import { resolveTenantId } from '../config/program-tenant';

/** Member's RRR Standing tier drives the redemption band. */
type TierName = RedRoomTier;

/**
 * Canonical points↔cash valuation fallback (Canon: 1000 pts = $1.00 ⇒ 0.1
 * cents per point) used when no active ValuationConfig exists for the tenant.
 */
const DEFAULT_CENTS_PER_POINT = 0.1;

/** Reason codes for the redemption escrow lifecycle (settle / void). */
const REDEMPTION_SETTLE_REASON = TransactionReason.MERCHANT_ORDER_REDEMPTION_SETTLE;
const REDEMPTION_VOID_REASON = TransactionReason.MERCHANT_ORDER_REDEMPTION_VOID;

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
  /**
   * Member's RRR Standing tier (DESIRE | PASSION | OBSESSION | REIGN). OPTIONAL:
   * when omitted, RRR derives it from the member's lifetime earned points — the
   * secure, non-spoofable source (callers should omit it).
   */
  tierName?: TierName;
}

export interface CreateRedemptionResponse {
  redemptionId: string;
  escrowId: string;
  userId: string;
  orderId: string;
  redemptionAmount: number;
  /** Cash value of the redeemed points (minor units) via the tenant valuation. */
  cashValueCents: number;
  /** The Standing tier applied (derived server-side when the caller omitted it). */
  tierName: string;
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
   * Passed in the merchant's minor units (cents); RRR converts to the points
   * domain via the tenant valuation.
   */
  eligibleMerchandiseValue: number;
  /** OPTIONAL — omit to have RRR derive the Standing tier from the member. */
  tierName?: TierName;
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
  /** Cash value (minor units) of maxRedeemableAmount via the tenant valuation. */
  maxRedeemableCashValueCents: number;
  /** Informational copy slot: "{tierFloorPct}%–{tierCapPct}% of merchandise". */
  tierBandLabel: string;
}

/** Settle/void an existing redemption escrow (the merchant order finalized/cancelled). */
export interface ResolveRedemptionRequest {
  /** Tenant owning the merchant/escrow. */
  tenantId: string;
  /** The `escrowId` returned by createRedemption. */
  escrowId: string;
  /** Tracing id. */
  requestId?: string;
}

export interface ResolveRedemptionResponse {
  escrowId: string;
  status: 'settled' | 'refunded';
  redemptionAmount: number;
  newAvailableBalance: number;
  escrowBalance: number;
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

export class NoRedemptionError extends Error {
  public readonly code = 'NO_REDEMPTION';
  constructor(escrowId: string) {
    super(`No redemption escrow found for escrowId=${escrowId}`);
    this.name = 'NoRedemptionError';
  }
}

export class RedemptionStateError extends Error {
  public readonly code = 'REDEMPTION_STATE_CONFLICT';
  constructor(escrowId: string, currentStatus: string, action: string) {
    super(`Cannot ${action} redemption ${escrowId} in state '${currentStatus}'`);
    this.name = 'RedemptionStateError';
  }
}

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class RedemptionService {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly tierEngine: TierEngineService,
  ) {}

  /**
   * Resolve the member's RRR Standing tier. When the caller supplies a tier we
   * trust it (internal callers); otherwise we derive it server-side from the
   * member's lifetime earned points (the secure, non-spoofable path — Decision 1).
   */
  private async resolveMemberTier(userId: string, provided?: TierName): Promise<RedRoomTier> {
    if (provided) {
      return provided;
    }
    const lifetimePoints = await this.ledgerService.getLifetimeEarnedPoints(userId);
    return this.tierEngine.calculateTier(lifetimePoints).currentTier;
  }

  /**
   * Resolve the active points→cash valuation (cents per point) for the tenant.
   * Falls back to the canonical 1000 pts = $1 (0.1 ¢/pt) when unconfigured.
   */
  private async resolveCentsPerPoint(tenantId: string): Promise<number> {
    const cfg = await ValuationConfigModel.findOne({
      tenant_id: { $eq: tenantId },
      point_type: { $eq: 'purchase' },
      superseded_at: null,
    })
      .sort({ effective_at: -1 })
      .lean();
    const cpp = cfg?.cents_per_point;
    return typeof cpp === 'number' && cpp > 0 ? cpp : DEFAULT_CENTS_PER_POINT;
  }

  /** Cash value (minor units) of a points amount under the tenant valuation. */
  private cashValueCents(points: number, centsPerPoint: number): number {
    return Math.floor(points * centsPerPoint);
  }

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
        const priorAmount = (existing as { amount: number }).amount;
        const priorTier =
          (existing as { metadata?: { tierName?: string } }).metadata?.tierName ?? '';
        const centsPerPoint = await this.resolveCentsPerPoint(request.tenantId);
        return {
          redemptionId: (existing as { escrowId: string }).escrowId,
          escrowId: (existing as { escrowId: string }).escrowId,
          userId: request.userId,
          orderId: request.orderId,
          redemptionAmount: priorAmount,
          cashValueCents: this.cashValueCents(priorAmount, centsPerPoint),
          tierName: priorTier,
          newAvailableBalance: wallet?.availableBalance ?? 0,
          escrowBalance: wallet?.escrowBalance ?? 0,
          escrowExpiry: this.escrowExpiry(),
          status: 'pending',
        };
      }
    }

    // 2. Resolve the member's Standing tier (server-derived when omitted) and the
    //    tenant valuation, then validate the tier band (floor + cap) in points.
    const tenantId = resolveTenantId(request.tenantId);
    const tierName = await this.resolveMemberTier(request.userId, request.tierName);
    const centsPerPoint = await this.resolveCentsPerPoint(request.tenantId);
    await this.validateTierCap(
      request.tenantId,
      tierName,
      request.eligibleMerchandiseValue,
      request.redemptionAmount,
      centsPerPoint,
    );

    // 3. Read wallet and validate available balance
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
        tierName,
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
        tierName,
      },
    });

    return {
      redemptionId,
      escrowId,
      userId: request.userId,
      orderId: request.orderId,
      redemptionAmount: request.redemptionAmount,
      cashValueCents: this.cashValueCents(request.redemptionAmount, centsPerPoint),
      tierName,
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

    const tierName = await this.resolveMemberTier(request.userId, request.tierName);
    const centsPerPoint = await this.resolveCentsPerPoint(request.tenantId);

    const capConfig = await TierCapConfigModel.findOne({
      tenant_id: { $eq: request.tenantId },
      tier: { $eq: tierName },
      superseded_at: null,
    })
      .sort({ effective_at: -1 })
      .lean();

    if (!capConfig) {
      throw new NoCapConfigError(request.tenantId, tierName);
    }

    const tierFloorPct = capConfig.redemption_floor_pct;
    const tierCapPct = capConfig.redemption_cap_pct;
    // Express the merchandise value (cash cents) in the points domain via the
    // tenant valuation, so the band caps a % of merchandise VALUE, not raw cents.
    const pointsBase = request.eligibleMerchandiseValue / centsPerPoint;
    const maxFromCap = Math.floor((tierCapPct / 100) * pointsBase);
    const minRequired = Math.ceil((tierFloorPct / 100) * pointsBase);
    const maxRedeemableAmount = Math.min(maxFromCap, availableBalance);
    // Eligible only when the balance can cover the floor AND the tier cap is at
    // least the floor (tiny merchandise values can round the cap below the floor).
    const eligible =
      minRequired > 0 && maxFromCap >= minRequired && availableBalance >= minRequired;

    return {
      eligible,
      availableBalance,
      tierName,
      tierFloorPct,
      tierCapPct,
      minRedeemableAmount: minRequired,
      maxRedeemableAmount,
      maxRedeemableCashValueCents: this.cashValueCents(maxRedeemableAmount, centsPerPoint),
      tierBandLabel: `${tierFloorPct}%–${tierCapPct}% of merchandise`,
    };
  }

  /**
   * Settle a redemption escrow — the sale is final (RRP cooling-off captured).
   * The held points are **burned**: escrow balance is reduced and the hold is
   * marked `settled`. Idempotent, optimistic-locked. (Decision 3.)
   */
  async settleRedemption(request: ResolveRedemptionRequest): Promise<ResolveRedemptionResponse> {
    return this.resolveEscrow(request, 'settle');
  }

  /**
   * Void a redemption escrow — the order was cancelled during cooling-off. The
   * held points are **released back to the member's available balance** in full
   * (no fee — Decision 4). Idempotent, optimistic-locked. (Decision 3.)
   */
  async voidRedemption(request: ResolveRedemptionRequest): Promise<ResolveRedemptionResponse> {
    return this.resolveEscrow(request, 'void');
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async validateTierCap(
    tenantId: string,
    tierName: TierName,
    eligibleMerchandiseValue: number,
    redemptionAmount: number,
    centsPerPoint: number,
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

    // Convert the merchandise value (cash cents) into the points domain so the
    // band caps a % of merchandise VALUE, not a raw cent count.
    const pointsBase = eligibleMerchandiseValue / centsPerPoint;
    const maxAllowed = Math.floor((capConfig.redemption_cap_pct / 100) * pointsBase);
    const minRequired = Math.ceil((capConfig.redemption_floor_pct / 100) * pointsBase);

    if (redemptionAmount > maxAllowed) {
      throw new TierCapExceededError(maxAllowed, redemptionAmount, capConfig.redemption_cap_pct);
    }
    if (redemptionAmount < minRequired) {
      throw new TierMinNotMetError(minRequired, redemptionAmount, capConfig.redemption_floor_pct);
    }
  }

  /**
   * Shared settle/void machinery. Atomically claims the `held` escrow (the
   * concurrency guard — only one caller may transition it), then moves the
   * wallet balances and appends the immutable ledger entry.
   */
  private async resolveEscrow(
    request: ResolveRedemptionRequest,
    action: 'settle' | 'void',
  ): Promise<ResolveRedemptionResponse> {
    const tenantId = resolveTenantId(request.tenantId);
    const targetStatus = action === 'settle' ? 'settled' : 'refunded';

    // Idempotency: an already-resolved escrow returns its current state.
    const current = await EscrowItemModel.findOne({
      tenant_id: { $eq: tenantId },
      escrowId: { $eq: request.escrowId },
      featureType: { $eq: MERCHANT_REDEMPTION_FEATURE_TYPE },
    }).lean();
    if (!current) {
      throw new NoRedemptionError(request.escrowId);
    }
    if (current.status === targetStatus) {
      const w = await WalletModel.findOne({
        tenant_id: { $eq: tenantId },
        userId: { $eq: (current as { userId: string }).userId },
      }).lean();
      return {
        escrowId: request.escrowId,
        status: targetStatus,
        redemptionAmount: (current as { amount: number }).amount,
        newAvailableBalance: w?.availableBalance ?? 0,
        escrowBalance: w?.escrowBalance ?? 0,
      };
    }

    // Atomically claim the `held` escrow — only one caller wins this transition.
    const claimed = await EscrowItemModel.findOneAndUpdate(
      {
        tenant_id: { $eq: tenantId },
        escrowId: { $eq: request.escrowId },
        featureType: { $eq: MERCHANT_REDEMPTION_FEATURE_TYPE },
        status: { $eq: 'held' },
      },
      { $set: { status: targetStatus, processedAt: new Date() } },
      { new: false },
    ).lean();
    if (!claimed) {
      // Not `held` and not already at the target ⇒ an illegal transition.
      throw new RedemptionStateError(request.escrowId, current.status, action);
    }

    const userId = (claimed as { userId: string }).userId;
    const amount = (claimed as { amount: number }).amount;
    const orderId = (claimed as { queueItemId?: string }).queueItemId;

    // Move wallet balances (optimistic-locked, escrow-covered):
    //   settle → burn from escrow;  void → release escrow back to available.
    const inc =
      action === 'settle'
        ? { escrowBalance: -amount, version: 1 }
        : { escrowBalance: -amount, availableBalance: amount, version: 1 };
    const wallet = await WalletModel.findOne({
      tenant_id: { $eq: tenantId },
      userId: { $eq: userId },
    });
    if (!wallet) {
      throw new Error(`Wallet not found for userId=${userId}`);
    }
    const prevAvailable = wallet.availableBalance;
    const prevEscrow = wallet.escrowBalance;
    const updated = await WalletModel.findOneAndUpdate(
      {
        tenant_id: { $eq: tenantId },
        userId: { $eq: userId },
        version: { $eq: wallet.version },
        escrowBalance: { $gte: amount },
      },
      { $inc: inc },
      { new: true },
    );
    if (!updated) {
      // Lost the optimistic lock — retry the whole resolution (escrow already
      // flipped, so the idempotent short-circuit above returns the settled state).
      return this.resolveEscrow(request, action);
    }

    // Append the immutable ledger entry (idempotent on the escrow-scoped key).
    if (action === 'settle') {
      await this.ledgerService.createEntry({
        transactionId: uuidv4(),
        accountId: userId,
        accountType: 'user',
        amount: -amount,
        type: TransactionType.DEBIT,
        balanceState: 'escrow',
        stateTransition: 'escrow→settled',
        reason: REDEMPTION_SETTLE_REASON,
        idempotencyKey: `settle-${request.escrowId}`,
        requestId: request.requestId ?? '',
        balanceBefore: prevEscrow,
        balanceAfter: prevEscrow - amount,
        correlationId: request.escrowId,
        escrowId: request.escrowId,
        queueItemId: orderId,
        featureType: MERCHANT_REDEMPTION_FEATURE_TYPE,
        metadata: { orderId },
      });
    } else {
      await this.ledgerService.createEntry({
        transactionId: uuidv4(),
        accountId: userId,
        accountType: 'user',
        amount,
        type: TransactionType.CREDIT,
        balanceState: 'available',
        stateTransition: 'escrow→available',
        reason: REDEMPTION_VOID_REASON,
        idempotencyKey: `void-${request.escrowId}`,
        requestId: request.requestId ?? '',
        balanceBefore: prevAvailable,
        balanceAfter: prevAvailable + amount,
        correlationId: request.escrowId,
        escrowId: request.escrowId,
        queueItemId: orderId,
        featureType: MERCHANT_REDEMPTION_FEATURE_TYPE,
        metadata: { orderId },
      });
    }

    return {
      escrowId: request.escrowId,
      status: targetStatus,
      redemptionAmount: amount,
      newAvailableBalance: updated.availableBalance,
      escrowBalance: updated.escrowBalance,
    };
  }

  /** ISO-8601 timestamp ESCROW_HOLD_HOURS hours from now */
  private escrowExpiry(): string {
    const expiry = new Date(Date.now() + ESCROW_HOLD_HOURS * 60 * 60 * 1000);
    return expiry.toISOString();
  }
}
