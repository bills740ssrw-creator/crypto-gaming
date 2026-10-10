import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PATH_ROWS = [
  { winProbability: 0.95, multiplier: 1.0105 },
  { winProbability: 0.85, multiplier: 1.1294 },
  { winProbability: 0.7, multiplier: 1.3714 },
  { winProbability: 0.55, multiplier: 1.7455 },
  { winProbability: 0.4, multiplier: 2.4 },
];

function parsePathRows(raw: string | undefined): { winProbability: number; multiplier: number }[] {
  if (!raw) return DEFAULT_PATH_ROWS;
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === 5 &&
      parsed.every(
        (row) =>
          row &&
          typeof row.winProbability === 'number' &&
          row.winProbability > 0 &&
          row.winProbability < 1 &&
          typeof row.multiplier === 'number' &&
          row.multiplier > 0
      )
    ) {
      return parsed;
    }
  } catch {
    return DEFAULT_PATH_ROWS;
  }
  return DEFAULT_PATH_ROWS;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/crypto_gaming',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'your-access-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-in-production',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
  },

  crypto: {
    btc: {
      network: process.env.BTC_NETWORK || 'mainnet',
      requiredConfirmations: parseInt(process.env.BTC_REQUIRED_CONFIRMATIONS || '3', 10),
    },
    eth: {
      network: process.env.ETH_NETWORK || 'mainnet',
      requiredConfirmations: parseInt(process.env.ETH_REQUIRED_CONFIRMATIONS || '12', 10),
    },
    usdt: {
      network: process.env.USDT_NETWORK || 'erc20',
      requiredConfirmations: parseInt(process.env.USDT_REQUIRED_CONFIRMATIONS || '12', 10),
    },
  },

  blockchain: {
    enabled: process.env.BLOCKCHAIN_INDEXER_ENABLED !== 'false',
    pollIntervalMs: parseInt(process.env.BLOCKCHAIN_POLL_INTERVAL_MS || '15000', 10),
    payoutIntervalMs: parseInt(process.env.BLOCKCHAIN_PAYOUT_INTERVAL_MS || '10000', 10),
    // Deterministic seeds used to derive per-user deposit addresses.
    // NEVER commit real production values.
    depositMnemonic: process.env.DEPOSIT_MNEMONIC || '',
    depositSeed: process.env.DEPOSIT_SEED || '',
    solana: {
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      requiredConfirmations: parseInt(process.env.SOLANA_REQUIRED_CONFIRMATIONS || '32', 10),
      hotWalletSecret: process.env.SOLANA_HOT_WALLET_SECRET || '',
      usdcMint: process.env.SOLANA_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      usdtMint: process.env.SOLANA_USDT_MINT || 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    },
    evm: {
      rpcUrl: process.env.EVM_RPC_URL || 'https://ethereum-rpc.publicnode.com',
      chainId: parseInt(process.env.EVM_CHAIN_ID || '1', 10),
      requiredConfirmations: parseInt(process.env.EVM_REQUIRED_CONFIRMATIONS || '12', 10),
      hotWalletKey: process.env.EVM_HOT_WALLET_PRIVATE_KEY || '',
      tokens: {
        CRYPTO_USDT: {
          address: process.env.EVM_USDT_CONTRACT || '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          decimals: parseInt(process.env.EVM_USDT_DECIMALS || '6', 10),
        },
        CRYPTO_USDC: {
          address: process.env.EVM_USDC_CONTRACT || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          decimals: parseInt(process.env.EVM_USDC_DECIMALS || '6', 10),
        },
      },
    },
  },

  websocket: {
    pingInterval: 25000,
    pingTimeout: 60000,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  game: {
    minBet: {
      GOLD_COINS: '0.01',
      SWEEPS_COINS: '0.01',
      CRYPTO_BTC: '0.000001',
      CRYPTO_ETH: '0.0001',
      CRYPTO_USDT: '0.01',
      CRYPTO_USDC: '0.01',
      CRYPTO_LTC: '0.0001',
      CRYPTO_DOGE: '1',
      CRYPTO_SOL: '0.001',
    },
    maxBet: {
      GOLD_COINS: '10000',
      SWEEPS_COINS: '10000',
      CRYPTO_BTC: '1',
      CRYPTO_ETH: '10',
      CRYPTO_USDT: '100000',
      CRYPTO_USDC: '100000',
      CRYPTO_LTC: '100',
      CRYPTO_DOGE: '1000000',
      CRYPTO_SOL: '1000',
    },
  },

  rps: {
    baseWinMultiplier: parseFloat(process.env.RPS_BASE_WIN_MULTIPLIER || '1.95'),
    streakBonusStep: parseFloat(process.env.RPS_STREAK_BONUS_STEP || '0.1'),
    maxStreakMultiplier: parseFloat(process.env.RPS_MAX_STREAK_MULTIPLIER || '1.5'),
  },

  pathElimination: {
    rows: parsePathRows(process.env.PATH_ELIMINATION_CONFIG),
    cancelWindowMs: 10 * 60 * 1000,
  },

  kyc: {
    levels: {
      0: { name: 'Unverified', limits: { deposit: '100', withdrawal: '0' } },
      1: { name: 'Basic', limits: { deposit: '1000', withdrawal: '500' } },
      2: { name: 'Verified', limits: { deposit: '10000', withdrawal: '5000' } },
      3: { name: 'Enhanced', limits: { deposit: '100000', withdrawal: '50000' } },
    },
  },

  sweeps: {
    conversionRate: '1.00',
    minRedemption: '50.00',
    maxDailyRedemption: '5000.00',
  },
};

export type Config = typeof config;