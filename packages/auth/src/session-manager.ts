// Session management with Redis backend
// Production-ready session handling with security features

import { randomBytes } from 'crypto';
import { redis } from '@autoqa/cache';

export interface SessionConfig {
  ttl: number; // Session TTL in seconds
  rolling: boolean; // Extend TTL on activity
  secure: boolean; // HTTPS only
  httpOnly: boolean; // HTTP only (no JS access)
  sameSite: 'strict' | 'lax' | 'none';
  domain?: string;
  path: string;
  cookieName: string;
}

export interface SessionData {
  sessionId: string;
  userId: string;
  username: string;
  email?: string;
  roles: string[];
  permissions: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  username: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
  metadata: Record<string, any>;
}

// Session manager
export class SessionManager {
  private config: Required<SessionConfig>;
  private static readonly SESSION_PREFIX = 'session:';
  private static readonly USER_SESSIONS_PREFIX = 'user_sessions:';
  
  constructor(config: SessionConfig) {
    this.config = {
      ...config,
    };
    
    this.validateConfig();
  }
  
  /**
   * Create new session
   */
  async createSession(data: Omit<SessionData, 'sessionId' | 'createdAt' | 'lastActivity' | 'expiresAt'>): Promise<SessionData> {
    const sessionId = this.generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.ttl * 1000);
    
    const sessionData: SessionData = {
      ...data,
      sessionId,
      createdAt: now,
      lastActivity: now,
      expiresAt,
    };
    
    // Store session data
    await redis.setex(
      `${SessionManager.SESSION_PREFIX}${sessionId}`,
      this.config.ttl,
      JSON.stringify(sessionData)
    );
    
    // Add to user's session list
    await this.addToUserSessions(data.userId, sessionId);
    
