/**
 * Auth Middleware (C-004)
 *
 * Extracts and verifies the Bearer JWT from the `Authorization` header.
 * On success, populates `req.tenantId` and `req.userId` so that downstream
 * guards and the `TenantScopeMiddleware` can enforce multi-tenant isolation
 * without re-reading the token.
 *
 * FAIL-CLOSED: Missing or invalid tokens are rejected with 401.
 * JWT_SECRET must be configured at startup or the middleware will not initialize.
 *
 * @module middleware/auth
 */

import { Injectable, NestMiddleware, OnModuleInit } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

/**
 * Expected shape of the JWT payload used by this platform.
 */
interface RrrJwtPayload {
  tenantId?: string;
  userId?: string;
  sub?: string;
  [key: string]: unknown;
}

@Injectable()
export class AuthMiddleware implements NestMiddleware, OnModuleInit {
  private jwtSecret!: string;

  onModuleInit(): void {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is required for AuthMiddleware');
    }
    this.jwtSecret = secret;
  }

  use(
    req: Request & { tenantId?: string; userId?: string },
    res: Response,
    next: NextFunction,
  ): void {
    const authHeader = req.headers.authorization;
    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined;

    if (!token) {
      res.status(401).json({ error: 'authentication required' });
      return;
    }

    try {
      const payload = jwt.verify(token, this.jwtSecret) as RrrJwtPayload;

      if (typeof payload.tenantId === 'string') {
        req.tenantId = payload.tenantId;
      }
      if (typeof payload.userId === 'string') {
        req.userId = payload.userId;
      } else if (typeof payload.sub === 'string') {
        req.userId = payload.sub;
      }

      next();
    } catch (err) {
      res.status(401).json({ error: 'invalid or expired token' });
      return;
    }
  }
}
