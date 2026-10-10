import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_URL}/api`,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        if (typeof window === 'undefined') {
          const session = await getServerSession(authOptions);
          if (session && (session as any).accessToken) {
            config.headers.Authorization = `Bearer ${(session as any).accessToken}`;
          }
        } else {
          const token = localStorage.getItem('accessToken');
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            const refreshToken = typeof window !== 'undefined' 
              ? localStorage.getItem('refreshToken')
              : null;
            
            if (refreshToken) {
              const response = await axios.post(`${API_URL}/api/auth/refresh`, {
                refreshToken,
              });
              
              const { accessToken, refreshToken: newRefreshToken } = response.data.data;
              
              if (typeof window !== 'undefined') {
                localStorage.setItem('accessToken', accessToken);
                localStorage.setItem('refreshToken', newRefreshToken);
              }
              
              originalRequest.headers.Authorization = `Bearer ${accessToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              window.location.href = '/login';
            }
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  get instance() {
    return this.client;
  }

  setToken(token: string) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearToken() {
    delete this.client.defaults.headers.common['Authorization'];
  }
}

export const api = new ApiClient().instance;

export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (data: { email: string; username: string; password: string; region?: string; referralCode?: string }) => 
    api.post('/auth/register', data),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  logout: (refreshToken?: string) => api.post('/auth/logout', { refreshToken }),
  changePassword: (currentPassword: string, newPassword: string) => 
    api.post('/auth/change-password', { currentPassword, newPassword }),
  updateProfile: (data: { username?: string; email?: string }) => api.patch('/auth/profile', data),
  getProfile: () => api.get('/auth/profile'),
  submitKYC: (data: any) => api.post('/auth/kyc', data),
  deleteAccount: (password: string) => api.delete('/auth/account', { data: { password } }),
};

export const walletApi = {
  getWallets: () => api.get('/wallet'),
  getWallet: (currency: string) => api.get(`/wallet/${currency}`),
  createWallet: (data: { currency: string; walletType?: string }) => api.post('/wallet', data),
  getBalance: (currency?: string) => api.get('/wallet/balance', { params: { currency } }),
  requestDeposit: (data: { currency: string; amount: string; network?: string }) => 
    api.post('/wallet/deposit', data),
  requestWithdrawal: (data: { currency: string; amount: string; address: string; tag?: string; network?: string }) => 
    api.post('/wallet/withdraw', data),
  transfer: (data: { toUserId: string; currency: string; amount: string }) => 
    api.post('/wallet/transfer', data),
  getHistory: (params?: { currency?: string; limit?: number; offset?: number }) => 
    api.get('/wallet/history', { params }),
};

export const gameApi = {
  getGames: (params?: { type?: string; provider?: string; isActive?: boolean; limit?: number; offset?: number }) => 
    api.get('/game', { params }),
  getGame: (id: string) => api.get(`/game/${id}`),
  startSession: (data: { gameId: string; currency: string; initialBet?: string }) => 
    api.post('/game/sessions', data),
  getActiveSession: (gameId: string) => api.get(`/game/sessions/active/${gameId}`),
  getSession: (sessionId: string) => api.get(`/game/sessions/${sessionId}`),
  placeBet: (sessionId: string, data: { amount: string; gameData?: Record<string, unknown> }) => 
    api.post(`/game/sessions/${sessionId}/bet`, data),
  processResult: (sessionId: string, data: { result: Record<string, unknown>; winAmount: string; seed?: string; clientSeed?: string }) => 
    api.post(`/game/sessions/${sessionId}/result`, data),
  endSession: (sessionId: string) => api.post(`/game/sessions/${sessionId}/end`),
  getHistory: (params?: { gameId?: string; currency?: string; status?: string; limit?: number; offset?: number; startDate?: string; endDate?: string }) => 
    api.get('/game/history', { params }),
  getStats: (gameId?: string) => api.get('/game/stats', { params: { gameId } }),
};

export const adminApi = {
  getUsers: (params?: { page?: number; limit?: number; search?: string; region?: string; isActive?: boolean }) => 
    api.get('/admin/users', { params }),
  getUser: (id: string) => api.get(`/admin/users/${id}`),
  activateUser: (id: string) => api.patch(`/admin/users/${id}/activate`),
  deactivateUser: (id: string) => api.patch(`/admin/users/${id}/deactivate`),
  updateKYC: (id: string, data: { level: number; verified: boolean }) => 
    api.patch(`/admin/users/${id}/kyc`, data),
  getUserTransactions: (id: string, params?: { page?: number; limit?: number; type?: string; status?: string; currency?: string }) => 
    api.get(`/admin/users/${id}/transactions`, { params }),
  getUserWallets: (id: string) => api.get(`/admin/users/${id}/wallets`),
  getUserGameHistory: (id: string, params?: { page?: number; limit?: number; gameId?: string; currency?: string }) => 
    api.get(`/admin/users/${id}/game-history`, { params }),
  getUserStats: (id: string) => api.get(`/admin/users/${id}/stats`),
};