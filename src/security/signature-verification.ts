/**
 * Webhook Signature Verification Service
 * 
 * Implements signed payload verification for webhook and API endpoints.
 * Validates X-Signature, X-Timestamp, and X-Nonce headers to prevent
 * unauthorized and replayed requests.
 * 
 * Security Features:
 * - HMAC-SHA256 signature verification
 * - Timestamp validation (prevents replay attacks)
 * - Nonce tracking (prevents duplicate requests)
 * - Configurable time windows and nonce TTL
 */

import * as crypto from 'crypto';

/**
 * Configuration for signature verification
 */
export interface SignatureVerificationConfig {
  /** Secret key for HMAC signature */
  webhookSecret: string;
  
  /** Maximum allowed time difference in seconds (default: 300 = 5 minutes) */
  maxTimestampDriftSeconds: number;
  
  /** Nonce cache TTL in seconds (default: 3600 = 1 hour) */
  nonceTTLSeconds: number;
  
  /** Algorithm for HMAC (default: sha256) */
  algorithm: 'sha256' | 'sha384' | 'sha512';
}

/**
 * Request headers for signature verification
 */
export interface SignedRequestHeaders {
  /** HMAC signature of the request payload */
  'x-signature': string;
  
  /** Unix timestamp when request was signed */
  'x-timestamp': string;
  
  /** Unique nonce to prevent replay attacks */
  'x-nonce': string;
}

/**
 * Verification result
 */
export interface VerificationResult {
  /** Whether verification passed */
  valid: boolean;
  
  /** Error message if verification failed */
  error?: string;
  
  /** Timestamp of the request */
  timestamp?: Date;
  
  /** Nonce from the request */
  nonce?: string;
}

/**
 * Nonce store interface for tracking used nonces
 */
export interface INonceStore {
  /**
   * Check if nonce has been used
   */
  hasNonce(nonce: string): Promise<boolean>;
  
  /**
   * Store nonce with TTL
   */
  storeNonce(nonce: string, ttlSeconds: number): Promise<void>;
  
  /**
   * Clean up expired nonces
   */
  cleanup(): Promise<void>;
}

/**
 * In-memory nonce store (for development/testing)
 * Production should use Redis or similar distributed cache
 */
export class InMemoryNonceStore implements INonceStore {
  private nonces: Map<string, number> = new Map();
  
  async hasNonce(nonce: string): Promise<boolean> {
    const expiry = this.nonces.get(nonce);
    if (!expiry) {
      return false;
    }
    
    // Check if expired
    if (Date.now() > expiry) {
      this.nonces.delete(nonce);
      return false;
    }
    
    return true;
  }
  
  async storeNonce(nonce: string, ttlSeconds: number): Promise<void> {
    const expiry = Date.now() + (ttlSeconds * 1000);
    this.nonces.set(nonce, expiry);
  }
  
  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [nonce, expiry] of this.nonces.entries()) {
      if (now > expiry) {
        this.nonces.delete(nonce);
      }
    }
  }
}

/**
 * Signature Verification Service
 */
export class SignatureVerificationService {
  private config: SignatureVerificationConfig;
  private nonceStore: INonceStore;
  
  constructor(
    config: SignatureVerificationConfig,
    nonceStore?: INonceStore
  ) {
    this.config = config;
    this.nonceStore = nonceStore || new InMemoryNonceStore();
  }
  
  /**
   * Verify signed request
   * 
   * @param headers Request headers containing signature, timestamp, and nonce
   * @param payload Request body as string or buffer
   * @returns Verification result
   */
  async verifyRequest(
    headers: Partial<SignedRequestHeaders>,
    payload: string | Buffer
  ): Promise<VerificationResult> {
    // Validate required headers
    const signature = headers['x-signature'];
    const timestampStr = headers['x-timestamp'];
    const nonce = headers['x-nonce'];
    
    if (!signature || !timestampStr || !nonce) {
      return {
        valid: false,
        error: 'Missing required signature headers (x-signature, x-timestamp, x-nonce)',
      };
    }
    
    // Parse and validate timestamp
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      return {
        valid: false,
        error: 'Invalid timestamp format',
      };
    }
    
    const requestTime = new Date(timestamp * 1000);
    const now = Date.now();
    const timeDiff = Math.abs(now - requestTime.getTime()) / 1000;
    
    if (timeDiff > this.config.maxTimestampDriftSeconds) {
      return {
        valid: false,
        error: `Request timestamp outside acceptable window (${timeDiff}s > ${this.config.maxTimestampDriftSeconds}s)`,
        timestamp: requestTime,
      };
    }
    
    // Check if nonce has been used (replay attack prevention)
    const nonceUsed = await this.nonceStore.hasNonce(nonce);
    if (nonceUsed) {
      return {
        valid: false,
        error: 'Nonce has already been used (possible replay attack)',
        timestamp: requestTime,
        nonce,
      };
    }
    
    // Verify signature
    const expectedSignature = this.generateSignature(payload, timestampStr, nonce);
    const signatureValid = this.secureCompare(signature, expectedSignature);
    
    if (!signatureValid) {
      return {
        valid: false,
        error: 'Invalid signature',
        timestamp: requestTime,
        nonce,
      };
    }
    
    // Store nonce to prevent reuse
    await this.nonceStore.storeNonce(nonce, this.config.nonceTTLSeconds);
    
    return {
      valid: true,
      timestamp: requestTime,
      nonce,
    };
  }
  
  /**
   * Generate signature for a payload
   * 
   * @param payload Request body
   * @param timestamp Unix timestamp as string
   * @param nonce Unique nonce
   * @returns HMAC signature
   */
  generateSignature(
    payload: string | Buffer,
    timestamp: string,
    nonce: string
  ): string {
    // Create signature base string: timestamp.nonce.payload
    const signatureBase = `${timestamp}.${nonce}.${payload}`;
    
    // Generate HMAC
    const hmac = crypto.createHmac(this.config.algorithm, this.config.webhookSecret);
    hmac.update(signatureBase);
    return hmac.digest('hex');
  }
  
  /**
   * Secure string comparison to prevent timing attacks
   * 
   * @param a First string
   * @param b Second string
   * @returns Whether strings match
   */
  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    // Use crypto.timingSafeEqual for constant-time comparison
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    
    try {
      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      // If buffers are different lengths, timingSafeEqual throws
      return false;
    }
  }
  
  /**
   * Clean up expired nonces
   */
  async cleanupExpiredNonces(): Promise<void> {
    await this.nonceStore.cleanup();
  }
}

/**
 * Factory function to create signature verification service
 */
export function createSignatureVerificationService(
  config: SignatureVerificationConfig,
  nonceStore?: INonceStore
): SignatureVerificationService {
  return new SignatureVerificationService(config, nonceStore);
}

/**
 * Express middleware for signature verification
 */
export function createSignatureVerificationMiddleware(
  service: SignatureVerificationService
) {
  return async (req: any, res: any, next: any) => {
    try {
      // Get raw body (assumes body parser raw middleware is used)
      const rawBody = req.rawBody || JSON.stringify(req.body);
      
      // Verify signature
      const result = await service.verifyRequest(req.headers, rawBody);
      
      if (!result.valid) {
        return res.status(401).json({
          error: 'Signature verification failed',
          message: result.error,
        });
      }
      
      // Attach verification result to request
      req.signatureVerification = result;
      next();
    } catch (error) {
      return res.status(500).json({
        error: 'Signature verification error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
