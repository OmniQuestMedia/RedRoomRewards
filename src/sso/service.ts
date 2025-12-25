/**
 * SSO Service
 * 
 * Manages Single Sign-On authentication with secure session management
 * and token validation with expiry handling.
 */

import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  SSOToken,
  TokenClaims,
  Session,
  SessionStatus,
  TokenValidationResult,
  AuthRequest,
  AuthResponse,
  LogoutRequest,
  SSOConfig,
} from './types';

/**
 * Simple JWT-like token implementation
 * In production, use a proper JWT library like jsonwebtoken
 */
class SimpleJWT {
  private secret: string;
  
  constructor(secret: string) {
    this.secret = secret;
  }
  
  /**
   * Create a token
   */
  sign(payload: any, expiresIn: number): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };
    
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      ...payload,
      iat: now,
      exp: now + expiresIn,
    };
    
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const claimsB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${headerB64}.${claimsB64}`)
      .digest('base64url');
    
    return `${headerB64}.${claimsB64}.${signature}`;
  }
  
  /**
   * Verify and decode a token
   */
  verify(token: string): TokenClaims | null {
    try {
      const [headerB64, claimsB64, signatureB64] = token.split('.');
      
      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(`${headerB64}.${claimsB64}`)
        .digest('base64url');
      
      if (signatureB64 !== expectedSignature) {
        return null;
      }
      
      // Decode claims
      const claims = JSON.parse(
        Buffer.from(claimsB64, 'base64url').toString('utf8')
      );
      
      // Check expiry
      const now = Math.floor(Date.now() / 1000);
      if (claims.exp && claims.exp < now) {
        return null;
      }
      
      return claims;
    } catch (error) {
      return null;
    }
  }
}

/**
 * In-memory storage for sessions
 * In production, this would be Redis or similar
 */
class SessionStore {
  private sessions = new Map<string, Session>();
  
  save(session: Session): void {
    this.sessions.set(session.sessionId, session);
  }
  
  get(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }
  
  getByUserId(userId: string): Session[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.userId === userId && s.status === SessionStatus.ACTIVE
    );
  }
  
  updateStatus(sessionId: string, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      if (status === SessionStatus.INVALIDATED) {
        session.invalidatedAt = new Date();
      }
      this.sessions.set(sessionId, session);
    }
  }
  
  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
      this.sessions.set(sessionId, session);
    }
  }
  
  getExpired(): Session[] {
    const now = new Date();
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === SessionStatus.ACTIVE && s.expiresAt < now
    );
  }
}

/**
 * SSO Service Implementation
 */
export class SSOService {
  private jwt: SimpleJWT;
  private store = new SessionStore();
  private config: SSOConfig;
  private expiryInterval: NodeJS.Timeout | null = null;
  
  constructor(config: SSOConfig) {
    this.config = config;
    this.jwt = new SimpleJWT(config.jwtSecret);
  }
  
  /**
   * Authenticate and create session
   */
  async authenticate(request: AuthRequest): Promise<AuthResponse> {
    // In production, validate credentials against user database
    // For now, mock authentication
    const userId = request.credentials.email
      ? `user-${crypto.createHash('md5').update(request.credentials.email).digest('hex').substring(0, 8)}`
      : uuidv4();
    
    // Create token claims
    const claims: TokenClaims = {
      userId,
      email: request.credentials.email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.config.tokenExpirySeconds,
      iss: this.config.issuer,
      sub: userId,
    };
    
    // Generate token
    const token = this.jwt.sign(claims, this.config.tokenExpirySeconds);
    
    // Create session
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.tokenExpirySeconds * 1000);
    
    const session: Session = {
      sessionId,
      userId,
      token,
      status: SessionStatus.ACTIVE,
      createdAt: now,
      expiresAt,
      lastActivityAt: now,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      metadata: request.metadata,
    };
    
    this.store.save(session);
    
    // Create response
    const ssoToken: SSOToken = {
      token,
      tokenType: 'Bearer',
      expiresIn: this.config.tokenExpirySeconds,
      claims,
    };
    
    return {
      token: ssoToken,
      sessionId,
      user: {
        userId,
        email: request.credentials.email,
      },
      timestamp: now,
    };
  }
  
  /**
   * Validate a token
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    const claims = this.jwt.verify(token);
    
    if (!claims) {
      return {
        valid: false,
        error: 'Invalid or expired token',
        timestamp: new Date(),
      };
    }
    
    return {
      valid: true,
      claims,
      timestamp: new Date(),
    };
  }
  
  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const session = this.store.get(sessionId);
    
    // Check expiry
    if (session && session.status === SessionStatus.ACTIVE) {
      if (session.expiresAt < new Date()) {
        this.store.updateStatus(sessionId, SessionStatus.EXPIRED);
        return { ...session, status: SessionStatus.EXPIRED };
      }
      
      // Update activity
      this.store.updateActivity(sessionId);
    }
    
    return session;
  }
  
  /**
   * Logout (invalidate session)
   */
  async logout(request: LogoutRequest): Promise<void> {
    this.store.updateStatus(request.sessionId, SessionStatus.INVALIDATED);
  }
  
  /**
   * Logout all sessions for a user
   */
  async logoutAll(userId: string): Promise<number> {
    const sessions = this.store.getByUserId(userId);
    for (const session of sessions) {
      this.store.updateStatus(session.sessionId, SessionStatus.INVALIDATED);
    }
    return sessions.length;
  }
  
  /**
   * Process expired sessions (background job)
   */
  async processExpiredSessions(): Promise<number> {
    const expired = this.store.getExpired();
    for (const session of expired) {
      this.store.updateStatus(session.sessionId, SessionStatus.EXPIRED);
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
      this.processExpiredSessions();
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
