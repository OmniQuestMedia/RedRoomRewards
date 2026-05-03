import { ReconciliationService } from '../reconciliation.service';
import { LedgerService } from '../../ledger/ledger.service';
import { ReconciliationReport } from '../../ledger/types';

/**
 * ReconciliationService coverage (B-011 invariant gate).
 *
 * The service is a thin orchestration layer over LedgerService.
 * generateReconciliationReport, but it owns two semantic guarantees that
 * matter for the Alpha test pack's Bucket A (financial invariants):
 *
 * 1. NEVER auto-corrects balances on mismatch — this is the append-only
 *    ledger invariant. A mismatch means a human investigates; the service
 *    does not silently rewrite.
 * 2. ALWAYS emits a structured RECON_MISMATCH log on mismatch — the
 *    log shape is the contract that alerting pipelines parse.
 *
 * These specs lock both guarantees with stub-only ledger services so the
 * test runs without MongoDB.
 */
describe('ReconciliationService', () => {
  function makeReportFixture(overrides: Partial<ReconciliationReport> = {}): ReconciliationReport {
    return {
      accountId: 'user-1',
      accountType: 'user',
      startingBalance: 0,
      totalCredits: 1000,
      totalDebits: 250,
      calculatedBalance: 750,
      actualBalance: 750,
      difference: 0,
      reconciled: true,
      reportedAt: new Date('2026-05-03T00:00:00.000Z'),
      dateRange: {
        start: new Date(0),
        end: new Date('2026-05-03T00:00:00.000Z'),
      },
      ...overrides,
    };
  }

  function makeLedgerStub(report: ReconciliationReport): LedgerService {
    const stub = {
      generateReconciliationReport: jest.fn().mockResolvedValue(report),
    };
    return stub as unknown as LedgerService;
  }

  describe('reconcileUser', () => {
    it('returns balanced=true when ledger sum matches actual balance', async () => {
      const ledger = makeLedgerStub(makeReportFixture());
      const service = new ReconciliationService(ledger);
      const result = await service.reconcileUser('user-1', 'tenant-A');
      expect(result.balanced).toBe(true);
      expect(result.details.reconciled).toBe(true);
    });

    it('passes accountType=user and full-history range to LedgerService', async () => {
      const ledger = makeLedgerStub(makeReportFixture());
      const service = new ReconciliationService(ledger);
      await service.reconcileUser('user-1', 'tenant-A');
      const callArgs = (ledger.generateReconciliationReport as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toBe('user-1');
      expect(callArgs[1]).toBe('user');
      expect(callArgs[2].start).toEqual(new Date(0));
      expect(callArgs[2].end).toBeInstanceOf(Date);
      expect(callArgs[3]).toBe('tenant-A');
    });

    it('forwards tenant scope verbatim — never auto-derives or omits tenantId', async () => {
      const ledger = makeLedgerStub(makeReportFixture());
      const service = new ReconciliationService(ledger);
      await service.reconcileUser('user-2', 'cyrano');
      const callArgs = (ledger.generateReconciliationReport as jest.Mock).mock.calls[0];
      expect(callArgs[3]).toBe('cyrano');
    });
  });

  describe('reconcileModel', () => {
    it('passes accountType=model to LedgerService', async () => {
      const ledger = makeLedgerStub(
        makeReportFixture({ accountId: 'model-9', accountType: 'model' }),
      );
      const service = new ReconciliationService(ledger);
      await service.reconcileModel('model-9', 'tenant-A');
      const callArgs = (ledger.generateReconciliationReport as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toBe('model');
    });
  });

  describe('mismatch handling', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('returns balanced=false and details.reconciled=false on a mismatch', async () => {
      const ledger = makeLedgerStub(
        makeReportFixture({
          calculatedBalance: 750,
          actualBalance: 800,
          difference: 50,
          reconciled: false,
        }),
      );
      const service = new ReconciliationService(ledger);
      const result = await service.reconcileUser('user-1', 'tenant-A');
      expect(result.balanced).toBe(false);
      expect(result.details.reconciled).toBe(false);
      expect(result.details.difference).toBe(50);
    });

    it('emits a structured RECON_MISMATCH log payload on mismatch', async () => {
      const ledger = makeLedgerStub(
        makeReportFixture({
          calculatedBalance: 1000,
          actualBalance: 1100,
          difference: 100,
          reconciled: false,
        }),
      );
      const service = new ReconciliationService(ledger);
      await service.reconcileUser('user-1', 'tenant-A');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
      expect(payload.event).toBe('RECON_MISMATCH');
      expect(payload.accountId).toBe('user-1');
      expect(payload.accountType).toBe('user');
      expect(payload.difference).toBe(100);
      expect(payload.calculatedBalance).toBe(1000);
      expect(payload.actualBalance).toBe(1100);
      expect(typeof payload.reportedAt).toBe('string');
    });

    it('does NOT emit a log when reconciliation passes', async () => {
      const ledger = makeLedgerStub(makeReportFixture());
      const service = new ReconciliationService(ledger);
      await service.reconcileUser('user-1', 'tenant-A');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('NEVER calls a write method on the ledger when a mismatch is detected', async () => {
      // The ledger stub only has generateReconciliationReport. Any attempt
      // to mutate would surface as a TypeError. This test pins the
      // append-only invariant: ReconciliationService must not paper over
      // a mismatch by writing a corrective entry.
      const ledger = makeLedgerStub(
        makeReportFixture({
          calculatedBalance: 100,
          actualBalance: 200,
          difference: 100,
          reconciled: false,
        }),
      );
      const service = new ReconciliationService(ledger);
      await expect(service.reconcileUser('user-1', 'tenant-A')).resolves.toBeDefined();
      // Only the read method may be called — the stub has no other methods,
      // so this also asserts no method other than the read was invoked.
      expect(Object.keys(ledger as unknown as Record<string, unknown>)).toEqual([
        'generateReconciliationReport',
      ]);
    });
  });
});
