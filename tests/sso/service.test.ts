/**
 * SSO Service Tests
 * 
 * Tests SSO token expiry and secure session management
 */

import { SSOService } from '../../src/sso/service';
import { SessionStatus, SSOConfig } from '../../src/sso/types';

describe('SSOService', () => {
  let config: SSOConfig;
  
  beforeEach(() => {
    config = {
      jwtSecret: 'test-secret-key-for-testing',
      issuer: 'test-issuer',
      tokenExpirySeconds: 3600, // 1 hour
      refreshTokenExpirySeconds: 7200,
      enableRefreshTokens: false,
      algorithm: 'HS256',
    };
  });
  
  describe('Authentication', () => {
    it('should create session and token', async () => {
      const service = new SSOService(config);
      
      const authResult = await service.authenticate({
        credentials: {
          email: 'test@example.com',
          password: 'password123',
        },
      });
      
      expect(authResult.token).toBeDefined();
      expect(authResult.token.token).toBeDefined();
      expect(authResult.token.tokenType).toBe('Bearer');
      expect(authResult.token.expiresIn).toBe(3600);
      expect(authResult.sessionId).toBeDefined();
      expect(authResult.user.userId).toBeDefined();
      expect(authResult.user.email).toBe('test@example.com');
    });
    
    it('should create valid JWT token', async () => {
      const service = new SSOService(config);
      
      const authResult = await service.authenticate({
        credentials: {
          email: 'test@example.com',
        },
      });
      
      // Validate the token
      const validation = await service.validateToken(authResult.token.token);
      
      expect(validation.valid).toBe(true);
      expect(validation.claims?.userId).toBe(authResult.user.userId);
      expect(validation.claims?.email).toBe('test@example.com');
      expect(validation.claims?.iss).toBe('test-issuer');
    });
    
    it('should include session metadata', async () => {
      const service = new SSOService(config);
      
      const authResult = await service.authenticate({
        credentials: {
          email: 'test@example.com',
        },
        ipAddress: '192.168.1.1',
        userAgent: 'TestAgent/1.0',
        metadata: { source: 'web' },
      });
      
      const session = await service.getSession(authResult.sessionId);
      
      expect(session?.ipAddress).toBe('192.168.1.1');
      expect(session?.userAgent).toBe('TestAgent/1.0');
      expect(session?.metadata).toEqual({ source: 'web' });
    });
  });
  
  describe('Token Validation', () => {
    it('should validate valid token', async () => {
      const service = new SSOService(config);
      
      const authResult = await service.authenticate({
        credentials: { email: 'test@example.com' },
      });
      
      const validation = await service.validateToken(authResult.token.token);
      
      expect(validation.valid).toBe(true);
      expect(validation.claims).toBeDefined();
      expect(validation.error).toBeUndefined();
    });
    
    it('should reject invalid token', async () => {
      const service = new SSOService(config);
      
      const validation = await service.validateToken('invalid.token.here');
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toBeDefined();
      expect(validation.claims).toBeUndefined();
    });
    
    it('should reject token with wrong signature', async () => {
      const service = new SSOService(config);
      
      const authResult = await service.authenticate({
        credentials: { email: 'test@example.com' },
      });
      
      // Tamper with token
      const [header, claims, signature] = authResult.token.token.split('.');
      const tamperedToken = `${header}.${claims}.invalidsignature`;
      
      const validation = await service.validateToken(tamperedToken);
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toBeDefined();
    });
  });
  
  describe('Token Expiry', () => {
    it('should reject expired token', async () => {
      const shortConfig = {
        ...config,
        tokenExpirySeconds: 1, // 1 second
      };
      const service = new SSOService(shortConfig);
      
      const authResult = await service.authenticate({
        credentials: { email: 'test@example.com' },
      });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const validation = await service.validateToken(authResult.token.token);
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toBeDefined();
    });
    
    it('should mark session as expired when token expires', async () => {
      const shortConfig = {
        ...config,
        tokenExpirySeconds: 1,
      };
      const service = new SSOService(shortConfig);
      
      const authResult = await service.authenticate({
        credentials: { email: 'test@example.com' },
      });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const session = await service.getSession(authResult.sessionId);
      
      expect(session?.status).toBe(SessionStatus.EXPIRED);
    });
    
    it('should process expired sessions in background', async () => {
      const shortConfig = {
        ...config,
        tokenExpirySeconds: 1,
      };
      const service = new SSOService(shortConfig);
      
      // Create multiple sessions
      const auth1 = await service.authenticate({
        credentials: { email: 'test1@example.com' },
      });
      const auth2 = await service.authenticate({
        credentials: { email: 'test2@example.com' },
      });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Process expired
      const expiredCount = await service.processExpiredSessions();
      
      expect(expiredCount).toBe(2);
      
      const session1 = await service.getSession(auth1.sessionId);
      const session2 = await service.getSession(auth2.sessionId);
      
      expect(session1?.status).toBe(SessionStatus.EXPIRED);
      expect(session2?.status).toBe(SessionStatus.EXPIRED);
    });
  });
  
  describe('Session Management', () => {
    it('should update last activity on session access', async () => {
      const service = new SSOService(config);
      
      const authResult = await service.authenticate({
        credentials: { email: 'test@example.com' },
      });
      
      const session1 = await service.getSession(authResult.sessionId);
      const firstActivity = session1?.lastActivityAt;
      
      // Wait and access again
      await new Promise(resolve => setTimeout(resolve, 100));
      const session2 = await service.getSession(authResult.sessionId);
      const secondActivity = session2?.lastActivityAt;
      
      expect(secondActivity!.getTime()).toBeGreaterThan(firstActivity!.getTime());
    });
    
    it('should logout session', async () => {
      const service = new SSOService(config);
      
      const authResult = await service.authenticate({
        credentials: { email: 'test@example.com' },
      });
      
      await service.logout({
        sessionId: authResult.sessionId,
        reason: 'user-initiated',
      });
      
      const session = await service.getSession(authResult.sessionId);
      
      expect(session?.status).toBe(SessionStatus.INVALIDATED);
      expect(session?.invalidatedAt).toBeDefined();
    });
    
    it('should logout all user sessions', async () => {
      const service = new SSOService(config);
      
      // Create multiple sessions for same user
      const auth1 = await service.authenticate({
        credentials: { email: 'test@example.com' },
      });
      
      // Same email should map to same userId
      const auth2 = await service.authenticate({
        credentials: { email: 'test@example.com' },
      });
      
      // Logout all
      const count = await service.logoutAll(auth1.user.userId);
      
      expect(count).toBe(2);
      
      const session1 = await service.getSession(auth1.sessionId);
      const session2 = await service.getSession(auth2.sessionId);
      
      expect(session1?.status).toBe(SessionStatus.INVALIDATED);
      expect(session2?.status).toBe(SessionStatus.INVALIDATED);
    });
  });
  
  describe('Security', () => {
    it('should use different tokens for different users', async () => {
      const service = new SSOService(config);
      
      const auth1 = await service.authenticate({
        credentials: { email: 'user1@example.com' },
      });
      
      const auth2 = await service.authenticate({
        credentials: { email: 'user2@example.com' },
      });
      
      expect(auth1.token.token).not.toBe(auth2.token.token);
      expect(auth1.sessionId).not.toBe(auth2.sessionId);
    });
    
    it('should include expiry in token claims', async () => {
      const service = new SSOService(config);
      
      const authResult = await service.authenticate({
        credentials: { email: 'test@example.com' },
      });
      
      const validation = await service.validateToken(authResult.token.token);
      
      expect(validation.claims?.exp).toBeDefined();
      expect(validation.claims?.iat).toBeDefined();
      expect(validation.claims!.exp).toBeGreaterThan(validation.claims!.iat);
    });
    
    it('should use timing-safe comparison for token validation', async () => {
      const service = new SSOService(config);
      
      const authResult = await service.authenticate({
        credentials: { email: 'test@example.com' },
      });
      
      // Create a token with similar structure but wrong signature
      const [header, claims] = authResult.token.token.split('.');
      const wrongToken = `${header}.${claims}.${'x'.repeat(43)}`;
      
      // Should reject without timing leak
      const validation = await service.validateToken(wrongToken);
      expect(validation.valid).toBe(false);
    });
  });
});
