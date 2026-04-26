import { Injectable } from '@nestjs/common';
import { WhiteLabelConfig } from '../interfaces/redroom-rewards';

/**
 * WhiteLabelService — WO-013 final polish.
 *
 * Manages white-label configuration per merchant.
 * Service-bureau mode is the default (spec docs/ASSUMPTIONS.md F-013).
 *
 * Required fields: merchantId, brandName, primaryColor.
 * Optional: logoUrl.
 *
 * NOTE: PoC uses an in-memory Map.
 * Production replaces with a MongoDB-backed config collection.
 */
@Injectable()
export class WhiteLabelService {
  private readonly configs = new Map<string, WhiteLabelConfig>();

  async getConfig(merchantId: string): Promise<WhiteLabelConfig> {
    return (
      this.configs.get(merchantId) ?? {
        merchantId,
        brandName: 'Default Merchant',
        primaryColor: '#4c1d95',
        serviceBureauMode: true,
      }
    );
  }

  async saveConfig(config: WhiteLabelConfig): Promise<void> {
    if (!config.merchantId) {
      throw new Error('merchantId is required');
    }
    if (!config.brandName || !config.brandName.trim()) {
      throw new Error('brandName is required');
    }
    if (!config.primaryColor || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(config.primaryColor)) {
      throw new Error('primaryColor must be a valid hex colour (e.g. #4c1d95)');
    }

    this.configs.set(config.merchantId, config);
  }
}
