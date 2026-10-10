import { BigNumber } from 'bignumber.js';

BigNumber.config({
  DECIMAL_PLACES: 18,
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
});

export * from './provably-fair';

export class CryptoMath {
  static add(a: string, b: string): string {
    return new BigNumber(a).plus(new BigNumber(b)).toFixed();
  }

  static subtract(a: string, b: string): string {
    const result = new BigNumber(a).minus(new BigNumber(b));
    return result.isNegative() ? '0' : result.toFixed();
  }

  static multiply(a: string, b: string): string {
    return new BigNumber(a).multipliedBy(new BigNumber(b)).toFixed();
  }

  static divide(a: string, b: string): string {
    return new BigNumber(a).dividedBy(new BigNumber(b)).toFixed();
  }

  static percentage(amount: string, percent: string): string {
    return new BigNumber(amount).multipliedBy(new BigNumber(percent)).dividedBy(100).toFixed();
  }

  static isGreaterThan(a: string, b: string): boolean {
    return new BigNumber(a).isGreaterThan(new BigNumber(b));
  }

  static isGreaterThanOrEqual(a: string, b: string): boolean {
    return new BigNumber(a).isGreaterThanOrEqualTo(new BigNumber(b));
  }

  static isLessThan(a: string, b: string): boolean {
    return new BigNumber(a).isLessThan(new BigNumber(b));
  }

  static isLessThanOrEqual(a: string, b: string): boolean {
    return new BigNumber(a).isLessThanOrEqualTo(new BigNumber(b));
  }

  static isEqual(a: string, b: string): boolean {
    return new BigNumber(a).isEqualTo(new BigNumber(b));
  }

  static max(a: string, b: string): string {
    return new BigNumber(a).isGreaterThan(new BigNumber(b)) ? a : b;
  }

  static min(a: string, b: string): string {
    return new BigNumber(a).isLessThan(new BigNumber(b)) ? a : b;
  }

  static toFixed(value: string, decimals: number = 8): string {
    return new BigNumber(value).toFixed(decimals);
  }

  static fromWei(value: string, decimals: number = 18): string {
    return new BigNumber(value).dividedBy(new BigNumber(10).pow(decimals)).toFixed();
  }

  static toWei(value: string, decimals: number = 18): string {
    return new BigNumber(value).multipliedBy(new BigNumber(10).pow(decimals)).toFixed(0);
  }

  static formatDisplay(value: string, currency: string, decimals: number = 2): string {
    const num = new BigNumber(value);
    if (num.isZero()) return '0';
    if (currency === 'BTC' || currency === 'CRYPTO_BTC') {
      return num.toFixed(8);
    }
    if (currency === 'ETH' || currency === 'CRYPTO_ETH') {
      return num.toFixed(6);
    }
    return num.toFixed(decimals);
  }
}

export function generateReferralCode(username: string): string {
  const prefix = username.substring(0, 4).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${random}`;
}

export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export function generateTransactionId(): string {
  return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>"'&]/g, '');
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  return usernameRegex.test(username);
}

export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  return { valid: true };
}

export function formatCurrency(amount: string, currency: string, locale: string = 'en-US'): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0.00';
  
  if (currency === 'GOLD_COINS' || currency === 'SWEEPS_COINS') {
    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.replace('CRYPTO_', ''),
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(num);
}

export function parseCurrencyInput(input: string): string {
  return input.replace(/[^0-9.]/g, '');
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function retry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  return fn().catch(async (error) => {
    if (retries <= 0) throw error;
    await sleep(delay);
    return retry(fn, retries - 1, delay * 2);
  });
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
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

export function getCurrencyDecimals(currency: string): number {
  const decimals: Record<string, number> = {
    GOLD_COINS: 2,
    SWEEPS_COINS: 2,
    CRYPTO_BTC: 8,
    CRYPTO_ETH: 6,
    CRYPTO_USDT: 2,
    CRYPTO_USDC: 2,
    CRYPTO_LTC: 8,
    CRYPTO_DOGE: 8,
    CRYPTO_SOL: 9,
  };
  return decimals[currency] || 2;
}