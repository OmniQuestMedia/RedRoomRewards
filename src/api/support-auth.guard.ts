/**
 * Authentication Guard for Support Endpoints
 * 
 * Provides admin/support role verification for internal support endpoints.
 * Used to protect sensitive endpoints like receipt lookup.
 */

import { UserRole, JWTPayload } from '../services/auth.service';
import * as jwt from 'jsonwebtoken';

/**
 * Result of auth check
 */
export interface AuthCheckResult {
  authorized: boolean;
  reason?: string;
  payload?: JWTPayload;
}

/**
 * Configuration for auth guard
 */
export interface AuthGuardConfig {
  jwtSecret: string;
  algorithm?: 'HS256' | 'HS384' | 'HS512';
}

/**
 * Check if request has valid admin/support authorization
 * 
 * @param authHeader - Authorization header value (e.g., "Bearer token...")
 * @param config - Auth configuration
 * @returns AuthCheckResult
 */
export function checkAdminSupportAuth(
  authHeader: string | undefined,
  config: AuthGuardConfig
): AuthCheckResult {
  if (!authHeader) {
    return {
      authorized: false,
      reason: 'Missing authorization header',
    };
  }

  // Extract token from "Bearer <token>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return {
      authorized: false,
      reason: 'Invalid authorization header format',
    };
  }

  const token = parts[1];

  try {
    // Verify and decode token
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: [config.algorithm || 'HS256'],
    }) as JWTPayload;

    // Check for admin or support roles
    const hasRequiredRole = 
      payload.role === UserRole.ADMIN || 
      payload.role === UserRole.SYSTEM;

    if (!hasRequiredRole) {
      return {
        authorized: false,
        reason: 'Insufficient permissions - admin or support role required',
        payload,
      };
    }

    return {
      authorized: true,
      payload,
    };
  } catch (error) {
    return {
      authorized: false,
      reason: error instanceof Error ? error.message : 'Authorization failed',
    };
  }
}

/**
 * Support endpoint request handler wrapper
 * Enforces admin/support auth guard before executing handler
 */
export async function withAdminSupportAuth<T>(
  authHeader: string | undefined,
  config: AuthGuardConfig,
  handler: () => Promise<T>
): Promise<{ authorized: true; data: T } | { authorized: false; error: string }> {
  const authCheck = checkAdminSupportAuth(authHeader, config);

  if (!authCheck.authorized) {
    return {
      authorized: false,
      error: authCheck.reason || 'Unauthorized',
    };
  }

  try {
    const data = await handler();
    return {
      authorized: true,
      data,
    };
  } catch (error) {
    throw error; // Let caller handle business logic errors
  }
}
