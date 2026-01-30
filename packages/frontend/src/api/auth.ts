import axios, { AxiosResponse } from 'axios';
import { User, LoginResponse } from '@/types/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Create axios instance
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
const TOKEN_KEY = 'autoqa_token';

export const authApi = {
  // Token management
  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken: (token: string): void => {
    localStorage.setItem(TOKEN_KEY, token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  },

  removeToken: (): void => {
    localStorage.removeItem(TOKEN_KEY);
    delete api.defaults.headers.common['Authorization'];
  },

  // Initialize token from localStorage
  initializeToken: (): void => {
    const token = authApi.getToken();
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  },

  // Setup axios interceptors
  setupInterceptors: (callbacks: {
    onTokenExpired?: () => void;
    onUnauthorized?: () => void;
  }) => {
    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          if (callbacks.onTokenExpired) {
            callbacks.onTokenExpired();
          }
        } else if (error.response?.status === 403) {
          // Unauthorized
          if (callbacks.onUnauthorized) {
            callbacks.onUnauthorized();
          }
        }
        return Promise.reject(error);
      }
    );

    // Return cleanup function
    return () => {
      api.interceptors.response.eject(responseInterceptor);
    };
  },

  // Auth endpoints
  getProfile: async (): Promise<User> => {
    const response: AxiosResponse<User> = await api.get('/users/me');
    return response.data;
  },

  updateProfile: async (data: Partial<User>): Promise<User> => {
    const response: AxiosResponse<User> = await api.put('/users/me', data);
    return response.data;
  },

  getUserStats: async (): Promise<{
    projectCount: number;
    scenarioCount: number;
    executions: {
      total: number;
      byStatus: Record<string, number>;
    };
  }> => {
    const response = await api.get('/users/me/stats');
    return response.data;
  },

  deleteAccount: async (): Promise<void> => {
    await api.delete('/users/me');
  },

  // OAuth endpoints
  initiateGitHubLogin: (): string => {
    const params = new URLSearchParams({
      redirect_uri: `${window.location.origin}/auth/callback`,
      response_type: 'code',
      scope: 'user:email',
    });
    
    return `${API_BASE_URL}/auth/github?${params.toString()}`;
  },

  handleOAuthCallback: async (code: string, state: string): Promise<LoginResponse> => {
    const response: AxiosResponse<LoginResponse> = await api.post('/auth/callback', {
      code,
      state,
    });
    return response.data;
  },

  // Session management
  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Ignore errors on logout
      console.warn('Logout request failed:', error);
    } finally {
      authApi.removeToken();
    }
  },

  refreshToken: async (): Promise<{ accessToken: string }> => {
    const response: AxiosResponse<{ accessToken: string }> = await api.post('/auth/refresh');
    return response.data;
  },
};

// Initialize token on module load
authApi.initializeToken();

export default api;