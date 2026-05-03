import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import mongoose from 'mongoose';
import logger from '../lib/logger';
import { PACKAGE_VERSION } from './version';

/**
 * Mongoose readyState values that mean the connection is usable.
 * 1 = connected. Other values: 0 disconnected, 2 connecting, 3 disconnecting,
 * 99 uninitialized. See mongoose ConnectionStates enum.
 */
const MONGOOSE_READYSTATE_CONNECTED = 1;

interface HealthEnvelope {
  status: 'ok' | 'degraded';
  version: string;
  timestamp: string;
  components: string[];
  database: {
    connected: boolean;
    readyState: number;
  };
}

interface ReadinessEnvelope {
  status: 'ready' | 'not_ready';
  database: {
    connected: boolean;
    readyState: number;
  };
}

@Controller('health')
export class HealthController {
  /**
   * Combined health summary. Returns 200 with status=ok when DB is connected,
   * 200 with status=degraded otherwise (the process is still alive). Suitable
   * for human inspection and external uptime probes that only care about
   * "process responding."
   */
  @Get()
  check(): HealthEnvelope {
    const readyState = mongoose.connection?.readyState ?? 0;
    const connected = readyState === MONGOOSE_READYSTATE_CONNECTED;
    logger.info({ readyState, connected }, 'Health check called');
    return {
      status: connected ? 'ok' : 'degraded',
      version: PACKAGE_VERSION,
      timestamp: new Date().toISOString(),
      components: [
        'ledger',
        'awarding-wallet',
        'member',
        'merchant',
        'burn-catalog',
        'reporting',
        'white-label',
        'creator-gifting',
        'gateguard-av',
      ],
      database: { connected, readyState },
    };
  }

  /**
   * Liveness probe — orchestrators (Kubernetes, Docker, App Platform) call
   * this to decide whether to restart the container. Always 200 if the
   * process can answer; the only failure mode is process death, which the
   * orchestrator detects by connection refusal, not a non-200 response.
   */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): { status: 'live' } {
    return { status: 'live' };
  }

  /**
   * Readiness probe — orchestrators call this to decide whether to route
   * traffic to this instance. Returns 200 when the DB connection is healthy,
   * 503 otherwise. Critical for rolling deploys: a new instance must not
   * receive traffic until it can actually serve a wallet read.
   */
  @Get('ready')
  ready(@Res() res: Response): Response {
    const readyState = mongoose.connection?.readyState ?? 0;
    const connected = readyState === MONGOOSE_READYSTATE_CONNECTED;
    const body: ReadinessEnvelope = {
      status: connected ? 'ready' : 'not_ready',
      database: { connected, readyState },
    };
    return res.status(connected ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(body);
  }
}
