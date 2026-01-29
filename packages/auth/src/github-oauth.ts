// GitHub OAuth integration with production-ready security
// Implements OAuth 2.0 flow with state validation and PKCE

import axios from 'axios';
import { randomBytes, createHash } from 'crypto';
import { redis } from '@autoqa/cache';

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  baseUrl?: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
  company: string | null;
  location: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export interface OAuthState {
  state: string;
  codeVerifier?: string;
  redirectUri: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface OAuthTokens {
  accessToken: string;
  tokenType: string;
  scope: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface OAuthResult {
  success: boolean;
  user?: GitHubUser;
  tokens?: OAuthTokens;
  error?: string;
  errorDescription?: string;
}

// GitHub OAuth client
export class GitHubOAuthClient {
  private config: Required<GitHubOAuthConfig>;
  private static readonly STATE_TTL = 600; // 10 minutes
  private static readonly API_BASE_URL = 'https://api.github.com';
  private static readonly OAUTH_BASE_URL = 'https://github.com/login/oauth';
  
  constructor(config: GitHubOAuthConfig) {
    this.config = {
      baseUrl: GitHubOAuthClient.OAUTH_BASE_URL,
      ...config,
    };
    
    this.validateConfig();
  }
  
  /**
   * Generate authorization URL with state validation
   */
  async generateAuthUrl(options: {
    usePKCE?: boolean;
    additionalScopes?: string[];
    state?: string;
  } = {}): Promise<{
    url: string;
    state: string;
    codeVerifier?: string;
  }> {
    const state = options.state || this.generateState();
    const scopes = [...this.config.scopes, ...(options.additionalScopes || [])];
    
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;
    
    // PKCE implementation for enhanced security
    if (options.usePKCE) {
      codeVerifier = this.generateCodeVerifier();
      codeChallenge = this.generateCodeChallenge(codeVerifier);
    }
    
    // Store state in Redis for validation
    const oauthState: OAuthState = {
      state,
      codeVerifier,
      redirectUri: this.config.redirectUri,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + GitHubOAuthClient.STATE_TTL * 1000),
    };
    
    await redis.setex(
      `oauth:state:${state}`,
      GitHubOAuthClient.STATE_TTL,
      JSON.stringify(oauthState)
    );
    
    // Build authorization URL
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(' '),
      state,
      response_type: 'code',
    });
    
    if (codeChallenge) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }
    
    const url = `${this.config.baseUrl}/authorize?${params.toString()}`;
    
    return {
      url,
      state,
      codeVerifier,
    };
  }
  
  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    state: string,
    codeVerifier?: string
  ): Promise<OAuthResult> {
    try {
      // Validate state
      const stateValidation = await this.validateState(state);
      if (!stateValidation.valid) {
        return {
          success: false,
          error: 'invalid_state',
          errorDescription: stateValidation.error,
        };
      }
      
      // Prepare token exchange request
      const tokenParams = {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      };
      
      // Add PKCE verifier if used
      if (codeVerifier) {
        (tokenParams as any).code_verifier = codeVerifier;
      }
      
      // Exchange code for token
      const tokenResponse = await axios.post(
        `${this.config.baseUrl}/access_token`,
        tokenParams,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );
      
      if (tokenResponse.data.error) {
        return {
          success: false,
          error: tokenResponse.data.error,
          errorDescription: tokenResponse.data.error_description,
        };
      }
      
      const tokens: OAuthTokens = {
        accessToken: tokenResponse.data.access_token,
        tokenType: tokenResponse.data.token_type || 'bearer',
        scope: tokenResponse.data.scope || '',
        refreshToken: tokenResponse.data.refresh_token,
        expiresIn: tokenResponse.data.expires_in,
      };
      
      // Get user information
      const user = await this.getUserInfo(tokens.accessToken);
      
      // Clean up state
      await redis.del(`oauth:state:${state}`);
      
      return {
        success: true,
        user,
        tokens,
      };
    } catch (error) {
      console.error('OAuth token exchange error:', error);
      
      return {
        success: false,
        error: 'token_exchange_failed',
        errorDescription: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Get user information from GitHub API
   */
  async getUserInfo(accessToken: string): Promise<GitHubUser> {
    try {
      const [userResponse, emailsResponse] = await Promise.all([
        axios.get(`${GitHubOAuthClient.API_BASE_URL}/user`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'AutoQA-Pilot/1.0',
          },
          timeout: 10000,
        }),
        axios.get(`${GitHubOAuthClient.API_BASE_URL}/user/emails`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'AutoQA-Pilot/1.0',
          },
          timeout: 10000,
        }).catch(() => ({ data: [] })), // Emails might not be accessible
      ]);
      
      const user = userResponse.data;
      const emails: GitHubEmail[] = emailsResponse.data;
      
      // Find primary email if not public
      if (!user.email && emails.length > 0) {
        const primaryEmail = emails.find(e => e.primary && e.verified);
        if (primaryEmail) {
          user.email = primaryEmail.email;
        }
      }
      
      return user;
    } catch (error) {
      console.error('GitHub user info error:', error);
      throw new Error('Failed to fetch user information');
    }
  }
  
  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<OAuthResult> {
    try {
      const response = await axios.post(
        `${this.config.baseUrl}/access_token`,
        {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );
      
      if (response.data.error) {
        return {
          success: false,
          error: response.data.error,
          errorDescription: response.data.error_description,
        };
      }
      
      const tokens: OAuthTokens = {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type || 'bearer',
        scope: response.data.scope || '',
        refreshToken: response.data.refresh_token || refreshToken,
        expiresIn: response.data.expires_in,
      };
      
      return {
        success: true,
        tokens,
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      
      return {
        success: false,
        error: 'refresh_failed',
        errorDescription: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Revoke access token
   */
  async revokeToken(accessToken: string): Promise<boolean> {
    try {
      await axios.delete(
        `${GitHubOAuthClient.API_BASE_URL}/applications/${this.config.clientId}/token`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
          timeout: 10000,
        }
      );
      
      return true;
    } catch (error) {
      console.error('Token revocation error:', error);
      return false;
    }
  }
  
  /**
   * Validate OAuth state parameter
   */
  private async validateState(state: string): Promise<{
    valid: boolean;
    error?: string;
    oauthState?: OAuthState;
  }> {
    try {
      const stateData = await redis.get(`oauth:state:${state}`);
      
      if (!stateData) {
        return {
          valid: false,
          error: 'State not found or expired',
        };
      }
      
      const oauthState: OAuthState = JSON.parse(stateData);
      
      // Check expiration
      if (new Date() > new Date(oauthState.expiresAt)) {
        await redis.del(`oauth:state:${state}`);
        return {
          valid: false,
          error: 'State expired',
        };
      }
      
      return {
        valid: true,
        oauthState,
      };
    } catch (error) {
      console.error('State validation error:', error);
      return {
        valid: false,
        error: 'State validation failed',
      };
    }
  }
  
  /**
   * Generate cryptographically secure state parameter
   */
  private generateState(): string {
    return randomBytes(32).toString('base64url');
  }
  
  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }
  
  /**
   * Generate PKCE code challenge
   */
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256')
      .update(verifier)
      .digest('base64url');
  }
  
  /**
   * Validate OAuth configuration
   */
  private validateConfig(): void {
    if (!this.config.clientId) {
      throw new Error('GitHub OAuth client ID is required');
    }
    
    if (!this.config.clientSecret) {
      throw new Error('GitHub OAuth client secret is required');
    }
    
    if (!this.config.redirectUri) {
      throw new Error('GitHub OAuth redirect URI is required');
    }
    
    if (!Array.isArray(this.config.scopes) || this.config.scopes.length === 0) {
      throw new Error('GitHub OAuth scopes must be a non-empty array');
    }
    
    // Validate redirect URI format
    try {
      new URL(this.config.redirectUri);
    } catch {
      throw new Error('GitHub OAuth redirect URI must be a valid URL');
    }
  }
}

// OAuth middleware factory for Express
export function createOAuthMiddleware(oauthClient: GitHubOAuthClient) {
  return {
    /**
     * Initiate OAuth flow
     */
    initiateAuth: async (req: any, res: any, next: any) => {
      try {
        const { usePKCE = true, additionalScopes = [] } = req.query;
        
        const authData = await oauthClient.generateAuthUrl({
          usePKCE: usePKCE === 'true',
          additionalScopes: Array.isArray(additionalScopes) 
            ? additionalScopes 
            : additionalScopes ? [additionalScopes] : [],
        });
        
        // Store code verifier in session if using PKCE
        if (authData.codeVerifier) {
          req.session = req.session || {};
          req.session.codeVerifier = authData.codeVerifier;
        }
        
        res.redirect(authData.url);
      } catch (error) {
        console.error('OAuth initiation error:', error);
        next(error);
      }
    },
    
    /**
     * Handle OAuth callback
     */
    handleCallback: async (req: any, res: any, next: any) => {
      try {
        const { code, state, error, error_description } = req.query;
        
        if (error) {
          return res.status(400).json({
            error: 'oauth_error',
            message: error_description || error,
          });
        }
        
        if (!code || !state) {
          return res.status(400).json({
            error: 'missing_parameters',
            message: 'Authorization code and state are required',
          });
        }
        
        const codeVerifier = req.session?.codeVerifier;
        
        const result = await oauthClient.exchangeCodeForToken(
          code,
          state,
          codeVerifier
        );
        
        if (!result.success) {
          return res.status(400).json({
            error: result.error,
            message: result.errorDescription,
          });
        }
        
        // Clear code verifier from session
        if (req.session?.codeVerifier) {
          delete req.session.codeVerifier;
        }
        
        // Store user and tokens in request for further processing
        req.oauthResult = result;
        
        next();
      } catch (error) {
        console.error('OAuth callback error:', error);
        next(error);
      }
    },
  };
}

// OAuth configuration factory
export function createOAuthConfig(): GitHubOAuthConfig {
  const config: GitHubOAuthConfig = {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    redirectUri: process.env.GITHUB_REDIRECT_URI || '',
    scopes: (process.env.GITHUB_SCOPES || 'user:email').split(','),
  };
  
  // Validate required environment variables
  if (!config.clientId) {
    throw new Error('GITHUB_CLIENT_ID environment variable is required');
  }
  
  if (!config.clientSecret) {
    throw new Error('GITHUB_CLIENT_SECRET environment variable is required');
  }
  
  if (!config.redirectUri) {
    throw new Error('GITHUB_REDIRECT_URI environment variable is required');
  }
  
  return config;
}

// Default OAuth client instance
let defaultOAuthClient: GitHubOAuthClient | null = null;

export function getDefaultOAuthClient(): GitHubOAuthClient {
  if (!defaultOAuthClient) {
    const config = createOAuthConfig();
    defaultOAuthClient = new GitHubOAuthClient(config);
  }
  
  return defaultOAuthClient;
}

// OAuth utilities
export class OAuthUtils {
  /**
   * Generate secure random string
   */
  static generateSecureRandom(length: number = 32): string {
    return randomBytes(length).toString('base64url');
  }
  
  /**
   * Validate OAuth scopes
   */
  static validateScopes(scopes: string[]): boolean {
    const validScopes = [
      'user', 'user:email', 'user:follow',
      'public_repo', 'repo', 'repo_deployment',
      'repo:status', 'delete_repo',
      'notifications', 'gist',
      'read:repo_hook', 'write:repo_hook', 'admin:repo_hook',
      'admin:org_hook', 'read:org', 'write:org', 'admin:org',
      'read:public_key', 'write:public_key', 'admin:public_key',
      'read:gpg_key', 'write:gpg_key', 'admin:gpg_key',
    ];
    
    return scopes.every(scope => validScopes.includes(scope));
  }
  
  /**
   * Parse OAuth error response
   */
  static parseOAuthError(error: any): {
    code: string;
    message: string;
    description?: string;
  } {
    if (error.response?.data) {
      return {
        code: error.response.data.error || 'oauth_error',
        message: error.response.data.error_description || error.message,
        description: error.response.data.error_uri,
      };
    }
    
    return {
      code: 'unknown_error',
      message: error.message || 'Unknown OAuth error',
    };
  }
}