/**
 * Linking Service
 * 
 * Manages secure account linking with deep-link proof mechanism.
 * Ensures safe connection between primary and external accounts.
 */

import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  AccountLink,
  LinkStatus,
  LinkRequest,
  LinkResponse,
  VerificationRequest,
  VerificationResponse,
  RevocationRequest,
  LinkingConfig,
} from './types';

/**
 * In-memory storage for account links
 * In production, this would be a database
 */
class LinkStore {
  private links = new Map<string, AccountLink>();
  
  save(link: AccountLink): void {
    this.links.set(link.linkId, link);
  }
  
  get(linkId: string): AccountLink | null {
    return this.links.get(linkId) || null;
  }
  
  getByUserId(userId: string): AccountLink[] {
    return Array.from(this.links.values()).filter(
      (l) => l.primaryUserId === userId && l.status === LinkStatus.ACTIVE
    );
  }
  
  getByExternalAccount(
    externalAccountId: string,
    provider: string
  ): AccountLink | null {
    return (
      Array.from(this.links.values()).find(
        (l) =>
          l.externalAccountId === externalAccountId &&
          l.provider === provider &&
          l.status === LinkStatus.ACTIVE
      ) || null
    );
  }
  
  updateStatus(linkId: string, status: LinkStatus): void {
    const link = this.links.get(linkId);
    if (link) {
      link.status = status;
      if (status === LinkStatus.ACTIVE) {
        link.verifiedAt = new Date();
      } else if (status === LinkStatus.REVOKED) {
        link.revokedAt = new Date();
      }
      this.links.set(linkId, link);
    }
  }
  
  getExpired(): AccountLink[] {
    const now = new Date();
    return Array.from(this.links.values()).filter(
      (l) => l.status === LinkStatus.PENDING && l.expiresAt < now
    );
  }
}

/**
 * Linking Service Implementation
 */
export class LinkingService {
  private store = new LinkStore();
  private config: LinkingConfig;
  private readonly DEFAULT_TTL_SECONDS = 300; // 5 minutes
  private expiryInterval: NodeJS.Timeout | null = null;
  
  constructor(config: LinkingConfig) {
    this.config = config;
  }
  
  /**
   * Create a link request
   */
  async createLink(request: LinkRequest): Promise<LinkResponse> {
    // Check if external account is already linked
    const existing = this.store.getByExternalAccount(
      request.externalAccountId,
      request.provider
    );
    
    if (existing) {
      throw new Error(
        `External account ${request.externalAccountId} is already linked`
      );
    }
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Calculate expiry
    const ttlSeconds = Math.min(
      request.ttlSeconds || this.DEFAULT_TTL_SECONDS,
      this.config.maxTtlSeconds
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    
    // Create link
    const linkId = uuidv4();
    const link: AccountLink = {
      linkId,
      primaryUserId: request.userId,
      externalAccountId: request.externalAccountId,
      provider: request.provider,
      status: LinkStatus.PENDING,
      verificationToken,
      createdAt: now,
      expiresAt,
      metadata: request.metadata,
    };
    
    this.store.save(link);
    
    // Generate deep-link URL
    const deepLinkUrl = this.generateDeepLink(linkId, verificationToken);
    
    return {
      linkId,
      verificationToken,
      deepLinkUrl,
      expiresAt,
      timestamp: now,
    };
  }
  
  /**
   * Generate deep-link URL
   */
  private generateDeepLink(linkId: string, token: string): string {
    const params = new URLSearchParams({
      linkId,
      token,
    });
    return `${this.config.deepLinkBaseUrl}?${params.toString()}`;
  }
  
  /**
   * Verify a link using deep-link proof
   */
  async verifyLink(request: VerificationRequest): Promise<VerificationResponse> {
    const link = this.store.get(request.linkId);
    
    if (!link) {
      return {
        linkId: request.linkId,
        verified: false,
        error: 'Link not found',
        timestamp: new Date(),
      };
    }
    
    // Check status
    if (link.status !== LinkStatus.PENDING) {
      return {
        linkId: request.linkId,
        verified: false,
        error: `Link is ${link.status}`,
        timestamp: new Date(),
      };
    }
    
    // Check expiry
    if (link.expiresAt < new Date()) {
      this.store.updateStatus(request.linkId, LinkStatus.EXPIRED);
      return {
        linkId: request.linkId,
        verified: false,
        error: 'Link has expired',
        timestamp: new Date(),
      };
    }
    
    // Verify token (timing-safe comparison)
    // Pad tokens to fixed length to prevent length-based timing leaks
    const FIXED_TOKEN_LENGTH = 128; // Accommodate longest possible token
    const expectedToken = Buffer.from(
      link.verificationToken.padEnd(FIXED_TOKEN_LENGTH, '\0'),
      'utf8'
    );
    const providedToken = Buffer.from(
      request.verificationToken.padEnd(FIXED_TOKEN_LENGTH, '\0'),
      'utf8'
    );
    
    // Compare using timing-safe comparison
    let isValid = true;
    try {
      isValid = crypto.timingSafeEqual(expectedToken, providedToken);
    } catch {
      isValid = false;
    }
    
    if (!isValid) {
      return {
        linkId: request.linkId,
        verified: false,
        error: 'Invalid verification token',
        timestamp: new Date(),
      };
    }
    
    // Activate link
    this.store.updateStatus(request.linkId, LinkStatus.ACTIVE);
    
    const updatedLink = this.store.get(request.linkId)!;
    return {
      linkId: request.linkId,
      verified: true,
      link: updatedLink,
      timestamp: new Date(),
    };
  }
  
  /**
   * Get link by ID
   */
  async getLink(linkId: string): Promise<AccountLink | null> {
    return this.store.get(linkId);
  }
  
  /**
   * Get all links for a user
   */
  async getUserLinks(userId: string): Promise<AccountLink[]> {
    return this.store.getByUserId(userId);
  }
  
  /**
   * Revoke a link
   */
  async revokeLink(request: RevocationRequest): Promise<void> {
    const link = this.store.get(request.linkId);
    
    if (!link) {
      throw new Error('Link not found');
    }
    
    // Verify ownership
    if (link.primaryUserId !== request.userId) {
      throw new Error('Unauthorized: user does not own this link');
    }
    
    // Revoke
    this.store.updateStatus(request.linkId, LinkStatus.REVOKED);
  }
  
  /**
   * Check if external account is linked
   */
  async isLinked(
    externalAccountId: string,
    provider: string
  ): Promise<AccountLink | null> {
    return this.store.getByExternalAccount(externalAccountId, provider);
  }
  
  /**
   * Process expired links (background job)
   */
  async processExpiredLinks(): Promise<number> {
    const expired = this.store.getExpired();
    for (const link of expired) {
      this.store.updateStatus(link.linkId, LinkStatus.EXPIRED);
    }
    return expired.length;
  }
  
  /**
   * Start background expiry processing
   */
  startExpiryProcessing(intervalMs: number = 60000): void {
    if (this.expiryInterval) {
      return;
    }
    
    this.expiryInterval = setInterval(() => {
      this.processExpiredLinks();
    }, intervalMs);
  }
  
  /**
   * Stop background expiry processing
   */
  stopExpiryProcessing(): void {
    if (this.expiryInterval) {
      clearInterval(this.expiryInterval);
      this.expiryInterval = null;
    }
  }
}
