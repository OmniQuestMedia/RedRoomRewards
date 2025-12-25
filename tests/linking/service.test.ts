/**
 * Linking Service Tests
 * 
 * Tests secure linking and deep-link proof
 */

import { LinkingService } from '../../src/linking/service';
import { LinkStatus, LinkingConfig } from '../../src/linking/types';

describe('LinkingService', () => {
  let config: LinkingConfig;
  
  beforeEach(() => {
    config = {
      deepLinkBaseUrl: 'https://example.com/link',
      defaultTtlSeconds: 300,
      maxTtlSeconds: 3600,
      enableDeepLinkProof: true,
    };
  });
  
  describe('Link Creation', () => {
    it('should create a link with verification token', async () => {
      const service = new LinkingService(config);
      
      const linkResult = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
      });
      
      expect(linkResult.linkId).toBeDefined();
      expect(linkResult.verificationToken).toBeDefined();
      expect(linkResult.deepLinkUrl).toContain(linkResult.linkId);
      expect(linkResult.deepLinkUrl).toContain(linkResult.verificationToken);
      expect(linkResult.expiresAt).toBeInstanceOf(Date);
    });
    
    it('should generate deep-link URL', async () => {
      const service = new LinkingService(config);
      
      const linkResult = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
      });
      
      expect(linkResult.deepLinkUrl).toMatch(/^https:\/\/example\.com\/link\?/);
      expect(linkResult.deepLinkUrl).toContain(`linkId=${linkResult.linkId}`);
      expect(linkResult.deepLinkUrl).toContain(`token=${linkResult.verificationToken}`);
    });
    
    it('should respect custom TTL', async () => {
      const service = new LinkingService(config);
      
      const linkResult = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
        ttlSeconds: 600,
      });
      
      const ttlMs = linkResult.expiresAt.getTime() - linkResult.timestamp.getTime();
      expect(ttlMs).toBeGreaterThan(590000);
      expect(ttlMs).toBeLessThan(610000);
    });
    
    it('should prevent duplicate external account links', async () => {
      const service = new LinkingService(config);
      
      // Create first link
      await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
      });
      
      // Verify and activate it
      const link1 = (await service.getUserLinks('user-1'))[0];
      await service.verifyLink({
        linkId: link1.linkId,
        verificationToken: link1.verificationToken,
      });
      
      // Try to create another link with same external account
      await expect(
        service.createLink({
          userId: 'user-2',
          externalAccountId: 'ext-123', // Same external account
          provider: 'oauth-provider',
        })
      ).rejects.toThrow('already linked');
    });
  });
  
  describe('Link Verification with Deep-Link Proof', () => {
    it('should verify link with correct token', async () => {
      const service = new LinkingService(config);
      
      const linkResult = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
      });
      
      const verifyResult = await service.verifyLink({
        linkId: linkResult.linkId,
        verificationToken: linkResult.verificationToken,
      });
      
      expect(verifyResult.verified).toBe(true);
      expect(verifyResult.link).toBeDefined();
      expect(verifyResult.link?.status).toBe(LinkStatus.ACTIVE);
      expect(verifyResult.link?.verifiedAt).toBeDefined();
    });
    
    it('should reject verification with wrong token', async () => {
      const service = new LinkingService(config);
      
      const linkResult = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
      });
      
      const verifyResult = await service.verifyLink({
        linkId: linkResult.linkId,
        verificationToken: 'wrong-token',
      });
      
      expect(verifyResult.verified).toBe(false);
      expect(verifyResult.error).toContain('Invalid verification token');
    });
    
    it('should use timing-safe comparison for tokens', async () => {
      const service = new LinkingService(config);
      
      const linkResult = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
      });
      
      // Try with token that's slightly different
      const wrongToken = linkResult.verificationToken.slice(0, -1) + 'x';
      
      const verifyResult = await service.verifyLink({
        linkId: linkResult.linkId,
        verificationToken: wrongToken,
      });
      
      expect(verifyResult.verified).toBe(false);
    });
    
    it('should reject verification of non-existent link', async () => {
      const service = new LinkingService(config);
      
      const verifyResult = await service.verifyLink({
        linkId: 'non-existent-link',
        verificationToken: 'some-token',
      });
      
      expect(verifyResult.verified).toBe(false);
      expect(verifyResult.error).toContain('not found');
    });
    
    it('should reject verification of already verified link', async () => {
      const service = new LinkingService(config);
      
      const linkResult = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
      });
      
      // First verification succeeds
      await service.verifyLink({
        linkId: linkResult.linkId,
        verificationToken: linkResult.verificationToken,
      });
      
      // Second verification should fail
      const verifyResult2 = await service.verifyLink({
        linkId: linkResult.linkId,
        verificationToken: linkResult.verificationToken,
      });
      
      expect(verifyResult2.verified).toBe(false);
      expect(verifyResult2.error).toContain('active');
    });
  });
  
  describe('Link Expiry', () => {
    it('should reject verification of expired link', async () => {
      const service = new LinkingService(config);
      
      const linkResult = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
        ttlSeconds: 1,
      });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const verifyResult = await service.verifyLink({
        linkId: linkResult.linkId,
        verificationToken: linkResult.verificationToken,
      });
      
      expect(verifyResult.verified).toBe(false);
      expect(verifyResult.error).toContain('expired');
      
      // Check link is marked as expired
      const link = await service.getLink(linkResult.linkId);
      expect(link?.status).toBe(LinkStatus.EXPIRED);
    });
    
    it('should process expired links in background', async () => {
      const service = new LinkingService(config);
      
      // Create multiple links with short TTL
      await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-1',
        provider: 'provider-1',
        ttlSeconds: 1,
      });
      
      await service.createLink({
        userId: 'user-2',
        externalAccountId: 'ext-2',
        provider: 'provider-1',
        ttlSeconds: 1,
      });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const expiredCount = await service.processExpiredLinks();
      
      expect(expiredCount).toBe(2);
    });
  });
  
  describe('Link Management', () => {
    it('should get user links', async () => {
      const service = new LinkingService(config);
      
      const link1Result = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-1',
        provider: 'provider-1',
      });
      
      const link2Result = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-2',
        provider: 'provider-2',
      });
      
      // Verify both
      await service.verifyLink({
        linkId: link1Result.linkId,
        verificationToken: link1Result.verificationToken,
      });
      await service.verifyLink({
        linkId: link2Result.linkId,
        verificationToken: link2Result.verificationToken,
      });
      
      const userLinks = await service.getUserLinks('user-1');
      
      expect(userLinks).toHaveLength(2);
      expect(userLinks.every(l => l.status === LinkStatus.ACTIVE)).toBe(true);
    });
    
    it('should check if external account is linked', async () => {
      const service = new LinkingService(config);
      
      const linkResult = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
      });
      
      await service.verifyLink({
        linkId: linkResult.linkId,
        verificationToken: linkResult.verificationToken,
      });
      
      const linkedAccount = await service.isLinked('ext-123', 'oauth-provider');
      
      expect(linkedAccount).toBeDefined();
      expect(linkedAccount?.primaryUserId).toBe('user-1');
      expect(linkedAccount?.status).toBe(LinkStatus.ACTIVE);
    });
    
    it('should revoke link', async () => {
      const service = new LinkingService(config);
      
      const linkResult = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
      });
      
      await service.verifyLink({
        linkId: linkResult.linkId,
        verificationToken: linkResult.verificationToken,
      });
      
      await service.revokeLink({
        linkId: linkResult.linkId,
        userId: 'user-1',
        reason: 'user-requested',
      });
      
      const link = await service.getLink(linkResult.linkId);
      expect(link?.status).toBe(LinkStatus.REVOKED);
      expect(link?.revokedAt).toBeDefined();
    });
    
    it('should prevent unauthorized revocation', async () => {
      const service = new LinkingService(config);
      
      const linkResult = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-123',
        provider: 'oauth-provider',
      });
      
      await service.verifyLink({
        linkId: linkResult.linkId,
        verificationToken: linkResult.verificationToken,
      });
      
      // Try to revoke with different user
      await expect(
        service.revokeLink({
          linkId: linkResult.linkId,
          userId: 'user-2', // Wrong user
          reason: 'unauthorized',
        })
      ).rejects.toThrow('Unauthorized');
    });
  });
  
  describe('Security', () => {
    it('should use cryptographically secure tokens', async () => {
      const service = new LinkingService(config);
      
      const link1Result = await service.createLink({
        userId: 'user-1',
        externalAccountId: 'ext-1',
        provider: 'provider-1',
      });
      
      const link2Result = await service.createLink({
        userId: 'user-2',
        externalAccountId: 'ext-2',
        provider: 'provider-1',
      });
      
      // Tokens should be different
      expect(link1Result.verificationToken).not.toBe(link2Result.verificationToken);
      
      // Tokens should be long enough (32 bytes hex = 64 characters)
      expect(link1Result.verificationToken.length).toBe(64);
      expect(link2Result.verificationToken.length).toBe(64);
    });
  });
});
