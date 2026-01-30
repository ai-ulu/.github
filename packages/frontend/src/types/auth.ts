export interface User {
  id: string;
  githubId: number;
  username: string;
  email: string | null;
  name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  avatarUrl: string;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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

export interface OAuthState {
  state: string;
  codeVerifier?: string;
  redirectUri: string;
  createdAt: Date;
  expiresAt: Date;
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