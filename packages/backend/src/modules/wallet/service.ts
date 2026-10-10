import { CryptoWallet, CurrencyType } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { balanceService } from '../../services/balance';
import { transactionService } from '../../services/transaction';
import { depositAddressService } from '../../services/depositAddress';
import { chainForCurrency, isValidChainAddress } from '../../services/blockchainUtils';
import { logger } from '../../services/logger';
import { AppError, NotFoundError, InsufficientBalanceError } from '../../middleware/errorHandler';
import { CryptoMath } from '@crypto-gaming/shared';
import { CreateWalletInput, DepositInput, WithdrawalInput, TransferInput } from './schemas';

export class WalletService {
  private static instance: WalletService;

  private constructor() {}

  static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  async getWallets(userId: string): Promise<CryptoWallet[]> {
    return prisma.cryptoWallet.findMany({
      where: { userId, isActive: true },
      orderBy: { currency: 'asc' },
    });
  }

  async getWallet(userId: string, currency: CurrencyType): Promise<CryptoWallet | null> {
    return prisma.cryptoWallet.findUnique({
      where: { userId_currency: { userId, currency } },
    });
  }

  async createWallet(userId: string, input: CreateWalletInput): Promise<CryptoWallet> {
    const existing = await prisma.cryptoWallet.findUnique({
      where: { userId_currency: { userId, currency: input.currency } },
    });

    if (existing) {
      throw new AppError('Wallet already exists for this currency', 409, 'WALLET_EXISTS');
    }

    const wallet = await prisma.cryptoWallet.create({
      data: {
        userId,
        currency: input.currency,
        address: `wallet_${userId}_${input.currency}_${Date.now()}`,
        walletType: input.walletType,
      },
    });

    logger.info('Wallet created', { userId, currency: input.currency, walletId: wallet.id });
    return wallet;
  }

  async getBalance(userId: string, currency?: CurrencyType) {
    if (currency) {
      const balance = await balanceService.getWalletBalance(userId, currency);
      return { currency, balance };
    }

    return balanceService.getUserBalance(userId);
  }

  async requestDeposit(userId: string, input: DepositInput): Promise<{
    address: string;
    qrCode?: string;
    amount: string;
    currency: CurrencyType;
    depositAddresses?: { chain: string; address: string }[];
  }> {
    const wallet = await this.getOrCreateWallet(userId, input.currency);

    // Prefer a real, indexer-tracked on-chain deposit address when the
    // currency/chain is supported and platform seeds are configured.
    let address = wallet.address;
    let depositAddresses: { chain: string; address: string }[] | undefined;
    try {
      const derived = await depositAddressService.getOrCreate(userId, input.currency);
      if (derived.length > 0) {
        depositAddresses = derived.map((d) => ({ chain: d.chain, address: d.address }));
        const primary = chainForCurrency(input.currency);
        const preferred = primary ? derived.find((d) => d.chain === primary) : derived[0];
        address = (preferred ?? derived[0]).address;
      }
    } catch (err) {
      logger.warn('Falling back to placeholder deposit address', {
        userId,
        currency: input.currency,
        error: (err as Error).message,
      });
    }

    const transaction = await transactionService.createDepositTransaction(
      userId,
      input.currency,
      input.amount,
      `pending_${Date.now()}`,
      undefined,
      undefined,
      { requestedAmount: input.amount, network: input.network },
    );

    logger.info('Deposit requested', { userId, currency: input.currency, amount: input.amount, transactionId: transaction.id });

    return {
      address,
      amount: input.amount,
      currency: input.currency,
      depositAddresses,
    };
  }

  async processDeposit(
    userId: string,
    currency: CurrencyType,
    amount: string,
    txHash: string,
    blockHash?: string,
    blockNumber?: bigint
  ) {
    const existingTx = await transactionService.getTransactionByTxHash(txHash);
    if (existingTx) {
      throw new AppError('Transaction already processed', 409, 'DUPLICATE_TRANSACTION');
    }

    await transactionService.createDepositTransaction(
      userId,
      currency,
      amount,
      txHash,
      blockHash,
      blockNumber,
      { processedAt: new Date().toISOString() },
    );

    logger.info('Deposit processed', { userId, currency, amount, txHash });
  }

