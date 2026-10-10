import { CurrencyType, RegionType, TransactionStatus, Prisma } from '@prisma/client';
import { CryptoMath } from '@crypto-gaming/shared';
import { prisma } from './prisma';
import { logger } from './logger';

export interface BalanceData {
  goldCoins: string;
  sweepsCoins: string;
  cryptoBalances: Record<string, string>;
  region: RegionType;
}

export interface BalanceUpdate {
  goldCoins?: string;
  sweepsCoins?: string;
  cryptoBalances?: Record<string, string>;
}

export class BalanceService {
  private static instance: BalanceService;

  private constructor() {}

  static getInstance(): BalanceService {
    if (!BalanceService.instance) {
      BalanceService.instance = new BalanceService();
    }
    return BalanceService.instance;
  }

  /**
   * Reads balances from the wallet rows, which are the ledger of record.
   * The `User.goldCoins` / `User.sweepsCoins` columns are a denormalized
   * legacy copy that drifts out of sync (e.g. a GLOBAL user who receives a
   * SWEEPS transfer funds the wallet row but never touches the user columns),
   * so they are never used for reads or writes here.
   */
  async getUserBalance(userId: string): Promise<BalanceData> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { region: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const wallets = await prisma.cryptoWallet.findMany({
      where: { userId, isActive: true },
      select: { currency: true, balance: true },
    });

    let goldCoins = '0';
    let sweepsCoins = '0';
    const cryptoBalances: Record<string, string> = {};

    for (const wallet of wallets) {
      const balance = wallet.balance.toString();
      if (wallet.currency === CurrencyType.GOLD_COINS) {
        goldCoins = balance;
      } else if (wallet.currency === CurrencyType.SWEEPS_COINS) {
        sweepsCoins = balance;
      } else {
        cryptoBalances[wallet.currency] = balance;
      }
    }

    return {
      goldCoins,
      sweepsCoins,
      cryptoBalances,
      region: user.region,
    };
  }

  async getWalletBalance(userId: string, currency: CurrencyType): Promise<string> {
    const wallet = await prisma.cryptoWallet.findUnique({
      where: { userId_currency: { userId, currency } },
      select: { balance: true },
    });

    return wallet?.balance.toString() || '0';
  }

  async updateBalance(
    userId: string,
    currency: CurrencyType,
    amount: string,
    type: 'add' | 'subtract',
    tx?: Prisma.TransactionClient
  ): Promise<string> {
    const client = tx || prisma;

    const wallet = await client.cryptoWallet.findUnique({
      where: { userId_currency: { userId, currency } },
      select: { balance: true },
    });

    if (!wallet) {
      throw new Error(`Wallet not found for currency ${currency}`);
    }

    const currentBalance = wallet.balance.toString();
    const newBalance = type === 'add'
      ? CryptoMath.add(currentBalance, amount)
      : CryptoMath.subtract(currentBalance, amount);

    if (type === 'subtract' && CryptoMath.isLessThan(currentBalance, amount)) {
      throw new Error('Insufficient balance');
    }

    await client.cryptoWallet.update({
      where: { userId_currency: { userId, currency } },
      data: { balance: newBalance },
    });

    logger.info('Balance updated', { userId, currency, oldBalance: currentBalance, newBalance, type });

    return newBalance;
  }

  async addBalance(
    userId: string,
    currency: CurrencyType,
    amount: string,
    tx?: Prisma.TransactionClient
  ): Promise<string> {
    return this.updateBalance(userId, currency, amount, 'add', tx);
  }

  async subtractBalance(
    userId: string,
    currency: CurrencyType,
    amount: string,
    tx?: Prisma.TransactionClient
  ): Promise<string> {
    return this.updateBalance(userId, currency, amount, 'subtract', tx);
  }

  async transferBalance(
    fromUserId: string,
    toUserId: string,
    currency: CurrencyType,
    amount: string,
    tx?: Prisma.TransactionClient
  ): Promise<{ fromBalance: string; toBalance: string }> {
    const move = async (client: Prisma.TransactionClient) => {
      await this.subtractBalance(fromUserId, currency, amount, client);
      await this.addBalance(toUserId, currency, amount, client);
    };

    if (tx) {
      await move(tx);
    } else {
      await prisma.$transaction(move);
    }

    const [fromBalance, toBalance] = await Promise.all([
      this.getWalletBalance(fromUserId, currency),
      this.getWalletBalance(toUserId, currency),
    ]);

    return { fromBalance, toBalance };
  }

  async ensureWalletsExist(userId: string, region: RegionType, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx || prisma;

    const currencies = region === RegionType.US
      ? [CurrencyType.GOLD_COINS, CurrencyType.SWEEPS_COINS]
      : Object.values(CurrencyType).filter(c => c.startsWith('CRYPTO_')) as CurrencyType[];

    for (const currency of currencies) {
      await client.cryptoWallet.upsert({
        where: { userId_currency: { userId, currency } },
        create: {
          userId,
          currency,
          address: `wallet_${userId}_${currency}`,
          walletType: currency.startsWith('CRYPTO_') ? 'HOT' : 'DEPOSIT',
        },
        update: {},
      });
    }
  }

