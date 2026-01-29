/**
 * Property-Based Tests for Authentication Flow
 * Feature: autoqa-pilot, Authentication Properties
 * 
 * Tests OAuth state validation, JWT token generation/validation consistency, and session management.
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import fc from 'fast-check';
import { GitHubOAuthClient } from '../github-oauth';
import { JWTManager } from '../jwt-manager';
import { SessionManager } from '../session-manager';
import { redis } from '@autoqa/cache';

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
  // Ensure Redis is connected
  await redis.ping();
});

afterEach(async () => {
  // Clean up test data after each test
  await redis.flushdb();
});

afterAll(async () => {
  // Clean up all test data
  await redis.flushdb();
});

describe('OAuth Flow Property Tests', () => {
  let oauthClient: GitHubOAuthClient;
  
  beforeEach(() => {
    oauthClient = new GitHubOAuthClient(testOAuthConfig);
  });
  
  describe('OAuth State Management', () => {
    it('should generate unique states for concurrent requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }),
          async (concurrentRequests) => {
            // Generate multiple auth URLs concurrently
            const promises = Array(concurrentRequests).fill(null).map(() =>
              oauthClient.generateAuthUrl({ usePKCE: true })
            );
            
            const results = await Promise.all(promises);
            
            // All states should be unique
            const states = results.map(r => r.state);
            const uniqueStates = new Set(states);
            expect(uniqueStates.size).toBe(states.length);
            
            // All URLs should be different
            const urls = results.map(r => r.url);
            const uniqueUrls = new Set(urls);
            expect(uniqueUrls.size).toBe(urls.length);
            
            // All code verifiers should be unique (if PKCE is used)
            const codeVerifiers = results.map(r => r.codeVerifier).filter(Boolean);
            if (codeVerifiers.length > 0) {
              const uniqueVerifiers = new Set(codeVerifiers);
              expect(uniqueVerifiers.size).toBe(codeVerifiers.length);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('should maintain state consistency across generate and validate operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            usePKCE: fc.boolean(),
            additionalScopes: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 })
          }),
          async ({ usePKCE, additionalScopes }) => {
            // Generate auth URL
            const authData = await oauthClient.generateAuthUrl({
              usePKCE,
              additionalScopes,
            });
            
            expect(authData.state).toBeDefined();
            expect(authData.url).toContain(authData.state);
            
            if (usePKCE) {
              expect(authData.codeVerifier).toBeDefined();
              expect(authData.url).toContain('code_challenge');
            }
            
            // State should be stored in Redis
            const stateData = await redis.get(`oauth:state:${authData.state}`);
            expect(stateData).toBeTruthy();
            
            const parsedState = JSON.parse(stateData!);
            expect(parsedState.state).toBe(authData.state);
            expect(parsedState.redirectUri).toBe(testOAuthConfig.redirectUri);
            
            if (usePKCE) {
              expect(parsedState.codeVerifier).toBe(authData.codeVerifier);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
    
    it('should handle state expiration correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (customState) => {
            // Generate auth URL
            const authData = await oauthClient.generateAuthUrl({
              state: customState,
            });
            
            expect(authData.state).toBe(customState);
            
            // State should exist initially
            const initialState = await redis.get(`oauth:state:${customState}`);
            expect(initialState).toBeTruthy();
            
            // Manually expire the state
            await redis.del(`oauth:state:${customState}`);
            
            // Validation should fail for expired state
            const result = await oauthClient.exchangeCodeForToken(
              'test_code',
              customState
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('invalid_state');
          }
        ),
        { numRuns: 20 }
      );
    });
  });
  
  describe('OAuth URL Generation', () => {
    it('should generate valid OAuth URLs with all required parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            usePKCE: fc.boolean(),
            additionalScopes: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 })
          }),
          async ({ usePKCE, additionalScopes }) => {
            const authData = await oauthClient.generateAuthUrl({
              usePKCE,
              additionalScopes,
            });
            
            const url = new URL(authData.url);
            
            // Required OAuth parameters
            expect(url.searchParams.get('client_id')).toBe(testOAuthConfig.clientId);
            expect(url.searchParams.get('redirect_uri')).toBe(testOAuthConfig.redirectUri);
            expect(url.searchParams.get('response_type')).toBe('code');
            expect(url.searchParams.get('state')).toBe(authData.state);
            
            // Scopes should include base scopes and additional scopes
            const scopes = url.searchParams.get('scope')?.split(' ') || [];
            testOAuthConfig.scopes.forEach(scope => {
              expect(scopes).toContain(scope);
            });
            additionalScopes.forEach(scope => {
              expect(scopes).toContain(scope);
            });
            
            // PKCE parameters
            if (usePKCE) {
              expect(url.searchParams.get('code_challenge')).toBeTruthy();
              expect(url.searchParams.get('code_challenge_method')).toBe('S256');
            } else {
              expect(url.searchParams.get('code_challenge')).toBeNull();
              expect(url.searchParams.get('code_challenge_method')).toBeNull();
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});

describe('JWT Token Property Tests', () => {
  let jwtManager: JWTManager;
  
  beforeEach(() => {
    jwtManager = new JWTManager(testJWTConfig);
  });
  
  describe('Token Generation and Validation Consistency', () => {
    it('should maintain consistency between token generation and validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 50 }),
            email: fc.option(fc.emailAddress()),
            roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
            permissions: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
            sessionId: fc.uuid()
          }),
          async (payload) => {
            // Generate token pair
            const tokens = await jwtManager.generateTokenPair(payload);
            
            expect(tokens.accessToken).toBeDefined();
            expect(tokens.refreshToken).toBeDefined();
            expect(tokens.tokenId).toBeDefined();
            
            // Validate access token
            const accessValidation = await jwtManager.validateAccessToken(tokens.accessToken);
            expect(accessValidation.valid).toBe(true);
            expect(accessValidation.payload).toBeDefined();
            
            if (accessValidation.payload) {
              expect(accessValidation.payload.userId).toBe(payload.userId);
              expect(accessValidation.payload.username).toBe(payload.username);
              expect(accessValidation.payload.email).toBe(payload.email);
              expect(accessValidation.payload.roles).toEqual(payload.roles);
              expect(accessValidation.payload.permissions).toEqual(payload.permissions);
              expect(accessValidation.payload.sessionId).toBe(payload.sessionId);
              expect(accessValidation.payload.tokenType).toBe('access');
            }
            
            // Validate refresh token
            const refreshValidation = await jwtManager.validateRefreshToken(tokens.refreshToken);
            expect(refreshValidation.valid).toBe(true);
            expect(refreshValidation.payload).toBeDefined();
            
            if (refreshValidation.payload) {
              expect(refreshValidation.payload.userId).toBe(payload.userId);
              expect(refreshValidation.payload.username).toBe(payload.username);
              expect(refreshValidation.payload.sessionId).toBe(payload.sessionId);
              expect(refreshValidation.payload.tokenType).toBe('refresh');
            }
          }
        ),
        { numRuns: 30 }
      );
    });
    
    it('should generate unique tokens for different users', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              userId: fc.uuid(),
              username: fc.string({ minLength: 1, maxLength: 50 }),
              roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
              permissions: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
              sessionId: fc.uuid()
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (users) => {
            // Ensure all users are unique
            const uniqueUserIds = new Set(users.map(u => u.userId));
            fc.pre(uniqueUserIds.size === users.length);
            
            // Generate tokens for all users
            const tokenPairs = await Promise.all(
              users.map(user => jwtManager.generateTokenPair(user))
            );
            
            // All access tokens should be unique
            const accessTokens = tokenPairs.map(t => t.accessToken);
            const uniqueAccessTokens = new Set(accessTokens);
            expect(uniqueAccessTokens.size).toBe(accessTokens.length);
            
            // All refresh tokens should be unique
            const refreshTokens = tokenPairs.map(t => t.refreshToken);
            const uniqueRefreshTokens = new Set(refreshTokens);
            expect(uniqueRefreshTokens.size).toBe(refreshTokens.length);
            
            // All token IDs should be unique
            const tokenIds = tokenPairs.map(t => t.tokenId);
            const uniqueTokenIds = new Set(tokenIds);
            expect(uniqueTokenIds.size).toBe(tokenIds.length);
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('should handle token refresh correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 50 }),
            roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
            permissions: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
            sessionId: fc.uuid()
          }),
          async (payload) => {
            // Generate initial token pair
            const initialTokens = await jwtManager.generateTokenPair(payload);
            
            // Refresh tokens
            const refreshResult = await jwtManager.refreshAccessToken(initialTokens.refreshToken);
            
            expect(refreshResult.success).toBe(true);
            expect(refreshResult.tokens).toBeDefined();
            
            if (refreshResult.tokens) {
              // New tokens should be different from original
              expect(refreshResult.tokens.accessToken).not.toBe(initialTokens.accessToken);
              expect(refreshResult.tokens.refreshToken).not.toBe(initialTokens.refreshToken);
              
              // But should contain same user data
              const newAccessValidation = await jwtManager.validateAccessToken(
                refreshResult.tokens.accessToken
              );
              
              expect(newAccessValidation.valid).toBe(true);
              if (newAccessValidation.payload) {
                expect(newAccessValidation.payload.userId).toBe(payload.userId);
                expect(newAccessValidation.payload.username).toBe(payload.username);
                expect(newAccessValidation.payload.sessionId).toBe(payload.sessionId);
              }
              
              // Old refresh token should be invalidated
              const oldRefreshValidation = await jwtManager.validateRefreshToken(
                initialTokens.refreshToken
              );
              expect(oldRefreshValidation.valid).toBe(false);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('should handle token blacklisting correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 50 }),
            roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
            permissions: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
            sessionId: fc.uuid()
          }),
          async (payload) => {
            // Generate token pair
            const tokens = await jwtManager.generateTokenPair(payload);
            
            // Token should be valid initially
            const initialValidation = await jwtManager.validateAccessToken(tokens.accessToken);
            expect(initialValidation.valid).toBe(true);
            
            // Blacklist token
            const blacklisted = await jwtManager.blacklistToken(tokens.accessToken);
            expect(blacklisted).toBe(true);
            
            // Token should be invalid after blacklisting
            const afterBlacklistValidation = await jwtManager.validateAccessToken(tokens.accessToken);
            expect(afterBlacklistValidation.valid).toBe(false);
            expect(afterBlacklistValidation.error).toBe('Token is blacklisted');
          }
        ),
        { numRuns: 20 }
      );
    });
  });
  
  describe('Session Management Consistency', () => {
    it('should maintain session consistency across token operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 50 }),
            roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
            permissions: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
            sessionId: fc.uuid()
          }),
          async (payload) => {
            // Generate token pair
            const tokens = await jwtManager.generateTokenPair(payload);
            
            // Session should be valid
            const sessions = await jwtManager.getUserSessions(payload.userId);
            expect(sessions.length).toBeGreaterThan(0);
            
            const userSession = sessions.find(s => s.sessionId === payload.sessionId);
            expect(userSession).toBeDefined();
            
            // Invalidate session
            const invalidated = await jwtManager.invalidateSession(payload.sessionId);
            expect(invalidated).toBe(true);
            
            // Tokens should be invalid after session invalidation
            const accessValidation = await jwtManager.validateAccessToken(tokens.accessToken);
            expect(accessValidation.valid).toBe(false);
            expect(accessValidation.error).toBe('Session invalid or expired');
            
            const refreshValidation = await jwtManager.validateRefreshToken(tokens.refreshToken);
            expect(refreshValidation.valid).toBe(false);
            expect(refreshValidation.error).toBe('Session invalid or expired');
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

describe('Session Management Property Tests', () => {
  let sessionManager: SessionManager;
  
  beforeEach(() => {
    sessionManager = new SessionManager(testSessionConfig);
  });
  
  describe('Session Lifecycle Consistency', () => {
    it('should maintain session data consistency throughout lifecycle', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 50 }),
            email: fc.option(fc.emailAddress()),
            roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
            permissions: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
            metadata: fc.record({
              loginMethod: fc.constantFrom('github', 'google', 'email'),
              deviceType: fc.constantFrom('desktop', 'mobile', 'tablet'),
              location: fc.string({ maxLength: 100 })
            })
          }),
          async (sessionData) => {
            // Create session
            const session = await sessionManager.createSession(sessionData);
            
            expect(session.sessionId).toBeDefined();
            expect(session.userId).toBe(sessionData.userId);
            expect(session.username).toBe(sessionData.username);
            expect(session.email).toBe(sessionData.email);
            expect(session.roles).toEqual(sessionData.roles);
            expect(session.permissions).toEqual(sessionData.permissions);
            expect(session.metadata).toEqual(sessionData.metadata);
            
            // Retrieve session
            const retrieved = await sessionManager.getSession(session.sessionId);
            expect(retrieved).toBeTruthy();
            
            if (retrieved) {
              expect(retrieved.sessionId).toBe(session.sessionId);
              expect(retrieved.userId).toBe(sessionData.userId);
              expect(retrieved.username).toBe(sessionData.username);
              expect(retrieved.email).toBe(sessionData.email);
              expect(retrieved.roles).toEqual(sessionData.roles);
              expect(retrieved.permissions).toEqual(sessionData.permissions);
              expect(retrieved.metadata).toEqual(sessionData.metadata);
            }
            
            // Update session
            const updates = {
              metadata: { ...sessionData.metadata, lastAction: 'test_action' }
            };
            
            const updated = await sessionManager.updateSession(session.sessionId, updates);
            expect(updated).toBe(true);
            
            // Verify updates
            const afterUpdate = await sessionManager.getSession(session.sessionId);
            expect(afterUpdate?.metadata.lastAction).toBe('test_action');
            
            // Destroy session
            const destroyed = await sessionManager.destroySession(session.sessionId);
            expect(destroyed).toBe(true);
            
            // Session should not exist after destruction
            const afterDestroy = await sessionManager.getSession(session.sessionId);
            expect(afterDestroy).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('should handle multiple sessions per user correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 50 }),
            sessionCount: fc.integer({ min: 2, max: 5 })
          }),
          async ({ userId, username, sessionCount }) => {
            const sessions = [];
            
            // Create multiple sessions for the same user
            for (let i = 0; i < sessionCount; i++) {
              const session = await sessionManager.createSession({
                userId,
                username,
                roles: ['user'],
                permissions: ['read'],
                metadata: { sessionIndex: i }
              });
              
              sessions.push(session);
            }
            
            // All sessions should be unique
            const sessionIds = sessions.map(s => s.sessionId);
            const uniqueSessionIds = new Set(sessionIds);
            expect(uniqueSessionIds.size).toBe(sessionCount);
            
            // Get user sessions
            const userSessions = await sessionManager.getUserSessions(userId);
            expect(userSessions.length).toBe(sessionCount);
            
            // All sessions should belong to the same user
            userSessions.forEach(session => {
              expect(session.userId).toBe(userId);
              expect(session.username).toBe(username);
            });
            
            // Destroy all sessions for user
            const destroyedCount = await sessionManager.destroyUserSessions(userId);
            expect(destroyedCount).toBe(sessionCount);
            
            // No sessions should remain
            const afterDestroy = await sessionManager.getUserSessions(userId);
            expect(afterDestroy.length).toBe(0);
          }
        ),
        { numRuns: 15 }
      );
    });
    
    it('should handle session activity updates correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 50 }),
            activityCount: fc.integer({ min: 1, max: 10 })
          }),
          async ({ userId, username, activityCount }) => {
            // Create session
            const session = await sessionManager.createSession({
              userId,
              username,
              roles: ['user'],
              permissions: ['read'],
              metadata: {}
            });
            
            const initialActivity = session.lastActivity;
            
            // Update activity multiple times
            for (let i = 0; i < activityCount; i++) {
              // Small delay to ensure different timestamps
              await new Promise(resolve => setTimeout(resolve, 10));
              
              const updated = await sessionManager.updateSessionActivity(session.sessionId);
              expect(updated).toBe(true);
            }
            
            // Get updated session
            const updatedSession = await sessionManager.getSession(session.sessionId);
            expect(updatedSession).toBeTruthy();
            
            if (updatedSession) {
              // Last activity should be more recent than initial
              expect(new Date(updatedSession.lastActivity).getTime())
                .toBeGreaterThan(new Date(initialActivity).getTime());
              
              // If rolling sessions, expiry should be extended
              if (testSessionConfig.rolling) {
                expect(new Date(updatedSession.expiresAt).getTime())
                  .toBeGreaterThan(new Date(session.expiresAt).getTime());
              }
            }
          }
        ),
        { numRuns: 15 }
      );
    });
  });
});

describe('Integrated Authentication Flow Property Tests', () => {
  let oauthClient: GitHubOAuthClient;
  let jwtManager: JWTManager;
  let sessionManager: SessionManager;
  
  beforeEach(() => {
    oauthClient = new GitHubOAuthClient(testOAuthConfig);
    jwtManager = new JWTManager(testJWTConfig);
    sessionManager = new SessionManager(testSessionConfig);
  });
  
  it('should maintain consistency across complete authentication flow', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          username: fc.string({ minLength: 1, maxLength: 50 }),
          email: fc.emailAddress(),
          roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
          permissions: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 })
        }),
        async (userData) => {
          // 1. Generate OAuth URL
          const authData = await oauthClient.generateAuthUrl({ usePKCE: true });
          expect(authData.state).toBeDefined();
          expect(authData.codeVerifier).toBeDefined();
          
          // 2. Create session
          const session = await sessionManager.createSession({
            userId: userData.userId,
            username: userData.username,
            email: userData.email,
            roles: userData.roles,
            permissions: userData.permissions,
            metadata: { oauthState: authData.state }
          });
          
          // 3. Generate JWT tokens
          const tokens = await jwtManager.generateTokenPair({
            userId: userData.userId,
            username: userData.username,
            email: userData.email,
            roles: userData.roles,
            permissions: userData.permissions,
            sessionId: session.sessionId
          });
          
          // 4. Validate all components work together
          
          // Session should be retrievable
          const retrievedSession = await sessionManager.getSession(session.sessionId);
          expect(retrievedSession).toBeTruthy();
          expect(retrievedSession?.userId).toBe(userData.userId);
          
          // Tokens should be valid
          const accessValidation = await jwtManager.validateAccessToken(tokens.accessToken);
          expect(accessValidation.valid).toBe(true);
          expect(accessValidation.payload?.sessionId).toBe(session.sessionId);
          
          const refreshValidation = await jwtManager.validateRefreshToken(tokens.refreshToken);
          expect(refreshValidation.valid).toBe(true);
          expect(refreshValidation.payload?.sessionId).toBe(session.sessionId);
          
          // 5. Test logout flow
          
          // Blacklist tokens
          await jwtManager.blacklistToken(tokens.accessToken);
          await jwtManager.blacklistToken(tokens.refreshToken);
          
          // Destroy session
          await sessionManager.destroySession(session.sessionId);
          
          // Everything should be invalid after logout
          const afterLogoutAccess = await jwtManager.validateAccessToken(tokens.accessToken);
          expect(afterLogoutAccess.valid).toBe(false);
          
          const afterLogoutRefresh = await jwtManager.validateRefreshToken(tokens.refreshToken);
          expect(afterLogoutRefresh.valid).toBe(false);
          
          const afterLogoutSession = await sessionManager.getSession(session.sessionId);
          expect(afterLogoutSession).toBeNull();
        }
      ),
      { numRuns: 15 }
    );
  });
});