    return sessionData;
  }
  
  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const sessionData = await redis.get(`${SessionManager.SESSION_PREFIX}${sessionId}`);
      
      if (!sessionData) {
        return null;
      }
      
      const session: SessionData = JSON.parse(sessionData);
      
      // Check if session is expired
      if (new Date() > new Date(session.expiresAt)) {
        await this.destroySession(sessionId);
        return null;
      }
      
      // Update last activity if rolling sessions
      if (this.config.rolling) {
        await this.updateSessionActivity(sessionId);
      }
      
      return session;
    } catch (error) {
      console.error('Get session error:', error);
      return null;
    }
  }
  
  /**
   * Update session data
   */
  async updateSession(sessionId: string, updates: Partial<Omit<SessionData, 'sessionId' | 'createdAt'>>): Promise<boolean> {
    try {
      const existingSession = await this.getSession(sessionId);
      
      if (!existingSession) {
        return false;
      }
      
      const updatedSession: SessionData = {
        ...existingSession,
        ...updates,
        lastActivity: new Date(),
      };
      
      // If rolling sessions, extend expiry
      if (this.config.rolling) {
        updatedSession.expiresAt = new Date(Date.now() + this.config.ttl * 1000);
      }
      
      const ttl = Math.floor((updatedSession.expiresAt.getTime() - Date.now()) / 1000);
      
      if (ttl > 0) {
        await redis.setex(
          `${SessionManager.SESSION_PREFIX}${sessionId}`,
          ttl,
          JSON.stringify(updatedSession)
        );
        
        return true;
      } else {
        // Session expired, destroy it
        await this.destroySession(sessionId);
        return false;
      }
    } catch (error) {
      console.error('Update session error:', error);
      return false;
    }
  }
  
  /**
   * Destroy session
   */
  async destroySession(sessionId: string): Promise<boolean> {
    try {
      // Get session data to find user ID
      const sessionData = await redis.get(`${SessionManager.SESSION_PREFIX}${sessionId}`);
      
      if (sessionData) {
        const session: SessionData = JSON.parse(sessionData);
        
        // Remove from user's session list
        await this.removeFromUserSessions(session.userId, sessionId);
      }
      
      // Remove session data
      const result = await redis.del(`${SessionManager.SESSION_PREFIX}${sessionId}`);
      
      return result > 0;
    } catch (error) {
      console.error('Destroy session error:', error);
      return false;
    }
  }
  
  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    try {
      const sessionIds = await redis.smembers(`${SessionManager.USER_SESSIONS_PREFIX}${userId}`);
      
      if (sessionIds.length === 0) {
        return [];
      }
      
      const sessions: SessionInfo[] = [];
      
      for (const sessionId of sessionIds) {
        const sessionData = await redis.get(`${SessionManager.SESSION_PREFIX}${sessionId}`);
        
        if (sessionData) {
          const session: SessionData = JSON.parse(sessionData);
          
          // Check if session is still active
          const isActive = new Date() <= new Date(session.expiresAt);
          
          if (!isActive) {
            // Clean up expired session
            await this.destroySession(sessionId);
            continue;
          }
          
          sessions.push({
            sessionId: session.sessionId,
            userId: session.userId,
            username: session.username,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            expiresAt: session.expiresAt,
            isActive,
            metadata: session.metadata,
          });
        } else {
          // Session data not found, remove from user's session list
          await this.removeFromUserSessions(userId, sessionId);
        }
      }
      
      return sessions;
    } catch (error) {
      console.error('Get user sessions error:', error);
      return [];
    }
  }
  
  /**
   * Destroy all sessions for a user
   */
  async destroyUserSessions(userId: string): Promise<number> {
    try {
      const sessionIds = await redis.smembers(`${SessionManager.USER_SESSIONS_PREFIX}${userId}`);
      
      let destroyedCount = 0;
      
      for (const sessionId of sessionIds) {
        const destroyed = await this.destroySession(sessionId);
        if (destroyed) {
          destroyedCount++;
        }
      }
      
      // Clear user's session list
      await redis.del(`${SessionManager.USER_SESSIONS_PREFIX}${userId}`);
      
      return destroyedCount;
    } catch (error) {
      console.error('Destroy user sessions error:', error);
      return 0;
    }
  }
  
  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string): Promise<boolean> {
    try {
      const sessionData = await redis.get(`${SessionManager.SESSION_PREFIX}${sessionId}`);
      
      if (!sessionData) {
        return false;
      }
      
      const session: SessionData = JSON.parse(sessionData);
      session.lastActivity = new Date();
      
      // Extend expiry if rolling sessions
      if (this.config.rolling) {
        session.expiresAt = new Date(Date.now() + this.config.ttl * 1000);
      }
      
      const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
      
      if (ttl > 0) {
        await redis.setex(
          `${SessionManager.SESSION_PREFIX}${sessionId}`,
          ttl,
          JSON.stringify(session)
        );
        
        return true;
      } else {
        // Session expired
        await this.destroySession(sessionId);
        return false;
      }
    } catch (error) {
      console.error('Update session activity error:', error);
      return false;
    }
  }
  
  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const pattern = `${SessionManager.SESSION_PREFIX}*`;
      const keys = await redis.keys(pattern);
      
      let cleanedCount = 0;
      
      for (const key of keys) {
        const sessionData = await redis.get(key);
        
        if (sessionData) {
          const session: SessionData = JSON.parse(sessionData);
          
          if (new Date() > new Date(session.expiresAt)) {
            const sessionId = key.replace(SessionManager.SESSION_PREFIX, '');
            await this.destroySession(sessionId);
            cleanedCount++;
          }
        }
      }
      
      return cleanedCount;
    } catch (error) {
      console.error('Cleanup expired sessions error:', error);
      return 0;
    }
  }
  
  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    userCount: number;
  }> {
    try {
      const sessionKeys = await redis.keys(`${SessionManager.SESSION_PREFIX}*`);
      const userKeys = await redis.keys(`${SessionManager.USER_SESSIONS_PREFIX}*`);
      
      let activeSessions = 0;
      let expiredSessions = 0;
      
      for (const key of sessionKeys) {
        const sessionData = await redis.get(key);
        
        if (sessionData) {
          const session: SessionData = JSON.parse(sessionData);
          
          if (new Date() <= new Date(session.expiresAt)) {
            activeSessions++;
          } else {
            expiredSessions++;
          }
        }
      }
      
      return {
        totalSessions: sessionKeys.length,
        activeSessions,
        expiredSessions,
        userCount: userKeys.length,
      };
    } catch (error) {
      console.error('Get session stats error:', error);
      return {
        totalSessions: 0,
        activeSessions: 0,
        expiredSessions: 0,
        userCount: 0,
      };
    }
  }
  
  /**
   * Generate secure session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('base64url');
  }
  
  /**
   * Add session to user's session list
   */
  private async addToUserSessions(userId: string, sessionId: string): Promise<void> {
    try {
      await redis.sadd(`${SessionManager.USER_SESSIONS_PREFIX}${userId}`, sessionId);
      
      // Set expiry on user sessions set
      await redis.expire(
        `${SessionManager.USER_SESSIONS_PREFIX}${userId}`,
        this.config.ttl + 3600 // Extra hour buffer
      );
    } catch (error) {
      console.error('Add to user sessions error:', error);
    }
  }
  
  /**
   * Remove session from user's session list
   */
  private async removeFromUserSessions(userId: string, sessionId: string): Promise<void> {
    try {
      await redis.srem(`${SessionManager.USER_SESSIONS_PREFIX}${userId}`, sessionId);
    } catch (error) {
      console.error('Remove from user sessions error:', error);
    }
  }
  
  /**
   * Validate session configuration
   */
  private validateConfig(): void {
    if (this.config.ttl <= 0) {
      throw new Error('Session TTL must be positive');
    }
    
    if (!this.config.cookieName) {
      throw new Error('Cookie name is required');
    }
    
    if (!this.config.path) {
      throw new Error('Cookie path is required');
    }
    
    if (!['strict', 'lax', 'none'].includes(this.config.sameSite)) {
      throw new Error('Invalid sameSite value');
    }
  }
}

