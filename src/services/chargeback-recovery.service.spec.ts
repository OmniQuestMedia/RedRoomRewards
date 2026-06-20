import { ChargebackRecoveryService } from './chargeback-recovery.service';
import { LedgerService } from '../ledger/ledger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockSave = jest.fn();
const mockFindOne = jest.fn();

jest.mock('../db/models/chargeback-event.model', () => ({
  ChargebackEventModel: jest.fn().mockImplementation(() => ({
    status: 'received',
    save: mockSave,
  })),
}));

const { ChargebackEventModel } = jest.requireMock('../db/models/chargeback-event.model') as {
  ChargebackEventModel: jest.Mock & { findOne: (...args: unknown[]) => unknown };
};
ChargebackEventModel.findOne = (...args: unknown[]) => mockFindOne(...args);

const baseInput = {
  tenant_id: 't-1',
  member_id: 'member-1',
  order_ref: 'ORDER-123',
  chargeback_amount_cents: 5000,
  points_to_reverse: 500,
};

describe('ChargebackRecoveryService', () => {
  let service: ChargebackRecoveryService;
  let ledger: jest.Mocked<LedgerService>;

  beforeEach(() => {
    jest.clearAllMocks();
    ledger = {
      deductPoints: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<LedgerService>;
    service = new ChargebackRecoveryService(ledger);
  });

  describe('initiateChargeback', () => {
    it('throws BadRequestException for zero chargeback_amount_cents', async () => {
      await expect(
        service.initiateChargeback({ ...baseInput, chargeback_amount_cents: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for negative chargeback_amount_cents', async () => {
      await expect(
        service.initiateChargeback({ ...baseInput, chargeback_amount_cents: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for non-integer chargeback_amount_cents', async () => {
      await expect(
        service.initiateChargeback({ ...baseInput, chargeback_amount_cents: 50.5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for negative points_to_reverse', async () => {
      await expect(
        service.initiateChargeback({ ...baseInput, points_to_reverse: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates chargeback record with status received', async () => {
      const saved = { ...baseInput, chargeback_id: 'cb-1', status: 'received' };
      mockSave.mockResolvedValue(saved);

      const result = await service.initiateChargeback(baseInput);

      expect(mockSave).toHaveBeenCalled();
      expect(result.status).toBe('received');
    });

    it('allows points_to_reverse = 0 (zero-point chargeback)', async () => {
      const saved = { ...baseInput, points_to_reverse: 0, status: 'received' };
      mockSave.mockResolvedValue(saved);

      const result = await service.initiateChargeback({ ...baseInput, points_to_reverse: 0 });
      expect(result.status).toBe('received');
    });
  });

  describe('reversePoints', () => {
    it('throws NotFoundException when chargeback not found', async () => {
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(null) });

      await expect(service.reversePoints('cb-missing', 't-1', 'idem-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when status is already reversed', async () => {
      const record = {
        chargeback_id: 'cb-1',
        status: 'reversed',
        points_to_reverse: 500,
        save: mockSave,
      };
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(record) });

      await expect(service.reversePoints('cb-1', 't-1', 'idem-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(ledger.deductPoints).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when status is closed', async () => {
      const record = {
        chargeback_id: 'cb-1',
        status: 'closed',
        points_to_reverse: 0,
        save: mockSave,
      };
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(record) });

      await expect(service.reversePoints('cb-1', 't-1', 'idem-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('marks closed without ledger call when points_to_reverse is 0', async () => {
      const record = {
        chargeback_id: 'cb-zero',
        status: 'received',
        points_to_reverse: 0,
        member_id: 'member-1',
        order_ref: 'ORDER-0',
        save: mockSave,
      };
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(record) });
      mockSave.mockResolvedValue({ ...record, status: 'closed' });

      const result = await service.reversePoints('cb-zero', 't-1', 'idem-zero');

      expect(ledger.deductPoints).not.toHaveBeenCalled();
      expect(mockSave).toHaveBeenCalled();
      expect(result.status).toBe('closed');
    });

    it('calls ledger.deductPoints and marks reversed for non-zero points', async () => {
      const record = {
        chargeback_id: 'cb-1',
        status: 'received',
        points_to_reverse: 500,
        member_id: 'member-1',
        order_ref: 'ORDER-123',
        save: mockSave,
      };
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(record) });
      mockSave.mockResolvedValue({ ...record, status: 'reversed' });

      const result = await service.reversePoints('cb-1', 't-1', 'idem-1');

      expect(ledger.deductPoints).toHaveBeenCalledWith(
        'member-1',
        500,
        'CHARGEBACK_REVERSAL',
        expect.stringContaining('ORDER-123'),
        'idem-1',
      );
      expect(result.status).toBe('reversed');
    });

    it('processes chargeback in processing status', async () => {
      const record = {
        chargeback_id: 'cb-2',
        status: 'processing',
        points_to_reverse: 200,
        member_id: 'member-2',
        order_ref: 'ORDER-456',
        save: mockSave,
      };
      mockFindOne.mockReturnValue({ exec: () => Promise.resolve(record) });
      mockSave.mockResolvedValue({ ...record, status: 'reversed' });

      await service.reversePoints('cb-2', 't-1', 'idem-2');

      expect(ledger.deductPoints).toHaveBeenCalled();
    });
  });
});
