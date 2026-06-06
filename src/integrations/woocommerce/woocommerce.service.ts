import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { LedgerService } from '../../ledger/ledger.service';
import { LoyaltyAccountModel } from '../../db/models/loyalty-account.model';

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

const TENANT_ID = 'redroompleasures';
const POINTS_PER_DOLLAR = 1;

@Injectable()
export class WooCommerceService {
  private readonly logger = new Logger(WooCommerceService.name);

  constructor(private readonly ledger: LedgerService) {}

  calculatePointsForOrder(orderTotal: number, shippingCost: number): number {
    const eligible = Math.max(0, orderTotal - shippingCost);
    return Math.floor(eligible * POINTS_PER_DOLLAR);
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
    const points = this.calculatePointsForOrder(orderTotal, shippingCost);

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
    const points = this.calculatePointsForOrder(orderTotal, shippingCost);

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
    const existing = await LoyaltyAccountModel.findOne({
      tenant_id: { $eq: TENANT_ID },
      user_id: { $eq: userId },
    })
      .lean()
      .exec();

    if (existing) {
      return existing.account_id;
    }

    const memberId = `rr-wc-${randomUUID()}`;
    await LoyaltyAccountModel.create({
      account_id: memberId,
      tenant_id: TENANT_ID,
      user_id: userId,
      status: 'active',
      rrr_member_tier: null,
      enrolled_at: new Date(),
      default_currency: 'CAD',
      notes: `Auto-created from WooCommerce order (email: ${email})`,
    });

    this.logger.log({ memberId, email: '[redacted]' }, 'WooCommerce member auto-created');
    return memberId;
  }
}
