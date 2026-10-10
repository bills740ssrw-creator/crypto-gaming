import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { ethers } from 'ethers';
import bs58 from 'bs58';
import { CurrencyType, TransactionStatus, TransactionType } from '@prisma/client';
import { prisma } from './prisma';
import { config } from '../config';
import { logger } from './logger';
import { transactionService } from './transaction';
import { CHAINS, baseUnitsToDecimalString, chainForCurrency, decimalStringToBaseUnits, isValidChainAddress } from './blockchainUtils';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
] as const;

const SOLANA_FEE_LAMPORTS = 5000n;

const STUCK_PROCESSING_MS = 10 * 60 * 1000;

/**
 * Automated hot-wallet payout engine.
 *
 * Picks up PENDING withdrawal transactions created by walletService
 * (funds already locked in pendingBalance), claims them via a conditional
 * PENDING -> PROCESSING update, broadcasts the on-chain transfer from the
 * hot wallet, then lets the confirmation pass track depth until the
 * withdrawal settles (COMPLETED) or fails and refunds (FAILED + unlock).
 *
 * Network calls always happen OUTSIDE database transactions.
 */
export class PayoutEngine {
  private static instance: PayoutEngine;

  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private solana: Connection | null = null;
  private solanaHotKeypair: Keypair | null = null;
  private evm: ethers.JsonRpcProvider | null = null;
  private evmHotWallet: ethers.Wallet | null = null;

  private constructor() {}

  static getInstance(): PayoutEngine {
    if (!PayoutEngine.instance) {
      PayoutEngine.instance = new PayoutEngine();
    }
    return PayoutEngine.instance;
  }

