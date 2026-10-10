import { TransactionType, TransactionStatus, CurrencyType, Prisma } from '@prisma/client';
import { CryptoMath, generateTransactionId } from '@crypto-gaming/shared';
import { prisma } from './prisma';
import { balanceService } from './balance';
import { logger } from './logger';

export interface CreateTransactionParams {
  userId: string;
  walletId?: string;
  type: TransactionType;
  currency: CurrencyType;
  amount: string;
  fee?: string;
  description?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  requiredConfirmations?: number;
  confirmations?: number;
  txHash?: string;
  blockHash?: string;
  blockNumber?: bigint;
}

export interface TransactionWithWallet {
  id: string;
  userId: string;
  walletId: string | null;
  type: TransactionType;
  status: TransactionStatus;
  currency: CurrencyType;
  amount: string;
  fee: string;
  netAmount: string;
  description: string | null;
  referenceId: string | null;
  blockHash: string | null;
  blockNumber: bigint | null;
  txHash: string | null;
  confirmations: number;
  requiredConfirmations: number;
  metadata: Record<string, unknown>;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TransactionService {
  private static instance: TransactionService;

  private constructor() {}

  static getInstance(): TransactionService {
    if (!TransactionService.instance) {
      TransactionService.instance = new TransactionService();
    }
    return TransactionService.instance;
  }

  async createTransaction(params: CreateTransactionParams, tx?: Prisma.TransactionClient): Promise<TransactionWithWallet> {
    const client = tx || prisma;
    const fee = params.fee || '0';
    const netAmount = params.type === TransactionType.WITHDRAWAL
      ? CryptoMath.subtract(params.amount, fee)
      : CryptoMath.add(params.amount, fee);

    const transaction = await client.transaction.create({
      data: {
        userId: params.userId,
        walletId: params.walletId,
        type: params.type,
        status: TransactionStatus.PENDING,
        currency: params.currency,
        amount: params.amount,
        fee,
        netAmount,
        description: params.description,
        referenceId: params.referenceId || generateTransactionId(),
        blockHash: params.blockHash ?? null,
        blockNumber: params.blockNumber ?? null,
        txHash: params.txHash ?? null,
        confirmations: params.confirmations || 0,
        requiredConfirmations: params.requiredConfirmations || 1,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    logger.info('Transaction created', { transactionId: transaction.id, ...params });

    return this.formatTransaction(transaction);
  }

  async createDepositTransaction(
    userId: string,
    currency: CurrencyType,
    amount: string,
    txHash: string,
    blockHash?: string,
    blockNumber?: bigint,
    metadata?: Record<string, unknown>,
    options?: { confirmations?: number; requiredConfirmations?: number },
    tx?: Prisma.TransactionClient
  ): Promise<TransactionWithWallet> {
    const client = tx || prisma;

    const wallet = await client.cryptoWallet.findUnique({
      where: { userId_currency: { userId, currency } },
      select: { id: true },
    });

    if (!wallet) {
      throw new Error(`Wallet not found for currency ${currency}`);
    }

    return this.createTransaction(
      {
        userId,
        walletId: wallet.id,
        type: TransactionType.DEPOSIT,
        currency,
        amount,
        description: `Deposit of ${amount} ${currency}`,
        txHash,
        blockHash,
        blockNumber,
        metadata,
        confirmations: options?.confirmations,
        requiredConfirmations: options?.requiredConfirmations || this.getRequiredConfirmations(currency),
      },
      client
    );
  }

  async createWithdrawalTransaction(
    userId: string,
    currency: CurrencyType,
    amount: string,
    fee: string,
    metadata?: Record<string, unknown>,
    tx?: Prisma.TransactionClient
  ): Promise<TransactionWithWallet> {
    const client = tx || prisma;

    const wallet = await client.cryptoWallet.findUnique({
      where: { userId_currency: { userId, currency } },
      select: { id: true },
    });

    if (!wallet) {
      throw new Error(`Wallet not found for currency ${currency}`);
    }

    return this.createTransaction(
      {
        userId,
        walletId: wallet.id,
        type: TransactionType.WITHDRAWAL,
        currency,
        amount,
        fee,
        description: `Withdrawal of ${amount} ${currency}`,
        metadata,
      },
      client
    );
  }

  async createWagerTransaction(
    userId: string,
    currency: CurrencyType,
    amount: string,
    gameId: string,
    sessionId: string,
    tx?: Prisma.TransactionClient
  ): Promise<TransactionWithWallet> {
    const client = tx || prisma;

    const wallet = await client.cryptoWallet.findUnique({
      where: { userId_currency: { userId, currency } },
      select: { id: true },
    });

    if (!wallet) {
      throw new Error(`Wallet not found for currency ${currency}`);
    }

    return this.createTransaction(
      {
        userId,
        walletId: wallet.id,
        type: TransactionType.WAGER,
        currency,
        amount,
        description: `Wager on game ${gameId}`,
        metadata: { gameId, sessionId },
      },
      client
    );
  }

  async createWinTransaction(
    userId: string,
    currency: CurrencyType,
    amount: string,
    gameId: string,
    sessionId: string,
    tx?: Prisma.TransactionClient
  ): Promise<TransactionWithWallet> {
    const client = tx || prisma;

    const wallet = await client.cryptoWallet.findUnique({
      where: { userId_currency: { userId, currency } },
      select: { id: true },
    });

    if (!wallet) {
      throw new Error(`Wallet not found for currency ${currency}`);
    }

    return this.createTransaction(
      {
        userId,
        walletId: wallet.id,
        type: TransactionType.WIN,
        currency,
        amount,
        description: `Win from game ${gameId}`,
        metadata: { gameId, sessionId },
      },
      client
    );
  }

  async confirmTransaction(transactionId: string, txHash?: string, blockHash?: string, blockNumber?: bigint, tx?: Prisma.TransactionClient): Promise<TransactionWithWallet> {
    const client = tx || prisma;

    const transaction = await client.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status !== TransactionStatus.PENDING && transaction.status !== TransactionStatus.CONFIRMED) {
      throw new Error(`Transaction cannot be confirmed, current status: ${transaction.status}`);
    }

    const newConfirmations = (transaction.confirmations || 0) + 1;
    const isFullyConfirmed = newConfirmations >= transaction.requiredConfirmations;

    const updatedTransaction = await client.transaction.update({
      where: { id: transactionId },
      data: {
        status: isFullyConfirmed ? TransactionStatus.CONFIRMED : TransactionStatus.CONFIRMED,
        confirmations: newConfirmations,
        txHash: txHash || transaction.txHash,
        blockHash: blockHash || transaction.blockHash,
        blockNumber: blockNumber || transaction.blockNumber,
        processedAt: isFullyConfirmed ? new Date() : transaction.processedAt,
      },
    });

    if (isFullyConfirmed) {
      await this.processConfirmedTransaction(updatedTransaction, client);
    }

    logger.info('Transaction confirmed', { transactionId, confirmations: newConfirmations, isFullyConfirmed });

    return this.formatTransaction(updatedTransaction);
  }

  /**
   * Sets the absolute confirmation depth for an on-chain transaction (rather than
   * incrementing by one). When the depth first reaches `requiredConfirmations`,
   * the row transitions PENDING -> CONFIRMED exactly once and the ledger side
   * effect runs (deposit credit / withdrawal pending-balance confirmation).
   *
   * Safe against concurrent callers: the PENDING -> CONFIRMED transition uses a
   * conditional updateMany, so only one caller wins the credit.
   */
  async setConfirmations(
    transactionId: string,
    confirmations: number,
    extra: { txHash?: string; blockHash?: string; blockNumber?: bigint } = {}
  ): Promise<TransactionWithWallet> {
    const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const terminal: TransactionStatus[] = [
      TransactionStatus.COMPLETED,
      TransactionStatus.FAILED,
      TransactionStatus.CANCELLED,
      TransactionStatus.REJECTED,
    ];
    if (terminal.includes(transaction.status)) {
      return this.formatTransaction(transaction);
    }

    const nextConfirmations = Math.max(transaction.confirmations || 0, confirmations);
    const isFullyConfirmed = nextConfirmations >= transaction.requiredConfirmations;

    const baseUpdate = {
      confirmations: nextConfirmations,
      ...(extra.txHash ? { txHash: extra.txHash } : {}),
      ...(extra.blockHash ? { blockHash: extra.blockHash } : {}),
      ...(extra.blockNumber !== undefined ? { blockNumber: extra.blockNumber } : {}),
    };

    if (!isFullyConfirmed) {
      const updated = await prisma.transaction.update({
        where: { id: transactionId },
        data: baseUpdate,
      });
      return this.formatTransaction(updated);
    }

    if (transaction.status === TransactionStatus.CONFIRMED) {
      // Already credited on a previous pass; just top up the counter.
      const updated = await prisma.transaction.update({
        where: { id: transactionId },
        data: baseUpdate,
      });
      return this.formatTransaction(updated);
    }

    // Status is PENDING (or PROCESSING for engine-broadcast payouts that have
    // not yet been flipped back) — attempt the one-way transition to CONFIRMED.
    const claimed = await prisma.transaction.updateMany({
      where: { id: transactionId, status: TransactionStatus.PENDING },
      data: {
        ...baseUpdate,
        status: TransactionStatus.CONFIRMED,
        processedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      // Another worker won the race (or status is PROCESSING); do not credit.
      const current = await prisma.transaction.findUnique({ where: { id: transactionId } });
      return this.formatTransaction(current!);
    }

    const confirmed = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!confirmed) {
      throw new Error('Transaction not found');
    }

    await prisma.$transaction(async (txClient) => {
      await this.processConfirmedTransaction(confirmed, txClient);
    });

    logger.info('Transaction fully confirmed via setConfirmations', {
      transactionId,
      confirmations: nextConfirmations,
      requiredConfirmations: confirmed.requiredConfirmations,
    });

    return this.formatTransaction(confirmed);
  }

  async completeTransaction(transactionId: string, tx?: Prisma.TransactionClient): Promise<TransactionWithWallet> {
    const client = tx || prisma;

    const transaction = await client.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status !== TransactionStatus.CONFIRMED) {
      throw new Error(`Transaction cannot be completed, current status: ${transaction.status}`);
    }

    const updatedTransaction = await client.transaction.update({
      where: { id: transactionId },
      data: {
        status: TransactionStatus.COMPLETED,
        processedAt: new Date(),
      },
    });

    logger.info('Transaction completed', { transactionId });

    return this.formatTransaction(updatedTransaction);
  }

  async failTransaction(transactionId: string, reason: string, tx?: Prisma.TransactionClient): Promise<TransactionWithWallet> {
    const client = tx || prisma;

    const transaction = await client.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status === TransactionStatus.COMPLETED) {
      throw new Error('Cannot fail a completed transaction');
    }

    const fail = async (txClient: Prisma.TransactionClient) => {
      if (transaction.type === TransactionType.WITHDRAWAL && transaction.walletId) {
        await balanceService.unlockBalance(transaction.userId, transaction.currency, transaction.amount.toString(), txClient);
      }

      await txClient.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.FAILED,
          metadata: { ...(transaction.metadata as Record<string, unknown>), failureReason: reason },
          processedAt: new Date(),
        },
      });
    };

