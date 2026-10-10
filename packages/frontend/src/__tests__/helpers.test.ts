import {
  formatCurrency,
  maskWalletAddress,
  getCurrencyDisplayName,
  getCurrencyIcon,
} from '@/utils/helpers';

describe('formatCurrency', () => {
  it('formats gold/sweeps coins as a plain decimal with 2 places', () => {
    expect(formatCurrency(1234.5, 'GOLD_COINS')).toBe('1,234.50');
    expect(formatCurrency('1000', 'SWEEPS_COINS')).toBe('1,000.00');
  });

  it('formats crypto as a decimal amount followed by its ticker', () => {
    expect(formatCurrency(10, 'CRYPTO_USDT')).toBe('10.00 USDT');
    expect(formatCurrency('0.5', 'CRYPTO_BTC')).toBe('0.50 BTC');
    expect(formatCurrency('0.00000001', 'CRYPTO_BTC')).toBe('0.00000001 BTC');
  });

  it('never throws on a crypto ticker (regression: Intl rejected BTC/USDT)', () => {
    const tickers: Record<string, string> = {
      CRYPTO_BTC: 'BTC',
      CRYPTO_ETH: 'ETH',
      CRYPTO_USDT: 'USDT',
      CRYPTO_USDC: 'USDC',
      CRYPTO_LTC: 'LTC',
      CRYPTO_DOGE: 'DOGE',
    };
    for (const [currency, ticker] of Object.entries(tickers)) {
      expect(() => formatCurrency(1, currency)).not.toThrow();
      expect(formatCurrency(1, currency).trim().endsWith(ticker)).toBe(true);
    }
  });

  it('falls back to USD formatting for an unknown currency', () => {
    expect(formatCurrency(10, 'NOT_A_CURRENCY')).toBe('$10.00');
  });

  it('returns 0.00 for non-numeric input', () => {
    expect(formatCurrency('not-a-number', 'CRYPTO_BTC')).toBe('0.00');
    expect(formatCurrency(NaN, 'GOLD_COINS')).toBe('0.00');
  });
});

describe('maskWalletAddress', () => {
  it('keeps the head and tail of a long address', () => {
    const address = '0x1234567890123456789012345678901234567890';
    expect(maskWalletAddress(address)).toBe('0x1234...7890');
    expect(maskWalletAddress(address, 8, 6)).toBe('0x123456...567890');
  });

  it('returns short addresses untouched instead of producing an empty mask', () => {
    expect(maskWalletAddress('abc')).toBe('abc');
    expect(maskWalletAddress('')).toBe('');
    expect(maskWalletAddress('1234567890')).toBe('1234567890');
  });
});

describe('currency display helpers', () => {
  it('maps every known currency to a human-readable name', () => {
    expect(getCurrencyDisplayName('GOLD_COINS')).toBe('Gold Coins');
    expect(getCurrencyDisplayName('CRYPTO_BTC')).toBe('Bitcoin (BTC)');
    expect(getCurrencyDisplayName('CRYPTO_USDT')).toBe('Tether (USDT)');
  });

  it('passes unknown currencies through rather than rendering blank', () => {
    expect(getCurrencyDisplayName('MYSTERY')).toBe('MYSTERY');
  });

  it('supplies an icon for every known currency and a fallback otherwise', () => {
    expect(getCurrencyIcon('GOLD_COINS')).toBe('🪙');
    expect(getCurrencyIcon('CRYPTO_BTC')).toBe('₿');
    expect(getCurrencyIcon('MYSTERY')).toBe('💰');
  });
});
