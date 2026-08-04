import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { LedgerService } from '../../ledger/ledger.service';
import { LoyaltyAccountModel } from '../../db/models/loyalty-account.model';
import { EarnRateConfigModel } from '../../db/models/earn-rate-config.model';

export interface WooCommerceOrderPayload {
  id: number;
  number: string;
  status: string;
  total: string;
  shipping_total: string;
  billing: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
  meta_data?: Array<{ key: string; value: string }>;
}

export interface WooCommerceWebhookPayload {
  event: string;
  order: WooCommerceOrderPayload;
}

/**
 * Event class used to look up the active earn-rate config for WooCommerce
 * purchases. This is a category label, not a rate — the numeric rate always
 * comes from EarnRateConfig.
 */
const WOOCOMMERCE_EVENT_CLASS = 'PURCHASE';

/**
 * Deployment binding for a WooCommerce storefront → RRR tenant/merchant.
 *
 * RedRoomRewards is the arm's-length loyalty PROVIDER; which tenant a given
 * WooCommerce store maps to is deployment configuration, never a hard-coded
 * constant in provider code. One WooCommerce webhook secret = one store =
 * one tenant, so the binding is resolved from the integration's environment.
 */
export interface WooCommerceConfig {
  /** Tenant this WooCommerce store belongs to. */
  tenantId: string;
  /** Merchant within the tenant. Defaults to the tenant when unset. */
  merchantId: string;
}

/**
 * Resolve the WooCommerce → RRR binding from the environment.
 * `WOOCOMMERCE_MERCHANT_ID` defaults to `WOOCOMMERCE_TENANT_ID` when unset.
 * Missing values yield empty strings — callers treat an empty tenant as
 * "integration not configured" and fail closed.
 */
export function loadWooCommerceConfig(env: NodeJS.ProcessEnv = process.env): WooCommerceConfig {
  const tenantId = (env.WOOCOMMERCE_TENANT_ID ?? '').trim();
  const merchantId = (env.WOOCOMMERCE_MERCHANT_ID ?? '').trim() || tenantId;
  return { tenantId, merchantId };
}

@Injectable()
export class WooCommerceService {
  private readonly logger = new Logger(WooCommerceService.name);
  private readonly config: WooCommerceConfig;

  constructor(
    private readonly ledger: LedgerService,
    config: WooCommerceConfig = loadWooCommerceConfig(),
  ) {
    this.config = config;
  }

  /**
   * Points for an order = floor(eligible spend * pointsPerUnit), where eligible
   * spend excludes shipping. The rate is supplied by the caller (resolved from
   * EarnRateConfig) — no rate literal lives in this integration.
   */
  calculatePointsForOrder(orderTotal: number, shippingCost: number, pointsPerUnit: number): number {
    const eligible = Math.max(0, orderTotal - shippingCost);
    return Math.floor(eligible * pointsPerUnit);
  }

  /**
   * Resolve the active earn rate (points per eligible unit) for the configured
   * tenant/merchant from EarnRateConfig: `base_points_per_unit *
   * inferno_multiplier` of the newest non-superseded PURCHASE config.
   *
   * Fail-closed: throws when the integration is unconfigured or no active
   * config exists, so we never issue points at a guessed rate. Family/merchant
   * pricing lives in EarnRateConfig (the contract/config layer), never here.
   */
  private async resolveEarnRate(): Promise<number> {
    if (!this.config.tenantId) {
      throw new Error('WooCommerce integration has no WOOCOMMERCE_TENANT_ID configured');
    }

    const rateConfig = await EarnRateConfigModel.findOne({
      tenant_id: { $eq: this.config.tenantId },
      merchant_id: { $eq: this.config.merchantId },
      event_class: { $eq: WOOCOMMERCE_EVENT_CLASS },
      superseded_at: null,
    })
      .sort({ effective_at: -1 })
      .lean()
      .exec();

    if (!rateConfig) {
      throw new Error(
        `No active earn-rate config for tenant=${this.config.tenantId} ` +
          `merchant=${this.config.merchantId} event=${WOOCOMMERCE_EVENT_CLASS}`,
      );
    }

    return rateConfig.base_points_per_unit * rateConfig.inferno_multiplier;
  }

