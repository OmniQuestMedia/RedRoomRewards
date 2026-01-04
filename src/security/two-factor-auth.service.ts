/**
 * Two-Factor Authentication (2FA) Service
 * 
 * Implements TOTP (Time-based One-Time Password) authentication for admin users.
 * Supports:
 * - QR code generation for setup
 * - TOTP token verification
 * - Backup codes for recovery
 * - 2FA requirement enforcement for admin roles
 */

import * as crypto from 'crypto';

/**
 * 2FA configuration
 */
export interface TwoFactorConfig {
  /** Application name for TOTP */
  appName: string;
  
  /** TOTP window size (number of 30-second windows to check) */
  window: number;
  
  /** Require 2FA for specific roles */
  requiredRoles: string[];
  
  /** Number of backup codes to generate */
  backupCodeCount: number;
}

/**
 * 2FA setup result
 */
export interface TwoFactorSetup {
  /** Secret key for TOTP */
  secret: string;
  
  /** QR code data URL */
  qrCodeUrl: string;
  
  /** Backup codes for recovery */
  backupCodes: string[];
  
  /** Setup timestamp */
  setupAt: Date;
}

/**
 * 2FA verification result
 */
export interface TwoFactorVerificationResult {
  /** Whether verification passed */
  valid: boolean;
  
  /** Error message if verification failed */
  error?: string;
  
  /** Whether a backup code was used */
  usedBackupCode?: boolean;
}

/**
 * User 2FA data
 */
export interface UserTwoFactorData {
  /** User ID */
  userId: string;
  
  /** Whether 2FA is enabled */
  enabled: boolean;
  
  /** Secret key (encrypted) */
  secret?: string;
  
  /** Backup codes (hashed) */
  backupCodes?: string[];
  
  /** When 2FA was enabled */
  enabledAt?: Date;
  
  /** Last successful verification */
  lastVerifiedAt?: Date;
}

/**
 * 2FA storage interface
 */
export interface ITwoFactorStorage {
  /**
   * Get user 2FA data
   */
  get(userId: string): Promise<UserTwoFactorData | null>;
  
  /**
   * Store user 2FA data
   */
  store(data: UserTwoFactorData): Promise<void>;
  
  /**
   * Remove backup code after use
   */
  removeBackupCode(userId: string, codeHash: string): Promise<void>;
  
  /**
   * Update last verified timestamp
   */
  updateLastVerified(userId: string): Promise<void>;
}

/**
 * In-memory 2FA storage (for development/testing)
 * Production should use encrypted database storage
 */
export class InMemoryTwoFactorStorage implements ITwoFactorStorage {
  private data: Map<string, UserTwoFactorData> = new Map();
  
  async get(userId: string): Promise<UserTwoFactorData | null> {
    return this.data.get(userId) || null;
  }
  
  async store(data: UserTwoFactorData): Promise<void> {
    this.data.set(data.userId, data);
  }
  
  async removeBackupCode(userId: string, codeHash: string): Promise<void> {
    const data = this.data.get(userId);
    if (data && data.backupCodes) {
      data.backupCodes = data.backupCodes.filter(hash => hash !== codeHash);
    }
  }
  
  async updateLastVerified(userId: string): Promise<void> {
    const data = this.data.get(userId);
    if (data) {
      data.lastVerifiedAt = new Date();
    }
  }
}

/**
 * Two-Factor Authentication Service
 */
export class TwoFactorAuthService {
  private config: TwoFactorConfig;
  private storage: ITwoFactorStorage;
  
  constructor(
    storage: ITwoFactorStorage,
    config: Partial<TwoFactorConfig> = {}
  ) {
    this.storage = storage;
    this.config = {
      appName: 'RedRoomRewards',
      window: 1,
      requiredRoles: ['admin', 'super_admin', 'finance_admin', 'merchant_admin'],
      backupCodeCount: 10,
      ...config,
    };
  }
  
  /**
   * Setup 2FA for a user
   * 
   * @param userId User ID
   * @param userEmail User email for QR code
   * @returns Setup data including secret and QR code
   */
  async setup(userId: string, userEmail: string): Promise<TwoFactorSetup> {
    // Generate secret
    const secret = this.generateSecret();
    
    // Generate backup codes
    const backupCodes = this.generateBackupCodes();
    
    // Hash backup codes for storage
    const hashedBackupCodes = backupCodes.map(code => this.hashBackupCode(code));
    
    // Store 2FA data (not enabled yet)
    await this.storage.store({
      userId,
      enabled: false,
      secret,
      backupCodes: hashedBackupCodes,
    });
    
    // Generate QR code URL
    const qrCodeUrl = this.generateQRCodeUrl(userEmail, secret);
    
    return {
      secret,
      qrCodeUrl,
      backupCodes,
      setupAt: new Date(),
    };
  }
  
  /**
   * Enable 2FA for a user after verification
   * 
   * @param userId User ID
   * @param token TOTP token to verify
   * @returns Whether 2FA was enabled
   */
  async enable(userId: string, token: string): Promise<boolean> {
    const data = await this.storage.get(userId);
    if (!data || !data.secret) {
      throw new Error('2FA not set up for user');
    }
    
    // Verify token before enabling
    const valid = this.verifyTOTP(data.secret, token);
    if (!valid) {
      return false;
    }
    
    // Enable 2FA
    data.enabled = true;
    data.enabledAt = new Date();
    await this.storage.store(data);
    
    return true;
  }
  
