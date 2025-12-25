/**
 * Linking Module Types
 * 
 * Defines types for secure account linking with deep-link proof
 */

/**
 * Link status
 */
export enum LinkStatus {
  /** Link request pending verification */
  PENDING = 'pending',
  
  /** Link is active */
  ACTIVE = 'active',
  
  /** Link has expired */
  EXPIRED = 'expired',
  
  /** Link was revoked */
  REVOKED = 'revoked',
}

/**
 * Account link
 */
export interface AccountLink {
  /** Link ID */
  linkId: string;
  
  /** Primary user ID */
  primaryUserId: string;
  
  /** External account identifier */
  externalAccountId: string;
  
  /** External provider/system */
  provider: string;
  
  /** Link status */
  status: LinkStatus;
  
  /** Verification token (for deep-link proof) */
  verificationToken: string;
  
  /** Created at */
  createdAt: Date;
  
  /** Verified at */
  verifiedAt?: Date;
  
  /** Expires at */
  expiresAt: Date;
  
  /** Revoked at */
  revokedAt?: Date;
  
  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Link request
 */
export interface LinkRequest {
  /** User ID requesting link */
  userId: string;
  
  /** External account to link */
  externalAccountId: string;
  
  /** Provider */
  provider: string;
  
  /** TTL in seconds (default: 300 = 5 minutes) */
  ttlSeconds?: number;
  
  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Link response
 */
export interface LinkResponse {
  /** Created link ID */
  linkId: string;
  
  /** Verification token for deep-link */
  verificationToken: string;
  
  /** Deep-link URL */
  deepLinkUrl: string;
  
  /** Expires at */
  expiresAt: Date;
  
  /** Created timestamp */
  timestamp: Date;
}

/**
 * Verification request
 */
export interface VerificationRequest {
  /** Link ID to verify */
  linkId: string;
  
  /** Verification token */
  verificationToken: string;
}

/**
 * Verification response
 */
export interface VerificationResponse {
  /** Link ID */
  linkId: string;
  
  /** Verification success */
  verified: boolean;
  
  /** Link details if verified */
  link?: AccountLink;
  
  /** Error if failed */
  error?: string;
  
  /** Verification timestamp */
  timestamp: Date;
}

/**
 * Revocation request
 */
export interface RevocationRequest {
  /** Link ID to revoke */
  linkId: string;
  
  /** User ID requesting revocation */
  userId: string;
  
  /** Reason for revocation */
  reason?: string;
}

/**
 * Linking configuration
 */
export interface LinkingConfig {
  /** Base URL for deep links */
  deepLinkBaseUrl: string;
  
  /** Default TTL in seconds */
  defaultTtlSeconds: number;
  
  /** Maximum TTL in seconds */
  maxTtlSeconds: number;
  
  /** Enable deep-link proof */
  enableDeepLinkProof: boolean;
}
