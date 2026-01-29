// Authentication and authorization exports for AutoQA Pilot
// Production-ready auth with GitHub OAuth, JWT, and session management

export * from './github-oauth';
export * from './jwt-manager';
export * from './session-manager';

// Default exports for convenience
export { GitHubOAuthClient, getDefaultOAuthClient } from './github-oauth';
export { JWTManager, getDefaultJWTManager } from './jwt-manager';
export { SessionManager, getDefaultSessionManager } from './session-manager';