  /**
   * Disable 2FA for a user
   * 
   * @param userId User ID
   */
  async disable(userId: string): Promise<void> {
    const data = await this.storage.get(userId);
    if (data) {
      data.enabled = false;
      data.secret = undefined;
      data.backupCodes = undefined;
      await this.storage.store(data);
    }
  }
  
  /**
   * Verify 2FA token
   * 
   * @param userId User ID
   * @param token TOTP token or backup code
   * @returns Verification result
   */
  async verify(userId: string, token: string): Promise<TwoFactorVerificationResult> {
    const data = await this.storage.get(userId);
    
    if (!data || !data.enabled || !data.secret) {
      return {
        valid: false,
        error: '2FA not enabled for user',
      };
    }
    
    // Try TOTP verification first
    const totpValid = this.verifyTOTP(data.secret, token);
    if (totpValid) {
      await this.storage.updateLastVerified(userId);
      return { valid: true };
    }
    
    // Try backup code verification
    if (data.backupCodes) {
      const tokenHash = this.hashBackupCode(token);
      const backupCodeValid = data.backupCodes.includes(tokenHash);
      
      if (backupCodeValid) {
        // Remove used backup code
        await this.storage.removeBackupCode(userId, tokenHash);
        await this.storage.updateLastVerified(userId);
        return { valid: true, usedBackupCode: true };
      }
    }
    
    return {
      valid: false,
      error: 'Invalid 2FA token or backup code',
    };
  }
  
  /**
   * Check if 2FA is required for a role
   * 
   * @param roles User roles
   * @returns Whether 2FA is required
   */
  isRequired(roles: string[]): boolean {
    return roles.some(role => this.config.requiredRoles.includes(role));
  }
  
  /**
   * Check if user has 2FA enabled
   * 
   * @param userId User ID
   * @returns Whether 2FA is enabled
   */
  async isEnabled(userId: string): Promise<boolean> {
    const data = await this.storage.get(userId);
    return data?.enabled || false;
  }
  
  /**
   * Validate 2FA requirement for admin operation
   * 
   * @param userId User ID
   * @param roles User roles
   * @param token 2FA token (if provided)
   * @returns Whether validation passed
   */
  async validateRequirement(
    userId: string,
    roles: string[],
    token?: string
  ): Promise<TwoFactorVerificationResult> {
    // Check if 2FA is required for these roles
    if (!this.isRequired(roles)) {
      return { valid: true };
    }
    
    // Check if user has 2FA enabled
    const enabled = await this.isEnabled(userId);
    if (!enabled) {
      return {
        valid: false,
        error: '2FA is required but not enabled for this user',
      };
    }
    
    // Verify token if provided
    if (!token) {
      return {
        valid: false,
        error: '2FA token required',
      };
    }
    
    return this.verify(userId, token);
  }
  
  /**
   * Generate a random secret for TOTP
   */
  private generateSecret(): string {
    // Generate 20 bytes (160 bits) of random data
    const buffer = crypto.randomBytes(20);
    // Encode as base32
    return this.base32Encode(buffer);
  }
  
  /**
   * Generate backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < this.config.backupCodeCount; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }
  
  /**
   * Hash backup code for storage
   */
  private hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }
  
  /**
   * Verify TOTP token
   */
  private verifyTOTP(secret: string, token: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    const timeStep = 30; // TOTP time step in seconds
    
    // Check current window and adjacent windows
    for (let i = -this.config.window; i <= this.config.window; i++) {
      const time = Math.floor(now / timeStep) + i;
      const expectedToken = this.generateTOTP(secret, time);
      
      if (token === expectedToken) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Generate TOTP token for a given time
   */
  private generateTOTP(secret: string, time: number): string {
    const secretBuffer = this.base32Decode(secret);
    const timeBuffer = Buffer.allocUnsafe(8);
    timeBuffer.writeBigUInt64BE(BigInt(time));
    
    const hmac = crypto.createHmac('sha1', secretBuffer);
    hmac.update(timeBuffer);
    const hash = hmac.digest();
    
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);
    
    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }
  
  /**
   * Generate QR code URL for TOTP
   */
  private generateQRCodeUrl(email: string, secret: string): string {
    const label = encodeURIComponent(`${this.config.appName}:${email}`);
    const issuer = encodeURIComponent(this.config.appName);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
  }
  
  /**
   * Base32 encode (simplified version)
   */
  private base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';
    
    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;
      
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    
    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }
    
    return output;
  }
  
  /**
   * Base32 decode (simplified version)
   */
  private base32Decode(str: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let index = 0;
    const output = Buffer.alloc(Math.ceil((str.length * 5) / 8));
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i].toUpperCase();
      const val = alphabet.indexOf(char);
      
      if (val === -1) continue;
      
      value = (value << 5) | val;
      bits += 5;
      
      if (bits >= 8) {
        output[index++] = (value >>> (bits - 8)) & 255;
        bits -= 8;
      }
    }
    
    return output.slice(0, index);
  }
}

/**
 * Factory function to create 2FA service
 */
export function createTwoFactorAuthService(
  storage?: ITwoFactorStorage,
  config?: Partial<TwoFactorConfig>
): TwoFactorAuthService {
  return new TwoFactorAuthService(
    storage || new InMemoryTwoFactorStorage(),
    config
  );
}
