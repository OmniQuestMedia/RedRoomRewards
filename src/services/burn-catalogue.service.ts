import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LedgerService } from '../ledger/ledger.service';
import {
  BurnCatalogueItemModel,
  IBurnCatalogueItem,
  RedemptionType,
} from '../db/models/burn-catalogue-item.model';
import { BurnRedemptionModel, IBurnRedemption } from '../db/models/burn-redemption.model';

export interface CatalogueFilters {
  redemption_type?: RedemptionType;
  max_points_cost?: number;
}

export interface PaginatedCatalogueResult {
  items: IBurnCatalogueItem[];
  total: number;
  page: number;
  limit: number;
}

export interface RedeemItemResult {
  redemptionId: string;
  redemptionCode: string;
  pointsSpent: number;
  itemTitle: string;
}

export interface CreateCatalogueItemInput {
  tenant_id: string;
  title: string;
  description: string;
  image_url?: string;
  points_cost: number;
  inventory_count?: number | null;
  is_active?: boolean;
  valid_from?: Date | null;
  valid_until?: Date | null;
  redemption_type: RedemptionType;
  redemption_value: Record<string, unknown>;
}

export interface UpdateCatalogueItemInput {
  title?: string;
  description?: string;
  image_url?: string;
  points_cost?: number;
  inventory_count?: number | null;
  is_active?: boolean;
  valid_from?: Date | null;
  valid_until?: Date | null;
  redemption_type?: RedemptionType;
  redemption_value?: Record<string, unknown>;
}

@Injectable()
export class BurnCatalogueService {
  private readonly logger = new Logger(BurnCatalogueService.name);

  constructor(private readonly ledger: LedgerService) {}

  async listCatalogueItems(
    tenantId: string,
    filters: CatalogueFilters = {},
    page = 1,
    limit = 20,
  ): Promise<PaginatedCatalogueResult> {
    const now = new Date();
    const query: Record<string, unknown> = {
      tenant_id: tenantId,
      is_active: true,
      $or: [{ valid_from: null }, { valid_from: { $lte: now } }],
      $and: [{ $or: [{ valid_until: null }, { valid_until: { $gte: now } }] }],
    };

    if (filters.redemption_type) {
      query['redemption_type'] = filters.redemption_type;
    }
    if (filters.max_points_cost !== undefined) {
      query['points_cost'] = { $lte: filters.max_points_cost };
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      BurnCatalogueItemModel.find(query).skip(skip).limit(limit).lean().exec(),
      BurnCatalogueItemModel.countDocuments(query).exec(),
    ]);

