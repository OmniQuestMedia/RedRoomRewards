/**
 * Signup Rate-Limit Middleware (RISK-002)
 *
 * Stricter per-IP sliding-window rate limit for the account-creation endpoint.
 * Account-creation is the #1 vector for bot floods, credential-stuffing
 * pre-flight, and email enumeration, so the global RateLimitMiddleware default
 * (60/min) is too permissive. This middleware applies only to
 * POST /api/v1/members/signup.
 *
 * Default: 5 requests per 60-second window.
 * Configurable via SIGNUP_RATE_LIMIT_PER_MINUTE env var.
 *
 * @module middleware/signup-rate-limit
 */

import { Injectable, NestMiddleware, OnModuleInit } from '@nestjs/common';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SignupRateLimitMiddleware implements NestMiddleware, OnModuleInit {
  private limiter!: ReturnType<typeof rateLimit>;

  onModuleInit(): void {
    const maxRequests = this.parseRateLimit(process.env.SIGNUP_RATE_LIMIT_PER_MINUTE);

    this.limiter = rateLimit({
      windowMs: 60 * 1000,
      max: maxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many signup attempts — please retry after 60 seconds.' },
    });
  }

  private parseRateLimit(value: string | undefined): number {
    if (!value) {
      return 5;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error(`SIGNUP_RATE_LIMIT_PER_MINUTE must be a positive integer, got: ${value}`);
    }

    return parsed;
  }

  use(req: Request, res: Response, next: NextFunction): void {
    this.limiter(req, res, next);
  }
}