  start(): void {
    if (this.timer) return;

    if (!config.blockchain.enabled) {
      logger.info('Payout engine disabled via BLOCKCHAIN_INDEXER_ENABLED');
      return;
    }

    this.solana = new Connection(config.blockchain.solana.rpcUrl, 'confirmed');

    const solSecret = config.blockchain.solana.hotWalletSecret;
    if (solSecret) {
      try {
        this.solanaHotKeypair = Keypair.fromSecretKey(bs58.decode(solSecret));
        logger.info('Solana hot wallet loaded', { address: this.solanaHotKeypair.publicKey.toBase58() });
      } catch (err) {
        logger.error('Failed to load SOLANA_HOT_WALLET_SECRET; Solana payouts disabled', {
          error: (err as Error).message,
        });
      }
    } else {
      logger.warn('SOLANA_HOT_WALLET_SECRET not set; Solana payouts will fail until configured');
    }

    this.evm = new ethers.JsonRpcProvider(config.blockchain.evm.rpcUrl, config.blockchain.evm.chainId, {
      staticNetwork: true,
    });

    const evmKey = config.blockchain.evm.hotWalletKey;
    if (evmKey) {
      try {
        this.evmHotWallet = new ethers.Wallet(evmKey, this.evm);
        logger.info('EVM hot wallet loaded', { address: this.evmHotWallet.address });
      } catch (err) {
        logger.error('Failed to load EVM_HOT_WALLET_PRIVATE_KEY; EVM payouts disabled', {
          error: (err as Error).message,
        });
      }
    } else {
      logger.warn('EVM_HOT_WALLET_PRIVATE_KEY not set; EVM payouts will fail until configured');
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, config.blockchain.payoutIntervalMs);

    logger.info('Payout engine started', { payoutIntervalMs: config.blockchain.payoutIntervalMs });
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Payout engine stopped');
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.processPendingWithdrawals();
      await this.updateOnchainWithdrawalConfirmations();
      await this.detectStuckProcessing();
    } catch (err) {
      logger.error('Payout engine tick failed', { error: (err as Error).message });
    } finally {
      this.ticking = false;
    }
  }

  // -------------------------------------------------------------------------
  // Broadcast
  // -------------------------------------------------------------------------

  async processPendingWithdrawals(): Promise<void> {
    const pending = await prisma.transaction.findMany({
      where: {
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });

    for (const t of pending) {
      if (t.txHash) continue; // already broadcast, confirmation pass owns it
      const currency = t.currency as CurrencyType;
      const chain = chainForCurrency(currency);
      if (!chain) continue; // BTC/LTC/DOGE etc. handled by other processors

      // Atomic claim: only one worker may move PENDING -> PROCESSING.
      const meta = (t.metadata ?? {}) as Record<string, unknown>;
      const claimed = await prisma.transaction.updateMany({
        where: { id: t.id, status: TransactionStatus.PENDING },
        data: {
          status: TransactionStatus.PROCESSING,
          metadata: { ...meta, claimedAt: new Date().toISOString() },
        },
      });
      if (claimed.count === 0) continue;

      try {
        await this.broadcastWithdrawal(t.id);
      } catch (err) {
        const message = (err as Error).message;
        logger.error('Withdrawal broadcast failed; refunding', {
          transactionId: t.id,
          error: message,
        });
        try {
          await transactionService.failTransaction(t.id, `Broadcast failed: ${message}`);
        } catch (failErr) {
          logger.error('Failed to mark withdrawal FAILED after broadcast error', {
            transactionId: t.id,
            error: (failErr as Error).message,
          });
        }
      }
    }
  }

  private async broadcastWithdrawal(transactionId: string): Promise<void> {
    const t = await transactionService.getTransaction(transactionId);
    if (!t) throw new Error('Transaction not found');
    if (t.type !== TransactionType.WITHDRAWAL) throw new Error('Not a withdrawal');
    if (t.currency === CurrencyType.GOLD_COINS || t.currency === CurrencyType.SWEEPS_COINS) {
      throw new Error('On-chain payout attempted for off-chain currency');
    }

    const meta = (t.metadata ?? {}) as { address?: string };
    const destination = meta.address;
    if (!destination) throw new Error('Withdrawal is missing destination address in metadata');

    const chain = chainForCurrency(t.currency as CurrencyType);
    if (!chain) throw new Error(`Unsupported payout currency: ${t.currency}`);
    if (!isValidChainAddress(destination, chain)) {
      throw new Error(`Invalid ${chain} destination address`);
    }

    // Send the NET amount — the platform fee was already deducted at request time.
    if (chain === CHAINS.SOLANA) {
      await this.broadcastSolana(transactionId, t.userId, destination, t.netAmount);
    } else {
      await this.broadcastEvm(transactionId, destination, t.currency as CurrencyType, t.netAmount);
    }
  }

  private async broadcastSolana(
    transactionId: string,
    userId: string,
    destination: string,
    netAmount: string
  ): Promise<void> {
    if (!this.solana || !this.solanaHotKeypair) {
      throw new Error('Solana hot wallet is not configured');
    }

    const lamports = decimalStringToBaseUnits(netAmount, 9);
    if (lamports <= 0n) throw new Error('Withdrawal amount too small');

    const hotBalance = BigInt(await this.solana.getBalance(this.solanaHotKeypair.publicKey, 'confirmed'));
    if (hotBalance < lamports + SOLANA_FEE_LAMPORTS) {
      throw new Error(
        `Solana hot wallet balance too low: have ${baseUnitsToDecimalString(hotBalance, 9)} SOL, ` +
          `need ${baseUnitsToDecimalString(lamports + SOLANA_FEE_LAMPORTS, 9)} SOL`
      );
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.solanaHotKeypair.publicKey,
        toPubkey: new PublicKey(destination),
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(this.solana, transaction, [this.solanaHotKeypair], {
      commitment: 'confirmed',
    });
    const slot = await this.solana.getSlot('confirmed');

    await this.markBroadcasted(transactionId, userId, CHAINS.SOLANA, signature, BigInt(slot), undefined, {
      slot,
    });

    logger.info('Solana withdrawal broadcast', { transactionId, signature, amount: netAmount });
  }

  private async broadcastEvm(
    transactionId: string,
    destination: string,
    currency: CurrencyType,
    netAmount: string
  ): Promise<void> {
    if (!this.evm || !this.evmHotWallet) {
      throw new Error('EVM hot wallet is not configured');
    }

    const to = ethers.getAddress(destination);
    let response: ethers.TransactionResponse;

    if (currency === CurrencyType.CRYPTO_ETH) {
      const value = decimalStringToBaseUnits(netAmount, 18);
      if (value <= 0n) throw new Error('Withdrawal amount too small');

      const hotBalance = await this.evm.getBalance(this.evmHotWallet.address, 'latest');
      const feeData = await this.evm.getFeeData();
      const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
      const gasCost = 21_000n * gasPrice;
      if (hotBalance < value + gasCost) {
        throw new Error(
          `EVM hot wallet balance too low: have ${baseUnitsToDecimalString(hotBalance, 18)} ETH, ` +
            `need ${baseUnitsToDecimalString(value + gasCost, 18)} ETH`
        );
      }

      response = await this.evmHotWallet.sendTransaction({ to, value });
    } else {
      const token = (config.blockchain.evm.tokens as Record<string, { address: string; decimals: number } | undefined>)[currency];
      if (!token) throw new Error(`No EVM token contract configured for ${currency}`);

      const ethBalance = await this.evm.getBalance(this.evmHotWallet.address, 'latest');
      if (ethBalance === 0n) {
        throw new Error('EVM hot wallet has no ETH to pay gas');
      }

      const contract = new ethers.Contract(token.address, ERC20_ABI, this.evmHotWallet);
      const amount = decimalStringToBaseUnits(netAmount, token.decimals);
      if (amount <= 0n) throw new Error('Withdrawal amount too small');

      response = (await contract.transfer(to, amount)) as ethers.TransactionResponse;
    }

    const receipt = await response.wait(1);
    if (!receipt) throw new Error('EVM transaction receipt unavailable after wait');
    if (receipt.status === 0) throw new Error('EVM transaction reverted on-chain');

    await this.markBroadcasted(transactionId, '', CHAINS.EVM, response.hash, BigInt(receipt.blockNumber), receipt.blockHash, {
      to,
    });

    logger.info('EVM withdrawal broadcast', { transactionId, txHash: response.hash, amount: netAmount, currency });
  }

  /**
   * Records the broadcast result and flips the row back to PENDING so the
   * confirmation pass can track depth and settle it (CONFIRMED -> COMPLETED)
   * or refund it. Runs in a single DB transaction.
   */
  private async markBroadcasted(
    transactionId: string,
    _userId: string,
    chain: string,
    txHash: string,
    blockNumber: bigint,
    blockHash?: string,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    await prisma.$transaction(async (txClient) => {
      const t = await txClient.transaction.findUnique({ where: { id: transactionId } });
      if (!t) throw new Error('Transaction not found');
      const meta = (t.metadata ?? {}) as Record<string, unknown>;

      await txClient.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.PENDING,
          txHash,
          blockNumber,
          blockHash: blockHash ?? null,
          confirmations: 1,
          metadata: {
            ...meta,
            payoutEngine: true,
            chain,
            broadcastAt: new Date().toISOString(),
            ...extra,
          },
        },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Confirmation tracking / settlement
  // -------------------------------------------------------------------------

  async updateOnchainWithdrawalConfirmations(): Promise<void> {
    const rows = await prisma.transaction.findMany({
      where: {
        type: TransactionType.WITHDRAWAL,
        status: { in: [TransactionStatus.PENDING, TransactionStatus.CONFIRMED] },
        txHash: { not: null },
        metadata: { path: ['payoutEngine'], equals: true },
      },
      take: 50,
    });
    if (rows.length === 0) return;

    let currentSlot: number | null = null;
    let currentBlock: number | null = null;

    for (const t of rows) {
      if (!t.txHash || t.blockNumber === null) continue;
      const meta = (t.metadata ?? {}) as { chain?: string };

      try {
        if (meta.chain === CHAINS.SOLANA && this.solana) {
          if (currentSlot === null) currentSlot = await this.solana.getSlot('confirmed');
          const updated = await transactionService.setConfirmations(t.id, Math.max(0, currentSlot - Number(t.blockNumber)), {
            blockNumber: t.blockNumber,
          });
          if (updated.status === TransactionStatus.CONFIRMED) {
            await transactionService.completeTransaction(t.id);
            logger.info('Solana withdrawal settled', { transactionId: t.id, txHash: t.txHash });
          }
        } else if (meta.chain === CHAINS.EVM && this.evm) {
          if (currentBlock === null) currentBlock = await this.evm.getBlockNumber();

          const receipt = await this.evm.getTransactionReceipt(t.txHash);
          if (!receipt) {
            // Broadcast but not yet mined (or dropped) — leave for next pass.
            continue;
          }
          if (receipt.status === 0) {
            logger.error('EVM withdrawal reverted on-chain; refunding', { transactionId: t.id, txHash: t.txHash });
            await transactionService.failTransaction(t.id, 'EVM transaction reverted on-chain');
            continue;
          }

          const updated = await transactionService.setConfirmations(t.id, Math.max(0, currentBlock - Number(t.blockNumber)), {
            blockNumber: t.blockNumber,
          });
          if (updated.status === TransactionStatus.CONFIRMED) {
            await transactionService.completeTransaction(t.id);
            logger.info('EVM withdrawal settled', { transactionId: t.id, txHash: t.txHash });
          }
        }
      } catch (err) {
        logger.error('Withdrawal confirmation update failed', {
          transactionId: t.id,
          error: (err as Error).message,
        });
      }
    }
  }

  /**
   * Rows stuck in PROCESSING with no broadcast hash mean the process died
   * mid-broadcast. Never auto-fail these (the chain transfer may have left
   * the hot wallet) — flag them for manual reconciliation instead.
   */
  private async detectStuckProcessing(): Promise<void> {
    const cutoff = new Date(Date.now() - STUCK_PROCESSING_MS);
    const stuck = await prisma.transaction.findMany({
      where: {
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PROCESSING,
        txHash: null,
        updatedAt: { lt: cutoff },
      },
      take: 10,
    });

    for (const t of stuck) {
      logger.error('MANUAL_RECONCILE_NEEDED: withdrawal stuck in PROCESSING with no broadcast hash', {
        transactionId: t.id,
        userId: t.userId,
        currency: t.currency,
        amount: t.amount.toString(),
      });
    }
  }
}

export const payoutEngine = PayoutEngine.getInstance();
