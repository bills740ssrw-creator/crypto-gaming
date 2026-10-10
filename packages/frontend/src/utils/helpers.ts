import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: string | number, currency: string, locale: string = 'en-US'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0.00';
  
  if (currency === 'GOLD_COINS' || currency === 'SWEEPS_COINS') {
    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }
  
  const cryptoSymbols: Record<string, string> = {
    CRYPTO_BTC: 'BTC',
    CRYPTO_ETH: 'ETH',
    CRYPTO_USDT: 'USDT',
    CRYPTO_USDC: 'USDC',
    CRYPTO_LTC: 'LTC',
    CRYPTO_DOGE: 'DOGE',
    CRYPTO_SOL: 'SOL',
  };

  const symbol = cryptoSymbols[currency];
  if (!symbol) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(num);
  }

  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(num)} ${symbol}`;
}

export function formatNumber(amount: string | number, decimals: number = 2): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatCompactNumber(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';
  
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(num);
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

export function maskWalletAddress(address: string, startChars: number = 6, endChars: number = 4): string {
  if (address.length <= startChars + endChars) return address;
  return `${address.substring(0, startChars)}...${address.substring(address.length - endChars)}`;
}

export function getCurrencyDisplayName(currency: string): string {
  const names: Record<string, string> = {
    GOLD_COINS: 'Gold Coins',
    SWEEPS_COINS: 'Sweeps Coins',
    CRYPTO_BTC: 'Bitcoin (BTC)',
    CRYPTO_ETH: 'Ethereum (ETH)',
    CRYPTO_USDT: 'Tether (USDT)',
    CRYPTO_USDC: 'USD Coin (USDC)',
    CRYPTO_LTC: 'Litecoin (LTC)',
    CRYPTO_DOGE: 'Dogecoin (DOGE)',
    CRYPTO_SOL: 'Solana (SOL)',
  };
  return names[currency] || currency;
}

export function getCurrencyIcon(currency: string): string {
  const icons: Record<string, string> = {
    GOLD_COINS: '🪙',
    SWEEPS_COINS: '🎁',
    CRYPTO_BTC: '₿',
    CRYPTO_ETH: 'Ξ',
    CRYPTO_USDT: '₮',
    CRYPTO_USDC: '💲',
    CRYPTO_LTC: 'Ł',
    CRYPTO_DOGE: 'Ð',
    CRYPTO_SOL: '◎',
  };
  return icons[currency] || '💰';
}

export function getGameTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    SLOTS: 'Slots',
    BLACKJACK: 'Blackjack',
    ROULETTE: 'Roulette',
    POKER: 'Poker',
    BACCARAT: 'Baccarat',
    DICE: 'Dice',
    CRASH: 'Crash',
    PLINKO: 'Plinko',
    MINES: 'Mines',
    KENO: 'Keno',
  };
  return labels[type] || type;
}

export function getVolatilityColor(volatility: string): string {
  const colors: Record<string, string> = {
    LOW: 'text-primary bg-primary/15',
    MEDIUM: 'text-gold-400 bg-gold-500/15',
    HIGH: 'text-gold-400 bg-gold-500/15',
    VERY_HIGH: 'text-destructive bg-destructive/15',
  };
  return colors[volatility] || 'text-muted-foreground bg-secondary';
}

export function getTransactionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    DEPOSIT: 'Deposit',
    WITHDRAWAL: 'Withdrawal',
    WAGER: 'Wager',
    WIN: 'Win',
    BONUS: 'Bonus',
    REFUND: 'Refund',
    TRANSFER_IN: 'Transfer In',
    TRANSFER_OUT: 'Transfer Out',
  };
  return labels[type] || type;
}

export function getTransactionStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: 'text-gold-400 bg-gold-500/15',
    PROCESSING: 'text-sky-400 bg-sky-500/15',
    CONFIRMED: 'text-sky-400 bg-sky-500/15',
    COMPLETED: 'text-primary bg-primary/15',
    FAILED: 'text-destructive bg-destructive/15',
    CANCELLED: 'text-muted-foreground bg-secondary',
    REJECTED: 'text-destructive bg-destructive/15',
  };
  return colors[status] || 'text-muted-foreground bg-secondary';
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(fn: T, limit: number): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function parseErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: { error?: { message?: string } } } };
    return axiosError.response?.data?.error?.message || 'An error occurred';
  }
  return 'An unknown error occurred';
}