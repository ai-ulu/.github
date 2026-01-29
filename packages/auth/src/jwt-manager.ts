// JWT token management with production-ready security
// Implements secure token generation, validation, and refresh

import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { redis } from '@autoqa/cache';

export interface JWTConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry: string | number;
  refreshTokenExpiry: string | number;
  issuer: string;
  audience: string;
  algorithm?: jwt.Algorithm;
}

export interface TokenPayload {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
  tokenType: 'access' | 'refresh';
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
  jti?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: Date;
  refreshTokenExpiry: Date;
  tokenId: string;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
  expired?: boolean;
}

export interface RefreshResult {
  success: boolean;
  tokens?: TokenPair;
  error?: string;
}

// JWT token manager
export class JWTManager {
  private config: Required<JWTConfig>;
  private static readonly TOKEN_BLACKLIST_PREFIX = 'jwt:blacklist:';
  private static readonly REFRESH_TOKEN_PREFIX = 'jwt:refresh:';
  private static readonly SESSION_PREFIX = 'jwt:session:';
  
  constructor(config: JWTConfig) {
    this.config = {
      algorithm: 'HS256',
      ...config,
    };
    
    this.validateConfig();
  }
  
  /**
   * Generate access and refresh token pair
   */
  async generateTokenPair(payload: Omit<TokenPayload, 'tokenType' | 'iat' | 'exp' | 'iss' | 'aud' | 'jti'>): Promise<TokenPair> {
    const tokenId = this.generateTokenId();
    const now = Math.floor(Date.now() / 1000);
    
    // Calculate expiry times
    const accessExpiry = this.calculateExpiry(this.config.accessTokenExpiry);
    const refreshExpiry = this.calculateExpiry(this.config.refreshTokenExpiry);
    
    // Access token payload
    const accessPayload: TokenPayload = {
      ...payload,
      tokenType: 'access',
      jti: tokenId,
      iat: now,
      iss: this.config.issuer,
      aud: this.config.audience,
    };
    
    // Refresh token payload (minimal for security)
    const refreshPayload: TokenPayload = {
      userId: payload.userId,
      username: payload.username,
      sessionId: payload.sessionId,
      roles: payload.roles,
      permissions: payload.permissions,
      tokenType: 'refresh',
      jti: tokenId,
      iat: now,
      iss: this.config.issuer,
      aud: this.config.audience,
    };
    
    // Generate tokens
    const accessToken = jwt.sign(
      accessPayload,
      this.config.accessTokenSecret,
      {
        expiresIn: this.config.accessTokenExpiry,
        algorithm: this.config.algorithm,
      }
    );
    
    const refreshToken = jwt.sign(
      refreshPayload,
      this.config.refreshTokenSecret,
      {
        expiresIn: this.config.refreshTokenExpiry,
        algorithm: this.config.algorithm,
      }
    );
    
    // Store refresh token in Redis for validation
    await redis.setex(
      `${JWTManager.REFRESH_TOKEN_PREFIX}${tokenId}`,
      this.getExpiryInSeconds(this.config.refreshTokenExpiry),
      JSON.stringify({
        userId: payload.userId,
        sessionId: payload.sessionId,
        createdAt: new Date().toISOString(),
      })
    );
    
    // Store session information
    await redis.setex(
      `${JWTManager.SESSION_PREFIX}${payload.sessionId}`,
      this.getExpiryInSeconds(this.config.refreshTokenExpiry),
      JSON.stringify({
        userId: payload.userId,
        username: payload.username,
        tokenId,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      })
    );
    
    return {
      accessToken,
      refreshToken,
      accessTokenExpiry: new Date(accessExpiry * 1000),
      refreshTokenExpiry: new Date(refreshExpiry * 1000),
      tokenId,
    };
  }
  
  /**
   * Validate access token
   */
  async validateAccessToken(token: string): Promise<TokenValidationResult> {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) {
        return {
          valid: false,
          error: 'Token is blacklisted',
        };
      }
      
