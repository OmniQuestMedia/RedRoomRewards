/**
 * EscrowDetailController tests
 *
 * Verifies the escrow detail endpoint (Screen 05) route behaviour:
 *   GET /wallets/:userId/escrow/:escrowId
 */

import { EscrowDetailController } from '../../controllers/escrow-detail.controller';
import { EscrowItemModel } from '../../db/models/escrow-item.model';

jest.mock('../../db/models/escrow-item.model');

const NOW = new Date('2026-01-10T12:00:00Z');
const PROCESSED = new Date('2026-01-11T08:00:00Z');

function makeMockEscrowDoc(overrides: Record<string, unknown> = {}) {
  return {
    escrowId: 'escrow-001',
    userId: 'user-123',
    amount: 250,
    status: 'held',
    queueItemId: 'queue-42',
    featureType: 'performance',
    reason: 'performance_request',
    modelId: undefined,
    metadata: undefined,
    createdAt: NOW,
    processedAt: undefined,
    ...overrides,
  };
}

describe('EscrowDetailController', () => {
  let controller: EscrowDetailController;
  let mockFindOne: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new EscrowDetailController();

    mockFindOne = jest.fn();
    (EscrowItemModel.findOne as jest.Mock).mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(null) }),
    });
  });

  describe('getEscrowDetail', () => {
    it('should return full detail for a HELD escrow item', async () => {
      const doc = makeMockEscrowDoc();
      (EscrowItemModel.findOne as jest.Mock).mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(doc) }),
      });

      const result = await controller.getEscrowDetail('user-123', 'escrow-001');

      expect(result.escrowId).toBe('escrow-001');
      expect(result.userId).toBe('user-123');
      expect(result.amount).toBe(250);
      expect(result.status).toBe('held');
      expect(result.queueItemId).toBe('queue-42');
      expect(result.featureType).toBe('performance');
      expect(result.reason).toBe('performance_request');
      expect(result.createdAt).toBe(NOW.toISOString());
      expect(result.processedAt).toBeUndefined();
      expect(EscrowItemModel.findOne).toHaveBeenCalledWith({
        escrowId: { $eq: 'escrow-001' },
        userId: { $eq: 'user-123' },
      });
    });

    it('should include processedAt for a SETTLED item', async () => {
      const doc = makeMockEscrowDoc({
        status: 'settled',
        modelId: 'model-77',
        processedAt: PROCESSED,
      });
      (EscrowItemModel.findOne as jest.Mock).mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(doc) }),
      });

      const result = await controller.getEscrowDetail('user-123', 'escrow-001');

      expect(result.status).toBe('settled');
      expect(result.modelId).toBe('model-77');
      expect(result.processedAt).toBe(PROCESSED.toISOString());
    });

    it('should throw NotFoundException when escrow does not exist', async () => {
      (EscrowItemModel.findOne as jest.Mock).mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(null) }),
      });

      await expect(controller.getEscrowDetail('user-123', 'missing')).rejects.toThrow(
        'Escrow missing not found for user user-123',
      );
    });

    it('should scope query to the provided userId (no cross-user leakage)', async () => {
      (EscrowItemModel.findOne as jest.Mock).mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(null) }),
      });

      try {
        await controller.getEscrowDetail('user-OTHER', 'escrow-001');
      } catch {
        // NotFoundException expected
      }

      expect(EscrowItemModel.findOne).toHaveBeenCalledWith({
        escrowId: { $eq: 'escrow-001' },
        userId: { $eq: 'user-OTHER' },
      });
    });
  });
});
