import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Balance, CurrencyType, RegionType, Transaction, GameHistory, GameSession, Game } from '@crypto-gaming/shared';

interface UserState {
  id: string | null;
  email: string | null;
  username: string | null;
  region: RegionType | null;
  isAdmin: boolean;
  kycVerified: boolean;
  kycLevel: number;
  setUser: (user: Partial<UserState>) => void;
  clearUser: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      id: null,
      email: null,
      username: null,
      region: null,
      isAdmin: false,
      kycVerified: false,
      kycLevel: 0,
      setUser: (user) => set((state) => ({ ...state, ...user })),
      clearUser: () => set({
        id: null,
        email: null,
        username: null,
        region: null,
        isAdmin: false,
        kycVerified: false,
        kycLevel: 0,
      }),
    }),
    {
      name: 'user-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        id: state.id,
        email: state.email,
        username: state.username,
        region: state.region,
        isAdmin: state.isAdmin,
        kycVerified: state.kycVerified,
        kycLevel: state.kycLevel,
      }),
    }
  )
);

interface WalletState {
  balance: Balance | null;
  wallets: Record<string, { balance: string; pendingBalance: string }>;
  transactions: Transaction[];
  isLoading: boolean;
  activeCurrency: CurrencyType | null;
  setBalance: (balance: Balance) => void;
  updateBalance: (currency: CurrencyType, amount: string) => void;
  setWallets: (wallets: Record<string, { balance: string; pendingBalance: string }>) => void;
  setTransactions: (transactions: Transaction[]) => void;
  addTransaction: (transaction: Transaction) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  setLoading: (loading: boolean) => void;
  setActiveCurrency: (currency: CurrencyType) => void;
  clearWallet: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      balance: null,
      wallets: {},
      transactions: [],
      isLoading: false,
      activeCurrency: null,
      setBalance: (balance) => set({ balance }),
      updateBalance: (currency, amount) => set((state) => {
        if (!state.balance) return state;
        const newBalance = { ...state.balance };
        if (currency === 'GOLD_COINS') newBalance.goldCoins = amount;
        else if (currency === 'SWEEPS_COINS') newBalance.sweepsCoins = amount;
        else newBalance.cryptoBalances[currency] = amount;
        return { balance: newBalance };
      }),
      setWallets: (wallets) => set({ wallets }),
      setTransactions: (transactions) => set({ transactions }),
      addTransaction: (transaction) => set((state) => ({
        transactions: [transaction, ...state.transactions].slice(0, 100),
      })),
      updateTransaction: (id, updates) => set((state) => ({
        transactions: state.transactions.map((t) => t.id === id ? { ...t, ...updates } : t),
      })),
      setLoading: (isLoading) => set({ isLoading }),
      setActiveCurrency: (activeCurrency) => set({ activeCurrency }),
      clearWallet: () => set({ balance: null, wallets: {}, transactions: [], activeCurrency: null }),
    }),
    {
      name: 'wallet-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

interface GameState {
  games: Game[];
  currentSession: GameSession | null;
  history: GameHistory[];
  isLoading: boolean;
  setGames: (games: Game[]) => void;
  setCurrentSession: (session: GameSession | null) => void;
  setHistory: (history: GameHistory[]) => void;
  addHistory: (history: GameHistory) => void;
  setLoading: (loading: boolean) => void;
  clearGame: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      games: [],
      currentSession: null,
      history: [],
      isLoading: false,
      setGames: (games) => set({ games }),
      setCurrentSession: (currentSession) => set({ currentSession }),
      setHistory: (history) => set({ history }),
      addHistory: (history) => set((state) => ({
        history: [history, ...state.history].slice(0, 100),
      })),
      setLoading: (isLoading) => set({ isLoading }),
      clearGame: () => set({ games: [], currentSession: null, history: [] }),
    }),
    {
      name: 'game-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  notifications: Array<{ id: string; type: 'success' | 'error' | 'info' | 'warning'; message: string }>;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  addNotification: (notification: Omit<UIState['notifications'][0], 'id'>) => void;
  removeNotification: (id: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: 'system',
      notifications: [],
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setTheme: (theme) => set({ theme }),
      addNotification: (notification) => set((state) => ({
        notifications: [...state.notifications, { ...notification, id: generateId() }],
      })),
      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),
    }),
    {
      name: 'ui-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearTokens: () => void;
  setAuthenticated: (authenticated: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken, isAuthenticated: true }),
      clearTokens: () => set({ accessToken: null, refreshToken: null, isAuthenticated: false }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);