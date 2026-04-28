/**
 * Escrow Detail NestJS Controller
 *
 * Thin HTTP transport layer for the escrow detail endpoint (Screen 05).
 *
 * Route:
 *   GET /wallets/:userId/escrow/:escrowId — single escrow item detail
 *
 * The endpoint is read-only and informational for terminal states
 * (SETTLED, REFUNDED). For HELD items it also surfaces the linked
 * queue item and the feature that created the hold.
 *
 * @see /api/openapi.yaml — operationId getEscrowDetail
 */

import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { EscrowItemModel } from '../db/models/escrow-item.model';

/**
 * Single escrow item detail response shape
 */
export interface EscrowDetailResponse {
  escrowId: string;
  userId: string;
  amount: number;
  /** HELD | SETTLED | REFUNDED | PARTIAL */
  status: string;
  queueItemId: string;
  featureType: string;
  reason: string;
  modelId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  processedAt?: string;
}

@Controller('wallets')
export class EscrowDetailController {
  /**
   * GET /wallets/:userId/escrow/:escrowId
   *
   * Returns full detail for a single escrow item scoped to the given user.
   * Terminal states (SETTLED, REFUNDED) are informational only — no CTAs.
   */
  @Get(':userId/escrow/:escrowId')
  async getEscrowDetail(
    @Param('userId') userId: string,
    @Param('escrowId') escrowId: string,
  ): Promise<EscrowDetailResponse> {
    const item = await EscrowItemModel.findOne({
      escrowId: { $eq: escrowId },
      userId: { $eq: userId },
    })
      .lean()
      .exec();

    if (!item) {
      throw new NotFoundException(`Escrow ${escrowId} not found for user ${userId}`);
    }

    return {
      escrowId: item.escrowId,
      userId: item.userId,
      amount: item.amount,
      status: item.status,
      queueItemId: item.queueItemId,
      featureType: item.featureType,
      reason: item.reason,
      modelId: item.modelId,
      metadata: item.metadata,
      createdAt: item.createdAt.toISOString(),
      processedAt: item.processedAt ? item.processedAt.toISOString() : undefined,
    };
  }
}