  async getBalanceHistory(
    userId: string,
    currency: CurrencyType,
    limit: number = 50,
    offset: number = 0
  ) {
    return prisma.transaction.findMany({
      where: {
        userId,
        currency,
        status: { in: [TransactionStatus.COMPLETED, TransactionStatus.CONFIRMED] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        type: true,
        amount: true,
        fee: true,
        netAmount: true,
        status: true,
        description: true,
        createdAt: true,
      },
    });
  }

  async getTotalBalanceUSD(userId: string): Promise<string> {
    const balance = await this.getUserBalance(userId);
    let totalUSD = '0';

    // GOLD/SWEEPS are face-value 1:1 inside the platform, so they always count.
    totalUSD = CryptoMath.add(totalUSD, balance.goldCoins);
    totalUSD = CryptoMath.add(totalUSD, balance.sweepsCoins);

    for (const [currency, amount] of Object.entries(balance.cryptoBalances)) {
      const price = await this.getCryptoPriceUSD(currency);
      const value = CryptoMath.multiply(amount, price);
      totalUSD = CryptoMath.add(totalUSD, value);
    }

    return totalUSD;
  }

  private async getCryptoPriceUSD(currency: string): Promise<string> {
    const prices: Record<string, string> = {
      CRYPTO_BTC: '50000',
      CRYPTO_ETH: '3000',
      CRYPTO_USDT: '1',
      CRYPTO_USDC: '1',
      CRYPTO_LTC: '100',
      CRYPTO_DOGE: '0.1',
      CRYPTO_SOL: '150',
    };
    return prices[currency] || '0';
  }

  async validateSufficientBalance(
    userId: string,
    currency: CurrencyType,
    requiredAmount: string
  ): Promise<{ sufficient: boolean; currentBalance: string }> {
    const currentBalance = await this.getWalletBalance(userId, currency);
    return {
      sufficient: CryptoMath.isGreaterThanOrEqual(currentBalance, requiredAmount),
      currentBalance,
    };
  }

  async lockBalance(
    userId: string,
    currency: CurrencyType,
    amount: string,
    tx?: Prisma.TransactionClient
  ): Promise<string> {
    const client = tx || prisma;

    const wallet = await client.cryptoWallet.findUnique({
      where: { userId_currency: { userId, currency } },
      select: { balance: true, pendingBalance: true },
    });

    if (!wallet) {
      throw new Error(`Wallet not found for currency ${currency}`);
    }

    const currentBalance = wallet.balance.toString();
    const currentPending = wallet.pendingBalance.toString();

    if (CryptoMath.isLessThan(currentBalance, amount)) {
      throw new Error('Insufficient balance to lock');
    }

    const newBalance = CryptoMath.subtract(currentBalance, amount);
    const newPending = CryptoMath.add(currentPending, amount);

    await client.cryptoWallet.update({
      where: { userId_currency: { userId, currency } },
      data: {
        balance: newBalance,
        pendingBalance: newPending,
      },
    });

    return newBalance;
  }

  async unlockBalance(
    userId: string,
    currency: CurrencyType,
    amount: string,
    tx?: Prisma.TransactionClient
  ): Promise<string> {
    const client = tx || prisma;

    const wallet = await client.cryptoWallet.findUnique({
      where: { userId_currency: { userId, currency } },
      select: { balance: true, pendingBalance: true },
    });

    if (!wallet) {
      throw new Error(`Wallet not found for currency ${currency}`);
    }

    const currentBalance = wallet.balance.toString();
    const currentPending = wallet.pendingBalance.toString();

    if (CryptoMath.isLessThan(currentPending, amount)) {
      throw new Error('Insufficient pending balance to unlock');
    }

    const newBalance = CryptoMath.add(currentBalance, amount);
    const newPending = CryptoMath.subtract(currentPending, amount);

    await client.cryptoWallet.update({
      where: { userId_currency: { userId, currency } },
      data: {
        balance: newBalance,
        pendingBalance: newPending,
      },
    });

    return newBalance;
  }

  async confirmLockedBalance(
    userId: string,
    currency: CurrencyType,
    amount: string,
    tx?: Prisma.TransactionClient
  ): Promise<string> {
    const client = tx || prisma;

    const wallet = await client.cryptoWallet.findUnique({
      where: { userId_currency: { userId, currency } },
      select: { pendingBalance: true },
    });

    if (!wallet) {
      throw new Error(`Wallet not found for currency ${currency}`);
    }

    const currentPending = wallet.pendingBalance.toString();

    if (CryptoMath.isLessThan(currentPending, amount)) {
      throw new Error('Insufficient pending balance to confirm');
    }

    const newPending = CryptoMath.subtract(currentPending, amount);

    await client.cryptoWallet.update({
      where: { userId_currency: { userId, currency } },
      data: { pendingBalance: newPending },
    });

    return newPending;
  }
}

export const balanceService = BalanceService.getInstance();