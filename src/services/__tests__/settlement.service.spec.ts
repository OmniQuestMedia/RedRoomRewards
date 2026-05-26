/**
 * SettlementService — unit tests (C-011)
 */

import { SettlementService } from '../settlement.service';
import { SettlementRecordModel as _SettlementRecordModel } from '../../db/models/settlement-record.model';

jest.mock('../../db/models/settlement-record.model', () => {
  const saveMock = jest.fn().mockResolvedValue(undefined);
  const constructorMock = jest.fn().mockImplementation((data: unknown) => ({
    ...((data as object) ?? {}),
    save: saveMock,
  }));
  return { SettlementRecordModel: constructorMock, __saveMock: saveMock };
});

const { __saveMock: saveMock } = jest.requireMock('../../db/models/settlement-record.model') as {
  __saveMock: jest.Mock;
};

const TENANT = 't-001';
const START = new Date('2026-04-01T00:00:00.000Z');
const END = new Date('2026-04-30T23:59:59.999Z');
const CORRELATION = 'corr-abc-123';

describe('SettlementService (C-011)', () => {
  let service: SettlementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SettlementService();
  });

  it('creates a SettlementRecord with status pending', async () => {
    const result = await service.settlePeriod(TENANT, START, END, CORRELATION);

    expect(result.status).toBe('pending');
    expect(result.tenant_id).toBe(TENANT);
    expect(result.period_start).toBe(START);
    expect(result.period_end).toBe(END);
    expect(result.total_redeemed).toBe(0);
    expect(result.correlation_id).toBe(CORRELATION);
  });

  it('saves the record to the database', async () => {
    await service.settlePeriod(TENANT, START, END, CORRELATION);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('assigns a uuid settlement_id', async () => {
    const result = await service.settlePeriod(TENANT, START, END, CORRELATION);
    expect(typeof result.settlement_id).toBe('string');
    expect(result.settlement_id.length).toBeGreaterThan(0);
  });

  it('uses a generated correlation_id when none is supplied', async () => {
    const result = await service.settlePeriod(TENANT, START, END);
    expect(typeof result.correlation_id).toBe('string');
    expect(result.correlation_id.length).toBeGreaterThan(0);
  });

  it('returns the SettlementRecord instance', async () => {
    const result = await service.settlePeriod(TENANT, START, END, CORRELATION);
    expect(result).toBeDefined();
    expect(typeof result.save).toBe('function');
  });
});
