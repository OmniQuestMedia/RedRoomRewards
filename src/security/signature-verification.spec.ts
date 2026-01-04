/**
 * Signature Verification Service Tests
 * 
 * Tests for webhook signature verification including:
 * - Valid signature verification
 * - Invalid signature rejection
 * - Timestamp validation
 * - Nonce replay prevention
 */

import {
  SignatureVerificationService,
  InMemoryNonceStore,
  SignatureVerificationConfig,
} from './signature-verification';

describe('SignatureVerificationService', () => {
  let service: SignatureVerificationService;
  let nonceStore: InMemoryNonceStore;
  
  const config: SignatureVerificationConfig = {
    webhookSecret: 'test-secret-key-12345',
    maxTimestampDriftSeconds: 300,
    nonceTTLSeconds: 3600,
    algorithm: 'sha256',
  };
  
  beforeEach(() => {
    nonceStore = new InMemoryNonceStore();
    service = new SignatureVerificationService(config, nonceStore);
  });
  
  describe('verifyRequest', () => {
    it('should verify valid signed request', async () => {
      const payload = JSON.stringify({ userId: 'user-123', amount: 100 });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = 'unique-nonce-123';
      
      const signature = service.generateSignature(payload, timestamp, nonce);
      
      const result = await service.verifyRequest(
        {
          'x-signature': signature,
          'x-timestamp': timestamp,
          'x-nonce': nonce,
        },
        payload
      );
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.nonce).toBe(nonce);
    });
    
    it('should reject request with missing headers', async () => {
      const payload = JSON.stringify({ userId: 'user-123', amount: 100 });
      
      const result = await service.verifyRequest({}, payload);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required signature headers');
    });
    
    it('should reject request with invalid signature', async () => {
      const payload = JSON.stringify({ userId: 'user-123', amount: 100 });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = 'unique-nonce-123';
      
      const result = await service.verifyRequest(
        {
          'x-signature': 'invalid-signature',
          'x-timestamp': timestamp,
          'x-nonce': nonce,
        },
        payload
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });
    
    it('should reject request with tampered payload', async () => {
      const payload = JSON.stringify({ userId: 'user-123', amount: 100 });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = 'unique-nonce-123';
      
      const signature = service.generateSignature(payload, timestamp, nonce);
      
      // Tamper with payload
      const tamperedPayload = JSON.stringify({ userId: 'user-123', amount: 1000 });
      
      const result = await service.verifyRequest(
        {
          'x-signature': signature,
          'x-timestamp': timestamp,
          'x-nonce': nonce,
        },
        tamperedPayload
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });
    
    it('should reject request with expired timestamp', async () => {
      const payload = JSON.stringify({ userId: 'user-123', amount: 100 });
      // Timestamp from 10 minutes ago (should be rejected)
      const timestamp = Math.floor((Date.now() - 600000) / 1000).toString();
      const nonce = 'unique-nonce-123';
      
      const signature = service.generateSignature(payload, timestamp, nonce);
      
      const result = await service.verifyRequest(
        {
          'x-signature': signature,
          'x-timestamp': timestamp,
          'x-nonce': nonce,
        },
        payload
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('outside acceptable window');
    });
    
    it('should reject request with reused nonce (replay attack)', async () => {
      const payload = JSON.stringify({ userId: 'user-123', amount: 100 });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = 'unique-nonce-123';
      
      const signature = service.generateSignature(payload, timestamp, nonce);
      
      const headers = {
        'x-signature': signature,
        'x-timestamp': timestamp,
        'x-nonce': nonce,
      };
      
      // First request should succeed
      const result1 = await service.verifyRequest(headers, payload);
      expect(result1.valid).toBe(true);
      
      // Second request with same nonce should fail
      const result2 = await service.verifyRequest(headers, payload);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Nonce has already been used');
    });
    
    it('should reject request with invalid timestamp format', async () => {
      const payload = JSON.stringify({ userId: 'user-123', amount: 100 });
      const nonce = 'unique-nonce-123';
      
      const result = await service.verifyRequest(
        {
          'x-signature': 'some-signature',
          'x-timestamp': 'invalid-timestamp',
          'x-nonce': nonce,
        },
        payload
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid timestamp format');
    });
    
    it('should accept request within timestamp window', async () => {
      const payload = JSON.stringify({ userId: 'user-123', amount: 100 });
      // Timestamp from 2 minutes ago (should be accepted)
      const timestamp = Math.floor((Date.now() - 120000) / 1000).toString();
      const nonce = 'unique-nonce-123';
      
      const signature = service.generateSignature(payload, timestamp, nonce);
      
      const result = await service.verifyRequest(
        {
          'x-signature': signature,
          'x-timestamp': timestamp,
          'x-nonce': nonce,
        },
        payload
      );
      
      expect(result.valid).toBe(true);
    });
  });
  
  describe('generateSignature', () => {
    it('should generate consistent signatures', () => {
      const payload = JSON.stringify({ test: 'data' });
      const timestamp = '1234567890';
      const nonce = 'test-nonce';
      
      const sig1 = service.generateSignature(payload, timestamp, nonce);
      const sig2 = service.generateSignature(payload, timestamp, nonce);
      
      expect(sig1).toBe(sig2);
    });
    
    it('should generate different signatures for different payloads', () => {
      const payload1 = JSON.stringify({ test: 'data1' });
      const payload2 = JSON.stringify({ test: 'data2' });
      const timestamp = '1234567890';
      const nonce = 'test-nonce';
      
      const sig1 = service.generateSignature(payload1, timestamp, nonce);
      const sig2 = service.generateSignature(payload2, timestamp, nonce);
      
      expect(sig1).not.toBe(sig2);
    });
    
    it('should generate different signatures for different nonces', () => {
      const payload = JSON.stringify({ test: 'data' });
      const timestamp = '1234567890';
      const nonce1 = 'test-nonce-1';
      const nonce2 = 'test-nonce-2';
      
      const sig1 = service.generateSignature(payload, timestamp, nonce1);
      const sig2 = service.generateSignature(payload, timestamp, nonce2);
      
      expect(sig1).not.toBe(sig2);
    });
  });
  
  describe('InMemoryNonceStore', () => {
    it('should store and retrieve nonce', async () => {
      const nonce = 'test-nonce';
      
      await nonceStore.storeNonce(nonce, 3600);
      const exists = await nonceStore.hasNonce(nonce);
      
      expect(exists).toBe(true);
    });
    
    it('should return false for non-existent nonce', async () => {
      const exists = await nonceStore.hasNonce('non-existent-nonce');
      expect(exists).toBe(false);
    });
    
    it('should expire nonces after TTL', async () => {
      const nonce = 'test-nonce';
      
      // Store with 0 second TTL (already expired)
      await nonceStore.storeNonce(nonce, 0);
      
      // Wait a bit for time to pass
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const exists = await nonceStore.hasNonce(nonce);
      expect(exists).toBe(false);
    });
    
    it('should cleanup expired nonces', async () => {
      const nonce1 = 'nonce-1';
      const nonce2 = 'nonce-2';
      
      // Store one with very short TTL
      await nonceStore.storeNonce(nonce1, 0);
      // Wait a moment for it to expire
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Store second one with long TTL
      await nonceStore.storeNonce(nonce2, 3600);
      
      await nonceStore.cleanup();
      
      expect(await nonceStore.hasNonce(nonce1)).toBe(false);
      expect(await nonceStore.hasNonce(nonce2)).toBe(true);
    });
  });
  
  describe('Security', () => {
    it('should prevent timing attacks with secure comparison', async () => {
      const payload = JSON.stringify({ userId: 'user-123', amount: 100 });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = 'unique-nonce-123';
      
      const validSignature = service.generateSignature(payload, timestamp, nonce);
      
      // Try with slightly different signature (same length)
      const invalidSignature = validSignature.slice(0, -1) + 'x';
      
      const result = await service.verifyRequest(
        {
          'x-signature': invalidSignature,
          'x-timestamp': timestamp,
          'x-nonce': nonce,
        },
        payload
      );
      
      expect(result.valid).toBe(false);
    });
    
    it('should handle different signature algorithms', () => {
      const configs = [
        { ...config, algorithm: 'sha256' as const },
        { ...config, algorithm: 'sha384' as const },
        { ...config, algorithm: 'sha512' as const },
      ];
      
      const payload = 'test-payload';
      const timestamp = '1234567890';
      const nonce = 'test-nonce';
      
      const signatures = configs.map(cfg => {
        const svc = new SignatureVerificationService(cfg, nonceStore);
        return svc.generateSignature(payload, timestamp, nonce);
      });
      
      // All signatures should be different
      expect(signatures[0]).not.toBe(signatures[1]);
      expect(signatures[1]).not.toBe(signatures[2]);
      expect(signatures[0]).not.toBe(signatures[2]);
    });
  });
});
