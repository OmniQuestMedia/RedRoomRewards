/**
 * Rate-Limit Middleware (D-006)
 *
 * Applies a per-IP sliding-window rate limit to all incoming requests.
 * Default: 60 requests per 60-second window, standard headers, no legacy headers.
 * Configurable via RATE_LIMIT_PER_MINUTE env var.
 *
 * Wire this into AppModule.configure() after AuthMiddleware and
 * TenantScopeMiddleware.
 *
 * @module middleware/rate-limit
 */

import { Injectable, NestMiddleware, OnModuleInit } from '@nestjs/common';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware, OnModuleInit {
  private limiter!: ReturnType<typeof rateLimit>;

  onModuleInit(): void {
    const maxRequests = this.parseRateLimit(process.env.RATE_LIMIT_PER_MINUTE);

    this.limiter = rateLimit({
      windowMs: 60 * 1000,
      max: maxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests — please retry after 60 seconds.' },
    });
  }

  private parseRateLimit(value: string | undefined): number {
    if (!value) {
      return 60; // default
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error(`RATE_LIMIT_PER_MINUTE must be a positive integer, got: ${value}`);
    }

    return parsed;
  }

  use(req: Request, res: Response, next: NextFunction): void {
    this.limiter(req, res, next);
  }
}
