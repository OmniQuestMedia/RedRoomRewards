import mongoose from 'mongoose';
import { HealthController } from './health.controller';
import { PACKAGE_VERSION } from './version';

describe('HealthController', () => {
  let controller: HealthController;
  let originalReadyStateDescriptor: PropertyDescriptor | undefined;

  beforeAll(() => {
    originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(
      mongoose.connection,
      'readyState',
    );
  });

  beforeEach(() => {
    controller = new HealthController();
  });

  afterEach(() => {
    if (originalReadyStateDescriptor) {
      Object.defineProperty(mongoose.connection, 'readyState', originalReadyStateDescriptor);
    }
  });

  function stubReadyState(value: number): void {
    Object.defineProperty(mongoose.connection, 'readyState', {
      configurable: true,
      get: () => value,
    });
  }

  describe('GET /health (combined summary)', () => {
    it('returns status=ok and database.connected=true when mongoose readyState is 1', () => {
      stubReadyState(1);
      const result = controller.check();
      expect(result.status).toBe('ok');
      expect(result.database.connected).toBe(true);
      expect(result.database.readyState).toBe(1);
    });

    it('returns status=degraded and database.connected=false when readyState is not 1', () => {
      stubReadyState(0);
      const result = controller.check();
      expect(result.status).toBe('degraded');
      expect(result.database.connected).toBe(false);
      expect(result.database.readyState).toBe(0);
    });

    it('returns the package.json version, not a hardcoded string', () => {
      stubReadyState(1);
      const result = controller.check();
      expect(result.version).toBe(PACKAGE_VERSION);
      expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('returns an ISO 8601 timestamp', () => {
      stubReadyState(1);
      const result = controller.check();
      expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
      expect(result.timestamp).toBe(new Date(result.timestamp).toISOString());
    });

    it('lists all canonical components', () => {
      stubReadyState(1);
      const result = controller.check();
      expect(result.components).toEqual(
        expect.arrayContaining([
          'ledger',
          'awarding-wallet',
          'member',
          'merchant',
          'burn-catalog',
          'reporting',
          'white-label',
          'creator-gifting',
          'gateguard-av',
        ]),
      );
    });
  });

  describe('GET /health/live (liveness probe)', () => {
    it('always returns status=live regardless of DB state', () => {
      stubReadyState(0);
      expect(controller.live()).toEqual({ status: 'live' });
      stubReadyState(1);
      expect(controller.live()).toEqual({ status: 'live' });
    });
  });

  describe('GET /health/ready (readiness probe)', () => {
    function makeRes(): {
      status: jest.Mock;
      json: jest.Mock;
      body: { calls: unknown[]; statuses: number[] };
    } {
      const calls: unknown[] = [];
      const statuses: number[] = [];
      const json = jest.fn((value: unknown) => {
        calls.push(value);
        return value;
      });
      const status = jest.fn((code: number) => {
        statuses.push(code);
        return { json } as unknown;
      });
      return { status, json, body: { calls, statuses } };
    }

    it('returns 200 + status=ready when DB is connected', () => {
      stubReadyState(1);
      const res = makeRes();
      controller.ready(res as never);
      expect(res.body.statuses).toEqual([200]);
      expect(res.body.calls).toEqual([
        { status: 'ready', database: { connected: true, readyState: 1 } },
      ]);
    });

    it('returns 503 + status=not_ready when DB is disconnected', () => {
      stubReadyState(0);
      const res = makeRes();
      controller.ready(res as never);
      expect(res.body.statuses).toEqual([503]);
      expect(res.body.calls).toEqual([
        { status: 'not_ready', database: { connected: false, readyState: 0 } },
      ]);
    });

    it('returns 503 when DB is in connecting state (readyState=2)', () => {
      stubReadyState(2);
      const res = makeRes();
      controller.ready(res as never);
      expect(res.body.statuses).toEqual([503]);
      expect(res.body.calls[0]).toMatchObject({ status: 'not_ready' });
    });
  });
});
