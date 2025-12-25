/**
 * SSO Module Types
 * 
 * Defines types for Single Sign-On authentication
 */

/**
 * Session status
 */
export enum SessionStatus {
  /** Session is active */
  ACTIVE = 'active',
  
  /** Session has expired */
  EXPIRED = 'expired',
  
  /** Session was invalidated/logged out */
  INVALIDATED = 'invalidated',
}

/**
 * SSO token claims
 */
export interface TokenClaims {
  /** User ID */
  userId: string;
  
  /** User email */
  email?: string;
  
  /** Token issued at (Unix timestamp) */
  iat: number;
  
  /** Token expires at (Unix timestamp) */
  exp: number;
  
  /** Token issuer */
  iss: string;
  
  /** Token subject */
  sub: string;
  
  /** Additional claims */
  [key: string]: any;
}

/**
 * SSO token
 */
export interface SSOToken {
  /** Token string (JWT) */
  token: string;
  
  /** Token type */
  tokenType: 'Bearer';
  
  /** Expires in seconds */
  expiresIn: number;
  
  /** Refresh token */
  refreshToken?: string;
  
  /** Token claims */
  claims: TokenClaims;
}

/**
 * Session record
 */
export interface Session {
  /** Session ID */
  sessionId: string;
  
  /** User ID */
  userId: string;
  
  /** Token (JWT) */
  token: string;
  
  /** Session status */
  status: SessionStatus;
  
  /** Created at */
  createdAt: Date;
  
  /** Expires at */
  expiresAt: Date;
  
  /** Last activity at */
  lastActivityAt: Date;
  
  /** Invalidated at */
  invalidatedAt?: Date;
  
  /** IP address */
  ipAddress?: string;
  
  /** User agent */
  userAgent?: string;
  
  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  /** Is token valid */
  valid: boolean;
  
  /** Token claims if valid */
  claims?: TokenClaims;
  
  /** Error message if invalid */
  error?: string;
  
  /** Validation timestamp */
  timestamp: Date;
}

/**
 * Authentication request
 */
export interface AuthRequest {
  /** User credentials or external token */
  credentials: {
    email?: string;
    password?: string;
    externalToken?: string;
    provider?: string;
  };
  
  /** IP address */
  ipAddress?: string;
  
  /** User agent */
  userAgent?: string;
  
  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Authentication response
 */
export interface AuthResponse {
  /** SSO token */
  token: SSOToken;
  
  /** Session ID */
  sessionId: string;
  
  /** User info */
  user: {
    userId: string;
    email?: string;
  };
  
  /** Authentication timestamp */
  timestamp: Date;
}

/**
 * Logout request
 */
export interface LogoutRequest {
  /** Session ID to logout */
  sessionId: string;
  
  /** Reason for logout */
  reason?: string;
}

/**
 * SSO configuration
 */
export interface SSOConfig {
  /** JWT secret key */
  jwtSecret: string;
  
  /** Token issuer */
  issuer: string;
  
  /** Token expiry in seconds */
  tokenExpirySeconds: number;
  
  /** Refresh token expiry in seconds */
  refreshTokenExpirySeconds: number;
  
  /** Enable refresh tokens */
  enableRefreshTokens: boolean;
  
  /** JWT algorithm */
  algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
}