      // Verify token
      const payload = jwt.verify(
        token,
        this.config.accessTokenSecret,
        {
          algorithms: [this.config.algorithm],
          issuer: this.config.issuer,
          audience: this.config.audience,
        }
      ) as TokenPayload;
      
      // Validate token type
      if (payload.tokenType !== 'access') {
        return {
          valid: false,
          error: 'Invalid token type',
        };
      }
      
      // Check session validity
      const sessionValid = await this.isSessionValid(payload.sessionId);
      if (!sessionValid) {
        return {
          valid: false,
          error: 'Session invalid or expired',
        };
      }
      
      // Update last activity
      await this.updateSessionActivity(payload.sessionId);
      
      return {
        valid: true,
        payload,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return {
          valid: false,
          error: 'Token expired',
          expired: true,
        };
      }
      
      if (error instanceof jwt.JsonWebTokenError) {
        return {
          valid: false,
          error: error.message,
        };
      }
      
      console.error('Token validation error:', error);
      return {
        valid: false,
        error: 'Token validation failed',
      };
    }
  }
  
  /**
   * Validate refresh token
   */
  async validateRefreshToken(token: string): Promise<TokenValidationResult> {
    try {
      // Verify token
      const payload = jwt.verify(
        token,
        this.config.refreshTokenSecret,
        {
          algorithms: [this.config.algorithm],
          issuer: this.config.issuer,
          audience: this.config.audience,
        }
      ) as TokenPayload;
      
      // Validate token type
      if (payload.tokenType !== 'refresh') {
        return {
          valid: false,
          error: 'Invalid token type',
        };
      }
      
      // Check if refresh token exists in Redis
      const refreshData = await redis.get(`${JWTManager.REFRESH_TOKEN_PREFIX}${payload.jti}`);
      if (!refreshData) {
        return {
          valid: false,
          error: 'Refresh token not found or expired',
        };
      }
      
      // Check session validity
      const sessionValid = await this.isSessionValid(payload.sessionId);
      if (!sessionValid) {
        return {
          valid: false,
          error: 'Session invalid or expired',
        };
      }
      
      return {
        valid: true,
        payload,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return {
          valid: false,
          error: 'Refresh token expired',
          expired: true,
        };
      }
      
      if (error instanceof jwt.JsonWebTokenError) {
        return {
          valid: false,
          error: error.message,
        };
      }
      
      console.error('Refresh token validation error:', error);
      return {
        valid: false,
        error: 'Refresh token validation failed',
      };
    }
  }
  
  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
    try {
      // Validate refresh token
      const validation = await this.validateRefreshToken(refreshToken);
      if (!validation.valid || !validation.payload) {
        return {
          success: false,
          error: validation.error,
        };
      }
      
      const { payload } = validation;
      
      // Generate new token pair
      const newTokens = await this.generateTokenPair({
        userId: payload.userId,
        username: payload.username,
        email: payload.email,
        roles: payload.roles,
        permissions: payload.permissions,
        sessionId: payload.sessionId,
      });
      
      // Invalidate old refresh token
      await redis.del(`${JWTManager.REFRESH_TOKEN_PREFIX}${payload.jti}`);
      
      return {
        success: true,
        tokens: newTokens,
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      return {
        success: false,
        error: 'Token refresh failed',
      };
    }
  }
  
  /**
   * Blacklist token (logout)
   */
  async blacklistToken(token: string): Promise<boolean> {
    try {
      // Decode token to get expiry
      const decoded = jwt.decode(token) as TokenPayload;
      if (!decoded || !decoded.exp) {
        return false;
      }
      
      // Calculate TTL until token expires
      const now = Math.floor(Date.now() / 1000);
      const ttl = decoded.exp - now;
      
      if (ttl > 0) {
        // Add to blacklist with TTL
        await redis.setex(
          `${JWTManager.TOKEN_BLACKLIST_PREFIX}${this.getTokenHash(token)}`,
          ttl,
          'blacklisted'
        );
      }
      
      // If it's a refresh token, remove from Redis
      if (decoded.tokenType === 'refresh' && decoded.jti) {
        await redis.del(`${JWTManager.REFRESH_TOKEN_PREFIX}${decoded.jti}`);
      }
      
      return true;
    } catch (error) {
      console.error('Token blacklist error:', error);
      return false;
    }
  }
  
  /**
   * Invalidate all tokens for a session
   */
  async invalidateSession(sessionId: string): Promise<boolean> {
    try {
      // Get session data
      const sessionData = await redis.get(`${JWTManager.SESSION_PREFIX}${sessionId}`);
      if (!sessionData) {
        return false;
      }
      
      const session = JSON.parse(sessionData);
      
      // Remove refresh token
      if (session.tokenId) {
        await redis.del(`${JWTManager.REFRESH_TOKEN_PREFIX}${session.tokenId}`);
      }
      
      // Remove session
      await redis.del(`${JWTManager.SESSION_PREFIX}${sessionId}`);
      
      return true;
    } catch (error) {
      console.error('Session invalidation error:', error);
      return false;
    }
  }
  
  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<Array<{
    sessionId: string;
    username: string;
    createdAt: string;
    lastActivity: string;
  }>> {
    try {
      const pattern = `${JWTManager.SESSION_PREFIX}*`;
      const keys = await redis.keys(pattern);
      
      const sessions = [];
      
      for (const key of keys) {
        const sessionData = await redis.get(key);
        if (sessionData) {
          const session = JSON.parse(sessionData);
          if (session.userId === userId) {
            sessions.push({
              sessionId: key.replace(JWTManager.SESSION_PREFIX, ''),
              username: session.username,
              createdAt: session.createdAt,
              lastActivity: session.lastActivity,
            });
          }
        }
      }
      
      return sessions;
    } catch (error) {
      console.error('Get user sessions error:', error);
      return [];
    }
  }
  
  /**
   * Check if token is blacklisted
   */
  private async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const tokenHash = this.getTokenHash(token);
      const result = await redis.get(`${JWTManager.TOKEN_BLACKLIST_PREFIX}${tokenHash}`);
      return result !== null;
    } catch (error) {
      console.error('Blacklist check error:', error);
      return false;
    }
  }
  
  /**
   * Check if session is valid
   */
  private async isSessionValid(sessionId: string): Promise<boolean> {
    try {
      const sessionData = await redis.get(`${JWTManager.SESSION_PREFIX}${sessionId}`);
      return sessionData !== null;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }
  
  /**
   * Update session last activity
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const sessionData = await redis.get(`${JWTManager.SESSION_PREFIX}${sessionId}`);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        session.lastActivity = new Date().toISOString();
        
        const ttl = await redis.ttl(`${JWTManager.SESSION_PREFIX}${sessionId}`);
        if (ttl > 0) {
          await redis.setex(
            `${JWTManager.SESSION_PREFIX}${sessionId}`,
            ttl,
            JSON.stringify(session)
          );
        }
      }
    } catch (error) {
      console.error('Session activity update error:', error);
    }
  }
  
  /**
   * Generate unique token ID
   */
  private generateTokenId(): string {
    return randomBytes(16).toString('hex');
  }
  
  /**
   * Get token hash for blacklisting
   */
  private getTokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  
  /**
   * Calculate token expiry timestamp
   */
  private calculateExpiry(expiry: string | number): number {
    const now = Math.floor(Date.now() / 1000);
    
    if (typeof expiry === 'number') {
      return now + expiry;
    }
    
    // Parse string expiry (e.g., '1h', '30m', '7d')
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    const multipliers = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    
    return now + (value * multipliers[unit as keyof typeof multipliers]);
  }
  
  /**
   * Get expiry in seconds for Redis TTL
   */
  private getExpiryInSeconds(expiry: string | number): number {
    if (typeof expiry === 'number') {
      return expiry;
    }
    
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    const multipliers = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    
    return value * multipliers[unit as keyof typeof multipliers];
  }
  
  /**
   * Validate JWT configuration
   */
  private validateConfig(): void {
    if (!this.config.accessTokenSecret) {
      throw new Error('Access token secret is required');
    }
    
    if (!this.config.refreshTokenSecret) {
      throw new Error('Refresh token secret is required');
    }
    
    if (!this.config.accessTokenExpiry) {
      throw new Error('Access token expiry is required');
    }
    
    if (!this.config.refreshTokenExpiry) {
      throw new Error('Refresh token expiry is required');
    }
    
    if (!this.config.issuer) {
      throw new Error('Token issuer is required');
    }
    
    if (!this.config.audience) {
      throw new Error('Token audience is required');
    }
    
    // Validate secrets are strong enough
    if (this.config.accessTokenSecret.length < 32) {
      throw new Error('Access token secret must be at least 32 characters');
    }
    
    if (this.config.refreshTokenSecret.length < 32) {
      throw new Error('Refresh token secret must be at least 32 characters');
    }
  }
}