  async requestWithdrawal(userId: string, input: WithdrawalInput) {
    const wallet = await this.getWallet(userId, input.currency);
    if (!wallet) {
      throw new NotFoundError('Wallet');
    }

    // Validate the destination address format for the currency's chain
    // before any funds are locked.
    const chain = chainForCurrency(input.currency);
    if (chain && !isValidChainAddress(input.address, chain)) {
      throw new AppError(`Invalid ${chain} withdrawal address`, 400, 'INVALID_ADDRESS');
    }

    const validation = await balanceService.validateSufficientBalance(userId, input.currency, input.amount);
    if (!validation.sufficient) {
      throw new InsufficientBalanceError(input.currency, input.amount, validation.currentBalance);
    }

    const fee = this.calculateWithdrawalFee(input.currency, input.amount);
    const netAmount = CryptoMath.subtract(input.amount, fee);

    await balanceService.lockBalance(userId, input.currency, input.amount);

    const transaction = await transactionService.createWithdrawalTransaction(
      userId,
      input.currency,
      input.amount,
      fee,
      { address: input.address, tag: input.tag, network: input.network },
    );

    logger.info('Withdrawal requested', { userId, currency: input.currency, amount: input.amount, transactionId: transaction.id });

    return { transactionId: transaction.id, netAmount, fee };
  }

  async processWithdrawal(transactionId: string, txHash: string): Promise<void> {
    const transaction = await transactionService.getTransaction(transactionId);
    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    if (transaction.type !== 'WITHDRAWAL') {
      throw new AppError('Invalid transaction type', 400, 'INVALID_TRANSACTION_TYPE');
    }

    await transactionService.confirmTransaction(transactionId, txHash);
    await transactionService.completeTransaction(transactionId);

    logger.info('Withdrawal processed', { transactionId, txHash });
  }

  async rejectWithdrawal(transactionId: string, reason: string): Promise<void> {
    const transaction = await transactionService.getTransaction(transactionId);
    if (!transaction) {
      throw new NotFoundError('Transaction');
    }

    if (transaction.type !== 'WITHDRAWAL') {
      throw new AppError('Invalid transaction type', 400, 'INVALID_TRANSACTION_TYPE');
    }

    await transactionService.failTransaction(transactionId, reason);

    logger.info('Withdrawal rejected', { transactionId, reason });
  }

  async transfer(userId: string, input: TransferInput) {
    const validation = await balanceService.validateSufficientBalance(userId, input.currency, input.amount);
    if (!validation.sufficient) {
      throw new InsufficientBalanceError(input.currency, input.amount, validation.currentBalance);
    }

    const recipient = await prisma.user.findUnique({
      where: { id: input.toUserId },
      select: { id: true },
    });

    if (!recipient) {
      throw new NotFoundError('Recipient user');
    }

    if (recipient.id === userId) {
      throw new AppError('Cannot transfer to yourself', 400, 'SELF_TRANSFER');
    }

    const result = await balanceService.transferBalance(userId, input.toUserId, input.currency, input.amount);

    const transaction = await transactionService.createTransaction(
      {
        userId,
        type: 'TRANSFER_OUT',
        currency: input.currency,
        amount: input.amount,
        description: `Transfer to user ${input.toUserId}`,
        metadata: { toUserId: input.toUserId },
      }
    );

    await transactionService.createTransaction(
      {
        userId: input.toUserId,
        type: 'TRANSFER_IN',
        currency: input.currency,
        amount: input.amount,
        description: `Transfer from user ${userId}`,
        metadata: { fromUserId: userId },
      }
    );

    logger.info('Transfer completed', { fromUserId: userId, toUserId: input.toUserId, currency: input.currency, amount: input.amount });

    return { transactionId: transaction.id, fromBalance: result.fromBalance, toBalance: result.toBalance };
  }

  async getTransactionHistory(userId: string, options: { currency?: CurrencyType; limit?: number; offset?: number } = {}) {
    if (options.currency) {
      return balanceService.getBalanceHistory(userId, options.currency, options.limit || 50, options.offset || 0);
    }

    return transactionService.getUserTransactions(userId, {
      limit: options.limit || 50,
      offset: options.offset || 0,
    });
  }

  private async getOrCreateWallet(userId: string, currency: CurrencyType): Promise<CryptoWallet> {
    let wallet = await this.getWallet(userId, currency);
    if (!wallet) {
      wallet = await this.createWallet(userId, { currency, walletType: 'DEPOSIT' });
    }
    return wallet;
  }

  private calculateWithdrawalFee(currency: CurrencyType, amount: string): string {
    const feeRates: Record<CurrencyType, string> = {
      CRYPTO_BTC: '0.0005',
      CRYPTO_ETH: '0.005',
      CRYPTO_USDT: '1',
      CRYPTO_USDC: '1',
      CRYPTO_LTC: '0.001',
      CRYPTO_DOGE: '1',
      CRYPTO_SOL: '0.001',
      GOLD_COINS: '0',
      SWEEPS_COINS: '0',
    };

    const baseFee = feeRates[currency] || '0';
    const percentageFee = CryptoMath.percentage(amount, '0.1');
    return CryptoMath.add(baseFee, percentageFee);
  }
}

export const walletService = WalletService.getInstance();