    if (tx) {
      await fail(tx);
    } else {
      await prisma.$transaction(fail);
    }

    logger.info('Transaction failed', { transactionId, reason });

    return this.formatTransaction(await client.transaction.findUnique({ where: { id: transactionId } })!);
  }

  async cancelTransaction(transactionId: string, tx?: Prisma.TransactionClient): Promise<TransactionWithWallet> {
    const client = tx || prisma;

    const transaction = await client.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status !== TransactionStatus.PENDING) {
      throw new Error(`Transaction cannot be cancelled, current status: ${transaction.status}`);
    }

    const cancelOp = async (txClient: Prisma.TransactionClient) => {
      if (transaction.type === TransactionType.WITHDRAWAL && transaction.walletId) {
        await balanceService.unlockBalance(transaction.userId, transaction.currency, transaction.amount.toString(), txClient);
      }

      await txClient.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.CANCELLED,
          processedAt: new Date(),
        },
      });
    };

    if (tx) {
      await cancelOp(tx);
    } else {
      await prisma.$transaction(cancelOp);
    }

    logger.info('Transaction cancelled', { transactionId });

    return this.formatTransaction(await client.transaction.findUnique({ where: { id: transactionId } })!);
  }

  async getTransaction(transactionId: string): Promise<TransactionWithWallet | null> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    return transaction ? this.formatTransaction(transaction) : null;
  }

  async getTransactionByReferenceId(referenceId: string): Promise<TransactionWithWallet | null> {
    const transaction = await prisma.transaction.findUnique({
      where: { referenceId },
    });

    return transaction ? this.formatTransaction(transaction) : null;
  }

  async getTransactionByTxHash(txHash: string): Promise<TransactionWithWallet | null> {
    const transaction = await prisma.transaction.findUnique({
      where: { txHash },
    });

    return transaction ? this.formatTransaction(transaction) : null;
  }

  async getUserTransactions(
    userId: string,
    options: {
      type?: TransactionType;
      status?: TransactionStatus;
      currency?: CurrencyType;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    const { type, status, currency, limit = 50, offset = 0, startDate, endDate } = options;

    const where: Prisma.TransactionWhereInput = { userId };

    if (type) where.type = type;
    if (status) where.status = status;
    if (currency) where.currency = currency;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      transactions: transactions.map(this.formatTransaction),
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPendingDeposits(currency?: CurrencyType): Promise<TransactionWithWallet[]> {
    const where: Prisma.TransactionWhereInput = {
      type: TransactionType.DEPOSIT,
      status: { in: [TransactionStatus.PENDING, TransactionStatus.CONFIRMED] },
    };

    if (currency) where.currency = currency;

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return transactions.map(this.formatTransaction);
  }

  async getPendingWithdrawals(limit: number = 100): Promise<TransactionWithWallet[]> {
    const transactions = await prisma.transaction.findMany({
      where: {
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return transactions.map(this.formatTransaction);
  }

  private async processConfirmedTransaction(transaction: any, client: Prisma.TransactionClient): Promise<void> {
    switch (transaction.type) {
      case TransactionType.DEPOSIT:
        await balanceService.addBalance(transaction.userId, transaction.currency, transaction.amount, client);
        break;
      case TransactionType.WITHDRAWAL:
        await balanceService.confirmLockedBalance(transaction.userId, transaction.currency, transaction.amount, client);
        break;
      case TransactionType.WAGER:
        await balanceService.confirmLockedBalance(transaction.userId, transaction.currency, transaction.amount, client);
        break;
      case TransactionType.WIN:
        await balanceService.addBalance(transaction.userId, transaction.currency, transaction.amount, client);
        break;
      case TransactionType.BONUS:
        await balanceService.addBalance(transaction.userId, transaction.currency, transaction.amount, client);
        break;
      case TransactionType.REFUND:
        await balanceService.addBalance(transaction.userId, transaction.currency, transaction.amount, client);
        break;
    }
  }

  private getRequiredConfirmations(currency: CurrencyType): number {
    const confirmations: Record<CurrencyType, number> = {
      CRYPTO_BTC: 3,
      CRYPTO_ETH: 12,
      CRYPTO_USDT: 12,
      CRYPTO_USDC: 12,
      CRYPTO_LTC: 6,
      CRYPTO_DOGE: 60,
      CRYPTO_SOL: 32,
      GOLD_COINS: 1,
      SWEEPS_COINS: 1,
    };
    return confirmations[currency] || 1;
  }

  private formatTransaction(transaction: any): TransactionWithWallet {
    return {
      ...transaction,
      amount: transaction.amount.toString(),
      fee: transaction.fee.toString(),
      netAmount: transaction.netAmount.toString(),
      blockNumber: transaction.blockNumber ? BigInt(transaction.blockNumber.toString()) : null,
    };
  }
}

export const transactionService = TransactionService.getInstance();