// JWT middleware factory for Express
export function createJWTMiddleware(jwtManager: JWTManager) {
  return {
    /**
     * Authenticate request using JWT
     */
    authenticate: async (req: any, res: any, next: any) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'missing_token',
            message: 'Authorization token is required',
          });
        }
        
        const token = authHeader.substring(7);
        const validation = await jwtManager.validateAccessToken(token);
        
        if (!validation.valid) {
          const status = validation.expired ? 401 : 403;
          return res.status(status).json({
            error: validation.expired ? 'token_expired' : 'invalid_token',
            message: validation.error,
          });
        }
        
        // Add user info to request
        req.user = validation.payload;
        req.token = token;
        
        next();
      } catch (error) {
        console.error('JWT authentication error:', error);
        res.status(500).json({
          error: 'authentication_error',
          message: 'Authentication failed',
        });
      }
    },
    
    /**
     * Authorize request based on roles/permissions
     */
    authorize: (requiredRoles: string[] = [], requiredPermissions: string[] = []) => {
      return (req: any, res: any, next: any) => {
        if (!req.user) {
          return res.status(401).json({
            error: 'not_authenticated',
            message: 'Authentication required',
          });
        }
        
        const user = req.user as TokenPayload;
        
        // Check roles
        if (requiredRoles.length > 0) {
          const hasRole = requiredRoles.some(role => user.roles.includes(role));
          if (!hasRole) {
            return res.status(403).json({
              error: 'insufficient_roles',
              message: 'Required roles not found',
              required: requiredRoles,
              actual: user.roles,
            });
          }
        }
        
        // Check permissions
        if (requiredPermissions.length > 0) {
          const hasPermission = requiredPermissions.some(permission => 
            user.permissions.includes(permission)
          );
          if (!hasPermission) {
            return res.status(403).json({
              error: 'insufficient_permissions',
              message: 'Required permissions not found',
              required: requiredPermissions,
              actual: user.permissions,
            });
          }
        }
        
        next();
      };
    },
  };
}

// JWT configuration factory
export function createJWTConfig(): JWTConfig {
  return {
    accessTokenSecret: process.env.JWT_ACCESS_SECRET || '',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET || '',
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    issuer: process.env.JWT_ISSUER || 'autoqa-pilot',
    audience: process.env.JWT_AUDIENCE || 'autoqa-users',
    algorithm: (process.env.JWT_ALGORITHM as jwt.Algorithm) || 'HS256',
  };
}

// Default JWT manager instance
let defaultJWTManager: JWTManager | null = null;

export function getDefaultJWTManager(): JWTManager {
  if (!defaultJWTManager) {
    const config = createJWTConfig();
    
    // Validate required environment variables
    if (!config.accessTokenSecret) {
      throw new Error('JWT_ACCESS_SECRET environment variable is required');
    }
    
    if (!config.refreshTokenSecret) {
      throw new Error('JWT_REFRESH_SECRET environment variable is required');
    }
    
    defaultJWTManager = new JWTManager(config);
  }
  
  return defaultJWTManager;
}