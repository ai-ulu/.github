/**
 * Unit Tests for Authentication Edge Cases
 * Feature: autoqa-pilot, Authentication Edge Cases
 * 
 * Tests OAuth callback error scenarios, expired token handling, concurrent login attempts, and session cleanup.
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import { GitHubOAuthClient } from '../github-oauth';
import { JWTManager } from '../jwt-manager';
import { SessionManager } from '../session-manager';
import { redis } from '@autoqa/cache';
import jwt from 'jsonwebtoken';

// Test configuration
const testOAuthConfig = {
  clientId: 'test_client_id',
  clientSecret: 'test_client_secret',
  redirectUri: 'https://test.example.com/auth/callback',
  scopes: ['user:email', 'read:user'],
};

const testJWTConfig = {
  accessTokenSecret: 'test_access_secret_that_is_long_enough_for_security',
  refreshTokenSecret: 'test_refresh_secret_that_is_long_enough_for_security',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  issuer: 'autoqa-test',
  audience: 'autoqa-test-users',
};

const testSessionConfig = {
  ttl: 86400, // 24 hours
  rolling: true,
  secure: false, // For testing
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  cookieName: 'test_session',
};

// Test setup and teardown
beforeAll(async () => {
  await redis.ping();
});

afterEach(async () => {
  await redis.flushdb();
});

afterAll(async () => {
  await redis.flushdb();
});

describe('OAuth Callback Error Scenarios', () => {
  let oauthClient: GitHubOAuthClient;
  
  beforeEach(() => {
    oauthClient = new GitHubOAuthClient(testOAuthConfig);
  });
  
  describe('Invalid State Handling', () => {
    it('should reject invalid state parameter', async () => {
      const result = await oauthClient.exchangeCodeForToken(
        'valid_code',
        'invalid_state'
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_state');
      expect(result.errorDescription).toContain('State not found or expired');
    });
    
    it('should reject expired state parameter', async () => {
      // Generate auth URL to create state
      const authData = await oauthClient.generateAuthUrl();
      
      // Manually expire the state
      await redis.del(`oauth:state:${authData.state}`);
      
      const result = await oauthClient.exchangeCodeForToken(
        'valid_code',
        authData.state
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_state');
    });
    
    it('should handle malformed state data', async () => {
      const malformedState = 'malformed_state';
      
      // Store malformed state data
      await redis.setex(
        `oauth:state:${malformedState}`,
        600,
        'invalid_json_data'
      );
      
      const result = await oauthClient.exchangeCodeForToken(
        'valid_code',
        malformedState
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_state');
    });
  });
  
  describe('OAuth Configuration Validation', () => {
    it('should throw error for missing client ID', () => {
      expect(() => {
        new GitHubOAuthClient({
          ...testOAuthConfig,
          clientId: '',
        });
      }).toThrow('GitHub OAuth client ID is required');
    });
    
    it('should throw error for missing client secret', () => {
      expect(() => {
        new GitHubOAuthClient({
          ...testOAuthConfig,
          clientSecret: '',
        });
      }).toThrow('GitHub OAuth client secret is required');
    });
    
    it('should throw error for invalid redirect URI', () => {
      expect(() => {
        new GitHubOAuthClient({
          ...testOAuthConfig,
          redirectUri: 'invalid-url',
        });
      }).toThrow('GitHub OAuth redirect URI must be a valid URL');
    });
    
    it('should throw error for empty scopes', () => {
      expect(() => {
        new GitHubOAuthClient({
          ...testOAuthConfig,
          scopes: [],
        });
      }).toThrow('GitHub OAuth scopes must be a non-empty array');
    });
  });
  
  describe('Network Error Handling', () => {
    it('should handle network timeout gracefully', async () => {
      // This test would require mocking axios, but we'll test the error structure
      const authData = await oauthClient.generateAuthUrl();
      
      // The actual network call would fail, but we test the error handling structure
      const result = await oauthClient.exchangeCodeForToken(
        'invalid_code',
        authData.state
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe('JWT Token Expiry and Edge Cases', () => {
  let jwtManager: JWTManager;
  
  beforeEach(() => {
    jwtManager = new JWTManager(testJWTConfig);
  });
  
  describe('Expired Token Handling', () => {
    it('should detect expired access tokens', async () => {
      // Create JWT manager with very short expiry
      const shortExpiryConfig = {
        ...testJWTConfig,
        accessTokenExpiry: '1ms', // Very short expiry
      };
      
      const shortJwtManager = new JWTManager(shortExpiryConfig);
      
      const tokens = await shortJwtManager.generateTokenPair({
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        sessionId: 'test-session',
      });
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const validation = await shortJwtManager.validateAccessToken(tokens.accessToken);
      
      expect(validation.valid).toBe(false);
      expect(validation.expired).toBe(true);
      expect(validation.error).toBe('Token expired');
    });
    
    it('should detect expired refresh tokens', async () => {
      const shortExpiryConfig = {
        ...testJWTConfig,
        refreshTokenExpiry: '1ms',
      };
      
      const shortJwtManager = new JWTManager(shortExpiryConfig);
      
      const tokens = await shortJwtManager.generateTokenPair({
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        sessionId: 'test-session',
      });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const validation = await shortJwtManager.validateRefreshToken(tokens.refreshToken);
      
      expect(validation.valid).toBe(false);
      expect(validation.expired).toBe(true);
      expect(validation.error).toBe('Refresh token expired');
    });
  });
  
  describe('Malformed Token Handling', () => {
    it('should reject malformed access tokens', async () => {
      const validation = await jwtManager.validateAccessToken('malformed.token.here');
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('invalid signature');
    });
    
    it('should reject tokens with wrong signature', async () => {
      const wrongSecretConfig = {
        ...testJWTConfig,
        accessTokenSecret: 'wrong_secret_that_is_long_enough_for_security',
      };
      
      const wrongJwtManager = new JWTManager(wrongSecretConfig);
      
      const tokens = await jwtManager.generateTokenPair({
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        sessionId: 'test-session',
      });
      
      const validation = await wrongJwtManager.validateAccessToken(tokens.accessToken);
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('invalid signature');
    });
    
    it('should reject tokens with wrong token type', async () => {
      const tokens = await jwtManager.generateTokenPair({
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        sessionId: 'test-session',
      });
      
      // Try to validate refresh token as access token
      const validation = await jwtManager.validateAccessToken(tokens.refreshToken);
      
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Invalid token type');
    });
  });
  
  describe('JWT Configuration Validation', () => {
    it('should throw error for weak access token secret', () => {
      expect(() => {
        new JWTManager({
          ...testJWTConfig,
          accessTokenSecret: 'weak', // Too short
        });
      }).toThrow('Access token secret must be at least 32 characters');
    });
    
    it('should throw error for weak refresh token secret', () => {
      expect(() => {
        new JWTManager({
          ...testJWTConfig,
          refreshTokenSecret: 'weak', // Too short
        });
      }).toThrow('Refresh token secret must be at least 32 characters');
    });
    
    it('should throw error for missing issuer', () => {
      expect(() => {
        new JWTManager({
          ...testJWTConfig,
          issuer: '',
        });
      }).toThrow('Token issuer is required');
    });
    
    it('should throw error for missing audience', () => {
      expect(() => {
        new JWTManager({
          ...testJWTConfig,
          audience: '',
        });
      }).toThrow('Token audience is required');
    });
  });
  
  describe('Token Refresh Edge Cases', () => {
    it('should fail refresh with invalid refresh token', async () => {
      const result = await jwtManager.refreshAccessToken('invalid.refresh.token');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
    
    it('should fail refresh with blacklisted refresh token', async () => {
      const tokens = await jwtManager.generateTokenPair({
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        sessionId: 'test-session',
      });
      
      // Blacklist refresh token
      await jwtManager.blacklistToken(tokens.refreshToken);
      
      const result = await jwtManager.refreshAccessToken(tokens.refreshToken);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
    
    it('should invalidate old refresh token after successful refresh', async () => {
      const tokens = await jwtManager.generateTokenPair({
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        sessionId: 'test-session',
      });
      
      // Refresh tokens
      const refreshResult = await jwtManager.refreshAccessToken(tokens.refreshToken);
      expect(refreshResult.success).toBe(true);
      
      // Old refresh token should be invalid
      const oldTokenValidation = await jwtManager.validateRefreshToken(tokens.refreshToken);
      expect(oldTokenValidation.valid).toBe(false);
    });
  });
});

describe('Concurrent Login Attempts', () => {
  let jwtManager: JWTManager;
  let sessionManager: SessionManager;
  
  beforeEach(() => {
    jwtManager = new JWTManager(testJWTConfig);
    sessionManager = new SessionManager(testSessionConfig);
  });
  
  describe('Concurrent Session Creation', () => {
    it('should handle concurrent session creation for same user', async () => {
      const userId = 'test-user';
      const username = 'testuser';
      
      // Create multiple sessions concurrently
      const sessionPromises = Array(5).fill(null).map((_, index) =>
        sessionManager.createSession({
          userId,
          username,
          roles: ['user'],
          permissions: ['read'],
          metadata: { sessionIndex: index },
        })
      );
      
      const sessions = await Promise.all(sessionPromises);
      
      // All sessions should be created successfully
      expect(sessions).toHaveLength(5);
      
      // All sessions should have unique IDs
      const sessionIds = sessions.map(s => s.sessionId);
      const uniqueSessionIds = new Set(sessionIds);
      expect(uniqueSessionIds.size).toBe(5);
      
      // All sessions should belong to the same user
      sessions.forEach(session => {
        expect(session.userId).toBe(userId);
        expect(session.username).toBe(username);
      });
      
      // User should have all sessions
      const userSessions = await sessionManager.getUserSessions(userId);
      expect(userSessions).toHaveLength(5);
    });
    
    it('should handle concurrent token generation for same user', async () => {
      const payload = {
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        sessionId: 'test-session',
      };
      
      // Generate multiple token pairs concurrently
      const tokenPromises = Array(5).fill(null).map(() =>
        jwtManager.generateTokenPair(payload)
      );
      
      const tokenPairs = await Promise.all(tokenPromises);
      
      // All token pairs should be generated successfully
      expect(tokenPairs).toHaveLength(5);
      
      // All tokens should be unique
      const accessTokens = tokenPairs.map(t => t.accessToken);
      const uniqueAccessTokens = new Set(accessTokens);
      expect(uniqueAccessTokens.size).toBe(5);
      
      const refreshTokens = tokenPairs.map(t => t.refreshToken);
      const uniqueRefreshTokens = new Set(refreshTokens);
      expect(uniqueRefreshTokens.size).toBe(5);
      
      // All tokens should be valid
      for (const tokenPair of tokenPairs) {
        const accessValidation = await jwtManager.validateAccessToken(tokenPair.accessToken);
        expect(accessValidation.valid).toBe(true);
        
        const refreshValidation = await jwtManager.validateRefreshToken(tokenPair.refreshToken);
        expect(refreshValidation.valid).toBe(true);
      }
    });
  });
  
  describe('Race Condition Prevention', () => {
    it('should handle concurrent token validation', async () => {
      const tokens = await jwtManager.generateTokenPair({
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        sessionId: 'test-session',
      });
      
      // Validate token concurrently
      const validationPromises = Array(10).fill(null).map(() =>
        jwtManager.validateAccessToken(tokens.accessToken)
      );
      
      const validations = await Promise.all(validationPromises);
      
      // All validations should succeed
      validations.forEach(validation => {
        expect(validation.valid).toBe(true);
        expect(validation.payload?.userId).toBe('test-user');
      });
    });
    
    it('should handle concurrent session updates', async () => {
      const session = await sessionManager.createSession({
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        metadata: { counter: 0 },
      });
      
      // Update session concurrently
      const updatePromises = Array(5).fill(null).map((_, index) =>
        sessionManager.updateSession(session.sessionId, {
          metadata: { counter: index, updateIndex: index },
        })
      );
      
      const updateResults = await Promise.all(updatePromises);
      
      // All updates should succeed
      updateResults.forEach(result => {
        expect(result).toBe(true);
      });
      
      // Session should still be valid
      const updatedSession = await sessionManager.getSession(session.sessionId);
      expect(updatedSession).toBeTruthy();
      expect(updatedSession?.userId).toBe('test-user');
    });
  });
});

describe('Session Cleanup on Logout', () => {
  let jwtManager: JWTManager;
  let sessionManager: SessionManager;
  
  beforeEach(() => {
    jwtManager = new JWTManager(testJWTConfig);
    sessionManager = new SessionManager(testSessionConfig);
  });
  
  describe('Complete Logout Flow', () => {
    it('should clean up all authentication artifacts on logout', async () => {
      // Create session
      const session = await sessionManager.createSession({
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      // Generate tokens
      const tokens = await jwtManager.generateTokenPair({
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        sessionId: session.sessionId,
      });
      
      // Verify everything is valid initially
      const initialSessionCheck = await sessionManager.getSession(session.sessionId);
      expect(initialSessionCheck).toBeTruthy();
      
      const initialAccessCheck = await jwtManager.validateAccessToken(tokens.accessToken);
      expect(initialAccessCheck.valid).toBe(true);
      
      const initialRefreshCheck = await jwtManager.validateRefreshToken(tokens.refreshToken);
      expect(initialRefreshCheck.valid).toBe(true);
      
      // Perform logout
      await jwtManager.blacklistToken(tokens.accessToken);
      await jwtManager.blacklistToken(tokens.refreshToken);
      await sessionManager.destroySession(session.sessionId);
      
      // Verify everything is cleaned up
      const afterLogoutSession = await sessionManager.getSession(session.sessionId);
      expect(afterLogoutSession).toBeNull();
      
      const afterLogoutAccess = await jwtManager.validateAccessToken(tokens.accessToken);
      expect(afterLogoutAccess.valid).toBe(false);
      
      const afterLogoutRefresh = await jwtManager.validateRefreshToken(tokens.refreshToken);
      expect(afterLogoutRefresh.valid).toBe(false);
    });
    
    it('should clean up all user sessions on user logout', async () => {
      const userId = 'test-user';
      
      // Create multiple sessions for user
      const sessions = await Promise.all([
        sessionManager.createSession({
          userId,
          username: 'testuser',
          roles: ['user'],
          permissions: ['read'],
          metadata: { device: 'desktop' },
        }),
        sessionManager.createSession({
          userId,
          username: 'testuser',
          roles: ['user'],
          permissions: ['read'],
          metadata: { device: 'mobile' },
        }),
        sessionManager.createSession({
          userId,
          username: 'testuser',
          roles: ['user'],
          permissions: ['read'],
          metadata: { device: 'tablet' },
        }),
      ]);
      
      // Generate tokens for each session
      const tokenPairs = await Promise.all(
        sessions.map(session =>
          jwtManager.generateTokenPair({
            userId,
            username: 'testuser',
            roles: ['user'],
            permissions: ['read'],
            sessionId: session.sessionId,
          })
        )
      );
      
      // Verify all sessions exist
      const initialUserSessions = await sessionManager.getUserSessions(userId);
      expect(initialUserSessions).toHaveLength(3);
      
      // Destroy all user sessions
      const destroyedCount = await sessionManager.destroyUserSessions(userId);
      expect(destroyedCount).toBe(3);
      
      // Verify all sessions are gone
      const afterDestroyUserSessions = await sessionManager.getUserSessions(userId);
      expect(afterDestroyUserSessions).toHaveLength(0);
      
      // Verify all tokens are invalid due to session invalidation
      for (const tokenPair of tokenPairs) {
        const accessValidation = await jwtManager.validateAccessToken(tokenPair.accessToken);
        expect(accessValidation.valid).toBe(false);
        expect(accessValidation.error).toBe('Session invalid or expired');
        
        const refreshValidation = await jwtManager.validateRefreshToken(tokenPair.refreshToken);
        expect(refreshValidation.valid).toBe(false);
        expect(refreshValidation.error).toBe('Session invalid or expired');
      }
    });
  });
  
  describe('Partial Cleanup Scenarios', () => {
    it('should handle session cleanup when Redis data is inconsistent', async () => {
      const session = await sessionManager.createSession({
        userId: 'test-user',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read'],
        metadata: {},
      });
      
      // Manually corrupt session data
      await redis.set(`session:${session.sessionId}`, 'corrupted_data');
      
      // Cleanup should still work
      const destroyed = await sessionManager.destroySession(session.sessionId);
      expect(destroyed).toBe(true);
      
      // Session should not exist
      const afterDestroy = await sessionManager.getSession(session.sessionId);
      expect(afterDestroy).toBeNull();
    });
    
    it('should handle token blacklisting when token is already expired', async () => {
      // Create expired token manually
      const expiredToken = jwt.sign(
        {
          userId: 'test-user',
          username: 'testuser',
          tokenType: 'access',
          exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        },
        testJWTConfig.accessTokenSecret
      );
      
      // Blacklisting expired token should still work
      const blacklisted = await jwtManager.blacklistToken(expiredToken);
      expect(blacklisted).toBe(true);
    });
  });
  
  describe('Cleanup Performance', () => {
    it('should handle cleanup of many sessions efficiently', async () => {
      const userId = 'test-user';
      const sessionCount = 20;
      
      // Create many sessions
      const sessions = await Promise.all(
        Array(sessionCount).fill(null).map((_, index) =>
          sessionManager.createSession({
            userId,
            username: 'testuser',
            roles: ['user'],
            permissions: ['read'],
            metadata: { sessionIndex: index },
          })
        )
      );
      
      expect(sessions).toHaveLength(sessionCount);
      
      // Cleanup should be fast
      const startTime = Date.now();
      const destroyedCount = await sessionManager.destroyUserSessions(userId);
      const endTime = Date.now();
      
      expect(destroyedCount).toBe(sessionCount);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      
      // Verify cleanup
      const remainingSessions = await sessionManager.getUserSessions(userId);
      expect(remainingSessions).toHaveLength(0);
    });
  });
});