  async processOrderCompleted(payload: WooCommerceOrderPayload): Promise<void> {
    const email = payload.billing?.email;
    if (!email) {
      this.logger.warn(
        { orderId: payload.id },
        'WooCommerce order missing billing email — skipped',
      );
      return;
    }

    const orderTotal = parseFloat(payload.total ?? '0');
    const shippingCost = parseFloat(payload.shipping_total ?? '0');
    if (!Number.isFinite(orderTotal) || !Number.isFinite(shippingCost)) {
      this.logger.warn(
        { orderId: payload.id },
        'WooCommerce order has non-finite totals — skipped',
      );
      return;
    }

    const pointsPerUnit = await this.resolveEarnRate();
    const points = this.calculatePointsForOrder(orderTotal, shippingCost, pointsPerUnit);

    if (points <= 0) {
      this.logger.log({ orderId: payload.id }, 'Zero points calculated — skipped');
      return;
    }

    const memberId = await this.findOrCreateMember(email);
    const correlationId = randomUUID();

    await this.ledger.creditPoints(
      memberId,
      points,
      'WOOCOMMERCE_ORDER',
      `WooCommerce order #${payload.number} — earn ${points} pts`,
      `wc-order-${payload.id}`,
    );

    this.logger.log(
      { memberId, orderId: payload.id, points, correlationId },
      'WooCommerce earn credited',
    );
  }

  async processOrderRefunded(payload: WooCommerceOrderPayload): Promise<void> {
    const email = payload.billing?.email;
    if (!email) {
      this.logger.warn(
        { orderId: payload.id },
        'WooCommerce refund missing billing email — skipped',
      );
      return;
    }

    const orderTotal = parseFloat(payload.total ?? '0');
    const shippingCost = parseFloat(payload.shipping_total ?? '0');
    if (!Number.isFinite(orderTotal) || !Number.isFinite(shippingCost)) {
      this.logger.warn(
        { orderId: payload.id },
        'WooCommerce refund has non-finite totals — skipped',
      );
      return;
    }

    const pointsPerUnit = await this.resolveEarnRate();
    const points = this.calculatePointsForOrder(orderTotal, shippingCost, pointsPerUnit);

    if (points <= 0) {
      return;
    }

    const memberId = await this.findOrCreateMember(email);
    const correlationId = randomUUID();

    await this.ledger.deductPoints(
      memberId,
      points,
      'WOOCOMMERCE_REFUND',
      `WooCommerce refund #${payload.number} — reverse ${points} pts`,
      `wc-refund-${payload.id}`,
    );

    this.logger.log(
      { memberId, orderId: payload.id, points, correlationId },
      'WooCommerce earn reversed (refund debit appended)',
    );
  }

  private emailToUserId(email: string): string {
    return `wc-${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)}`;
  }

  private async findOrCreateMember(email: string): Promise<string> {
    const userId = this.emailToUserId(email);
    const tenantId = this.config.tenantId;

    // Use findOneAndUpdate upsert to prevent race conditions under concurrent webhooks.
    // setOnInsert ensures account_id is only written on creation, not on every webhook.
    const memberId = `rr-wc-${randomUUID()}`;
    const result = await LoyaltyAccountModel.findOneAndUpdate(
      { tenant_id: { $eq: tenantId }, user_id: { $eq: userId } },
      {
        $setOnInsert: {
          account_id: memberId,
          tenant_id: tenantId,
          user_id: userId,
          status: 'active',
          enrolled_at: new Date(),
          default_currency: 'CAD',
          notes: 'Auto-created from WooCommerce order',
        },
      },
      { upsert: true, new: false },
    )
      .lean()
      .exec();

    if (result) {
      return result.account_id;
    }

    // result is null when the document was just inserted (upsert, new:false)
    this.logger.log({ memberId }, 'WooCommerce member auto-created');
    return memberId;
  }
}