// Session middleware factory for Express
export function createSessionMiddleware(sessionManager: SessionManager) {
  return {
    /**
     * Load session from cookie
     */
    loadSession: async (req: any, res: any, next: any) => {
      try {
        const sessionId = req.cookies?.[sessionManager['config'].cookieName];
        
        if (sessionId) {
          const session = await sessionManager.getSession(sessionId);
          
          if (session) {
            req.session = session;
            req.sessionId = sessionId;
          }
        }
        
        next();
      } catch (error) {
        console.error('Load session error:', error);
        next();
      }
    },
    
    /**
     * Save session to cookie
     */
    saveSession: (sessionData: Omit<SessionData, 'sessionId' | 'createdAt' | 'lastActivity' | 'expiresAt'>) => {
      return async (req: any, res: any, next: any) => {
        try {
          const session = await sessionManager.createSession({
            ...sessionData,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
          });
          
          // Set session cookie
          res.cookie(sessionManager['config'].cookieName, session.sessionId, {
            maxAge: sessionManager['config'].ttl * 1000,
            httpOnly: sessionManager['config'].httpOnly,
            secure: sessionManager['config'].secure,
            sameSite: sessionManager['config'].sameSite,
            domain: sessionManager['config'].domain,
            path: sessionManager['config'].path,
          });
          
          req.session = session;
          req.sessionId = session.sessionId;
          
          next();
        } catch (error) {
          console.error('Save session error:', error);
          next(error);
        }
      };
    },
    
    /**
     * Destroy session and clear cookie
     */
    destroySession: async (req: any, res: any, next: any) => {
      try {
        if (req.sessionId) {
          await sessionManager.destroySession(req.sessionId);
          
          // Clear session cookie
          res.clearCookie(sessionManager['config'].cookieName, {
            httpOnly: sessionManager['config'].httpOnly,
            secure: sessionManager['config'].secure,
            sameSite: sessionManager['config'].sameSite,
            domain: sessionManager['config'].domain,
            path: sessionManager['config'].path,
          });
          
          delete req.session;
          delete req.sessionId;
        }
        
        next();
      } catch (error) {
        console.error('Destroy session error:', error);
        next(error);
      }
    },
    
    /**
     * Require valid session
     */
    requireSession: (req: any, res: any, next: any) => {
      if (!req.session) {
        return res.status(401).json({
          error: 'session_required',
          message: 'Valid session is required',
        });
      }
      
      next();
    },
  };
}

// Session configuration factory
export function createSessionConfig(): SessionConfig {
  return {
    ttl: parseInt(process.env.SESSION_TTL || '86400'), // 24 hours
    rolling: process.env.SESSION_ROLLING === 'true',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: (process.env.SESSION_SAME_SITE as 'strict' | 'lax' | 'none') || 'lax',
    domain: process.env.SESSION_DOMAIN,
    path: process.env.SESSION_PATH || '/',
    cookieName: process.env.SESSION_COOKIE_NAME || 'autoqa_session',
  };
}

// Default session manager instance
let defaultSessionManager: SessionManager | null = null;

export function getDefaultSessionManager(): SessionManager {
  if (!defaultSessionManager) {
    const config = createSessionConfig();
    defaultSessionManager = new SessionManager(config);
  }
  
  return defaultSessionManager;
}