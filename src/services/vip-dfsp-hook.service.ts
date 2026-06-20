import { Injectable, Logger } from '@nestjs/common';

export type VipTier = 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

export interface VipUpgradeEvent {
  tenant_id: string;
  member_id: string;
  previous_tier: VipTier | null;
  new_tier: VipTier;
  correlation_id: string;
}

export interface DfspLoyaltyEvent {
  tenant_id: string;
  member_id: string;
  event_type: 'POINTS_EARNED' | 'POINTS_REDEEMED' | 'TIER_CHANGE' | 'CHARGEBACK';
  points_delta: number;
  correlation_id: string;
  metadata?: Record<string, unknown>;
}

export interface DfspNotifyResult {
  delivered: boolean;
  endpoint: string | null;
  skipped_reason: string | null;
}

@Injectable()
export class VipDfspHookService {
  private readonly logger = new Logger(VipDfspHookService.name);

  async onVipUpgrade(event: VipUpgradeEvent): Promise<void> {
    this.logger.log({
      message: 'VIP tier upgrade',
      tenant_id: event.tenant_id,
      member_id: event.member_id,
      previous_tier: event.previous_tier,
      new_tier: event.new_tier,
      correlation_id: event.correlation_id,
    });
    // TODO: wire DFSP outbound webhook
  }

  async notifyDfsp(event: DfspLoyaltyEvent): Promise<DfspNotifyResult> {
    const webhookUrl = process.env['DFSP_WEBHOOK_URL'];

    if (!webhookUrl) {
      return {
        delivered: false,
        endpoint: null,
        skipped_reason: 'DFSP_WEBHOOK_URL not configured',
      };
    }

    this.logger.log({
      message: 'DFSP notify (stub)',
      endpoint: webhookUrl,
      tenant_id: event.tenant_id,
      member_id: event.member_id,
      event_type: event.event_type,
      points_delta: event.points_delta,
      correlation_id: event.correlation_id,
    });

    return {
      delivered: false,
      endpoint: webhookUrl,
      skipped_reason: 'stub — outbound HTTP not yet wired',
    };
  }
}