    return { items: items as unknown as IBurnCatalogueItem[], total, page, limit };
  }

  async getCatalogueItem(itemId: string, tenantId: string): Promise<IBurnCatalogueItem> {
    const item = await BurnCatalogueItemModel.findOne({
      item_id: { $eq: itemId },
      tenant_id: { $eq: tenantId },
    })
      .lean()
      .exec();

    if (!item) {
      throw new NotFoundException(`Catalogue item ${itemId} not found`);
    }

    return item as unknown as IBurnCatalogueItem;
  }

  async redeemItem(memberId: string, itemId: string, tenantId: string): Promise<RedeemItemResult> {
    const item = await BurnCatalogueItemModel.findOne({
      item_id: { $eq: itemId },
      tenant_id: { $eq: tenantId },
      is_active: true,
    }).exec();

    if (!item) {
      throw new NotFoundException(`Catalogue item ${itemId} is not available`);
    }

    const now = new Date();
    if (item.valid_from && item.valid_from > now) {
      throw new BadRequestException('Catalogue item is not yet available');
    }
    if (item.valid_until && item.valid_until < now) {
      throw new BadRequestException('Catalogue item has expired');
    }

    if (item.inventory_count !== null && item.inventory_count !== undefined) {
      if (item.inventory_count <= 0) {
        throw new BadRequestException('Catalogue item is out of stock');
      }
    }

    const correlationId = randomUUID();
    const redemptionCode = `RRR-${tenantId.toUpperCase().slice(0, 4)}-${randomUUID().replace(/-/g, '').toUpperCase().slice(0, 12)}`;
    const redemptionId = randomUUID();

    // Deduct points — append-only debit record; throws on insufficient balance
    const ok = await this.ledger.deductPoints(
      memberId,
      item.points_cost,
      'CATALOGUE_REDEEM',
      `Redeem: ${item.title} (item: ${itemId})`,
      `redeem-${redemptionId}`,
    );

    if (!ok) {
      throw new BadRequestException('Insufficient points balance');
    }

    // Decrement inventory if finite
    if (item.inventory_count !== null && item.inventory_count !== undefined) {
      await BurnCatalogueItemModel.updateOne(
        { item_id: { $eq: itemId } },
        { $inc: { inventory_count: -1 } },
      ).exec();
    }

    // Create append-only redemption record
    await BurnRedemptionModel.create({
      redemption_id: redemptionId,
      member_id: memberId,
      catalogue_item_id: itemId,
      tenant_id: tenantId,
      points_spent: item.points_cost,
      redemption_code: redemptionCode,
      status: 'PENDING',
      correlation_id: correlationId,
    });

    this.logger.log(
      { memberId, itemId, redemptionId, points: item.points_cost },
      'Catalogue item redeemed',
    );

    return {
      redemptionId,
      redemptionCode,
      pointsSpent: item.points_cost,
      itemTitle: item.title,
    };
  }

  async getMyRedemptions(memberId: string, tenantId: string): Promise<IBurnRedemption[]> {
    const records = await BurnRedemptionModel.find({
      member_id: { $eq: memberId },
      tenant_id: { $eq: tenantId },
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return records as unknown as IBurnRedemption[];
  }

  async fulfillRedemption(redemptionId: string): Promise<IBurnRedemption> {
    const record = await BurnRedemptionModel.findOne({
      redemption_id: { $eq: redemptionId },
    }).exec();

    if (!record) {
      throw new NotFoundException(`Redemption ${redemptionId} not found`);
    }

    if (record.status !== 'PENDING') {
      throw new BadRequestException(
        `Redemption is in status ${record.status} — only PENDING can be fulfilled`,
      );
    }

    record.status = 'FULFILLED';
    await record.save();

    this.logger.log({ redemptionId }, 'Redemption fulfilled');
    return record;
  }

  async createCatalogueItem(input: CreateCatalogueItemInput): Promise<IBurnCatalogueItem> {
    if (!Number.isInteger(input.points_cost) || input.points_cost < 1) {
      throw new BadRequestException('points_cost must be a positive integer');
    }

    const item = await BurnCatalogueItemModel.create({
      item_id: randomUUID(),
      tenant_id: input.tenant_id,
      title: input.title,
      description: input.description,
      image_url: input.image_url,
      points_cost: input.points_cost,
      inventory_count: input.inventory_count ?? null,
      is_active: input.is_active ?? true,
      valid_from: input.valid_from ?? null,
      valid_until: input.valid_until ?? null,
      redemption_type: input.redemption_type,
      redemption_value: input.redemption_value,
      correlation_id: randomUUID(),
    });

    return item;
  }

  async updateCatalogueItem(
    itemId: string,
    tenantId: string,
    updates: UpdateCatalogueItemInput,
  ): Promise<IBurnCatalogueItem> {
    if (updates.points_cost !== undefined) {
      if (!Number.isInteger(updates.points_cost) || updates.points_cost < 1) {
        throw new BadRequestException('points_cost must be a positive integer');
      }
    }

    const item = await BurnCatalogueItemModel.findOneAndUpdate(
      { item_id: { $eq: itemId }, tenant_id: { $eq: tenantId } },
      { $set: updates },
      { new: true },
    )
      .lean()
      .exec();

    if (!item) {
      throw new NotFoundException(`Catalogue item ${itemId} not found`);
    }

    return item as unknown as IBurnCatalogueItem;
  }
}
