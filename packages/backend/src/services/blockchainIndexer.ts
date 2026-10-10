import { Connection, PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import { CurrencyType, TransactionStatus, TransactionType } from '@prisma/client';
import { prisma } from './prisma';
import { config } from '../config';
import { logger } from './logger';
import { transactionService } from './transaction';
import {
  CHAINS,
  ERC20_TRANSFER_TOPIC,
  addressToTopic,
  baseUnitsToDecimalString,
  decodeErc20TransferLog,
  decimalsForCurrency,
  depositDedupId,
  parseSolanaDepositDeltas,
} from './blockchainUtils';

/**
 * Background deposit indexer.
 *
 * Polls Solana (signatures per deposit address, native + SPL) and EVM
 * (native balance deltas + ERC-20 Transfer logs) RPC endpoints, maps incoming
 * transfers to user deposit addresses, and records them in the Transaction
 * ledger. Balance credits happen only once the required number of chain
 * confirmations is reached, via transactionService.setConfirmations.
 */
export class BlockchainIndexer {
  private static instance: BlockchainIndexer;

  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private solana: Connection | null = null;
  private evm: ethers.JsonRpcProvider | null = null;

  private constructor() {}

  static getInstance(): BlockchainIndexer {
    if (!BlockchainIndexer.instance) {
      BlockchainIndexer.instance = new BlockchainIndexer();
    }
    return BlockchainIndexer.instance;
  }

  start(): void {
    if (this.timer) return;

    if (!config.blockchain.enabled) {
      logger.info('Blockchain indexer disabled via BLOCKCHAIN_INDEXER_ENABLED');
      return;
    }

    this.solana = new Connection(config.blockchain.solana.rpcUrl, 'confirmed');
    this.evm = new ethers.JsonRpcProvider(config.blockchain.evm.rpcUrl, config.blockchain.evm.chainId, {
      staticNetwork: true,
    });

    this.timer = setInterval(() => {
      void this.tick();
    }, config.blockchain.pollIntervalMs);

    logger.info('Blockchain indexer started', {
      pollIntervalMs: config.blockchain.pollIntervalMs,
      solanaRpc: config.blockchain.solana.rpcUrl,
      evmRpc: config.blockchain.evm.rpcUrl,
    });

    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Blockchain indexer stopped');
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    // Each phase is isolated so one chain's RPC outage cannot stall the
    // other chain or the confirmation pass.
    const phases: [string, () => Promise<void>][] = [
      ['solana', () => this.pollSolanaDeposits()],
      ['evm-native', () => this.pollEvmNativeBalances()],
      ['evm-token', () => this.pollEvmTokenDeposits()],
      ['confirmations', () => this.updatePendingDepositConfirmations()],
    ];
    for (const [name, run] of phases) {
      try {
        await run();
      } catch (err) {
        logger.error('Blockchain indexer phase failed', { phase: name, error: (err as Error).message });
      }
    }
    this.ticking = false;
  }

  // -------------------------------------------------------------------------
  // Solana
  // -------------------------------------------------------------------------

  private async pollSolanaDeposits(): Promise<void> {
    if (!this.solana) return;

    const records = await prisma.depositAddress.findMany({ where: { chain: CHAINS.SOLANA } });
    if (records.length === 0) return;

    const mintMapExact: Record<string, CurrencyType> = {
      [config.blockchain.solana.usdcMint]: CurrencyType.CRYPTO_USDC,
      [config.blockchain.solana.usdtMint]: CurrencyType.CRYPTO_USDT,
    };

    for (const record of records) {
      try {
        const pubKey = new PublicKey(record.address);
        const signatures = await this.solana.getSignaturesForAddress(pubKey, {
          limit: 25,
          until: record.lastScannedSignature ?? undefined,
        });
        if (signatures.length === 0) continue;

        for (const sigInfo of [...signatures].reverse()) {
          if (sigInfo.err) continue;

          const tx = await this.solana.getTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
          });
          if (!tx || !tx.meta) continue;

          const message = tx.transaction.message;
          const staticKeys =
            'accountKeys' in message ? message.accountKeys : message.getAccountKeys().staticAccountKeys;
          const accountKeys = staticKeys.map((k) => k.toBase58());
          const metaLike = {
            preBalances: tx.meta.preBalances,
            postBalances: tx.meta.postBalances,
            preTokenBalances: tx.meta.preTokenBalances ?? undefined,
            postTokenBalances: tx.meta.postTokenBalances ?? undefined,
            loadedAddresses: {
              writable: (tx.meta.loadedAddresses?.writable ?? []).map((k) => k.toBase58()),
              readonly: (tx.meta.loadedAddresses?.readonly ?? []).map((k) => k.toBase58()),
            },
          };
          const deltas = parseSolanaDepositDeltas(metaLike, accountKeys, record.address, mintMapExact);
          if (deltas.length === 0) continue;

          const currentSlot = await this.solana.getSlot('confirmed');
          const confirmations = Math.max(0, currentSlot - tx.slot);

          for (const delta of deltas) {
            const dedupId = depositDedupId(sigInfo.signature, delta.subIndex);
            const existing = await prisma.transaction.findUnique({ where: { txHash: dedupId } });
            if (existing) continue;

            const amount = baseUnitsToDecimalString(delta.baseUnits, decimalsForCurrency(delta.currency));
            await transactionService.createDepositTransaction(
              record.userId,
              delta.currency,
              amount,
              dedupId,
              undefined,
              BigInt(tx.slot),
              {
                onchain: true,
                chain: CHAINS.SOLANA,
                slot: tx.slot,
                blockTime: sigInfo.blockTime ?? null,
                depositAddress: record.address,
              },
              {
                confirmations,
                requiredConfirmations: config.blockchain.solana.requiredConfirmations,
              }
            );

            logger.info('Solana deposit indexed', {
              userId: record.userId,
              currency: delta.currency,
              amount,
              signature: sigInfo.signature,
              confirmations,
            });
          }
        }

        const newest = signatures[0]?.signature;
        if (newest) {
          await prisma.depositAddress.update({
            where: { id: record.id },
            data: { lastScannedSignature: newest },
          });
        }
      } catch (err) {
        logger.error('Solana deposit poll failed for address', {
          address: record.address,
          error: (err as Error).message,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // EVM — native coin (balance-delta detection)
  // -------------------------------------------------------------------------

  private async pollEvmNativeBalances(): Promise<void> {
    if (!this.evm) return;

    const records = await prisma.depositAddress.findMany({ where: { chain: CHAINS.EVM } });
    if (records.length === 0) return;

    const currentBlock = await this.evm.getBlockNumber();

    for (const record of records) {
      try {
        const balance = await this.evm.getBalance(record.address);

        if (record.lastNativeBalance === null) {
          // First observation: baseline only. Deposit addresses are freshly
          // derived so the baseline is expected to be zero.
          await prisma.depositAddress.update({
            where: { id: record.id },
            data: { lastNativeBalance: balance },
          });
          continue;
        }

        if (balance > record.lastNativeBalance) {
          const delta = balance - record.lastNativeBalance;
          const amount = baseUnitsToDecimalString(delta, 18);
          const dedupId = depositDedupId(`native_delta:${record.address}`, currentBlock);

          await prisma.$transaction(async (txClient) => {
            const existing = await txClient.transaction.findUnique({ where: { txHash: dedupId } });
            if (!existing) {
              const wallet = await txClient.cryptoWallet.findUnique({
                where: { userId_currency: { userId: record.userId, currency: record.currency } },
                select: { id: true },
              });
              if (!wallet) throw new Error(`Wallet not found for user ${record.userId}`);

              await txClient.transaction.create({
                data: {
                  userId: record.userId,
                  walletId: wallet.id,
                  type: TransactionType.DEPOSIT,
                  status: TransactionStatus.PENDING,
                  currency: record.currency,
                  amount,
                  fee: '0',
                  netAmount: amount,
                  description: `Deposit of ${amount} ${record.currency}`,
                  referenceId: `dep_native_${record.address}_${currentBlock}`,
                  blockNumber: BigInt(currentBlock),
                  confirmations: 0,
                  requiredConfirmations: config.blockchain.evm.requiredConfirmations,
                  metadata: {
                    onchain: true,
                    chain: CHAINS.EVM,
                    detection: 'balance-delta',
                    depositAddress: record.address,
                  },
                },
              });
            }

            await txClient.depositAddress.update({
              where: { id: record.id },
              data: { lastNativeBalance: balance },
            });
          });

          logger.info('EVM native deposit indexed', {
            userId: record.userId,
            currency: record.currency,
            amount,
            address: record.address,
            block: currentBlock,
          });
        } else if (balance < record.lastNativeBalance) {
          // Outbound movement (e.g. a sweep); just track the new baseline.
          await prisma.depositAddress.update({
            where: { id: record.id },
            data: { lastNativeBalance: balance },
          });
        }
      } catch (err) {
        logger.error('EVM native balance poll failed for address', {
          address: record.address,
          error: (err as Error).message,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // EVM — ERC-20 Transfer logs (USDT / USDC)
  // -------------------------------------------------------------------------

  private async pollEvmTokenDeposits(): Promise<void> {
    if (!this.evm) return;

    const records = await prisma.depositAddress.findMany({ where: { chain: CHAINS.EVM } });
    if (records.length === 0) return;

    const tokens = config.blockchain.evm.tokens;
    const contractToCurrency: Record<string, CurrencyType> = {};
    for (const [currency, token] of Object.entries(tokens)) {
      contractToCurrency[token.address.toLowerCase()] = currency as CurrencyType;
    }
    if (Object.keys(contractToCurrency).length === 0) return;

    const currentBlock = await this.evm.getBlockNumber();
    const LOOKBACK = 5;
    const MAX_WINDOW = 5000;
    const BLOCK_CHUNK = 1000;
    const ADDR_CHUNK = 40;

    const addresses = [...new Set(records.map((r) => r.address))];
    const minScanned = records.reduce<number>(
      (min, r) => (r.lastScannedBlock === null ? min : Math.min(min, r.lastScannedBlock)),
      Number.MAX_SAFE_INTEGER
    );
    let from =
      minScanned === Number.MAX_SAFE_INTEGER
        ? Math.max(1, currentBlock - LOOKBACK)
        : minScanned + 1;
    const to = currentBlock;
    if (from > to) return;
    if (to - from + 1 > MAX_WINDOW) from = to - MAX_WINDOW + 1;

    let scanFailed = false;

    for (let start = from; start <= to && !scanFailed; start += BLOCK_CHUNK) {
      const end = Math.min(start + BLOCK_CHUNK - 1, to);
      for (let i = 0; i < addresses.length; i += ADDR_CHUNK) {
        const chunk = addresses.slice(i, i + ADDR_CHUNK);
        try {
          const logs = await this.evm.getLogs({
            fromBlock: start,
            toBlock: end,
            address: Object.keys(contractToCurrency),
            topics: [ERC20_TRANSFER_TOPIC, null, chunk.map(addressToTopic)],
          });

          for (const log of logs) {
            const decoded = decodeErc20TransferLog(
              {
                address: log.address,
                topics: log.topics,
                data: log.data,
                transactionHash: log.transactionHash,
                logIndex: log.index,
                blockNumber: typeof log.blockNumber === 'bigint' ? Number(log.blockNumber) : (log.blockNumber as number),
                blockHash: log.blockHash,
              },
              contractToCurrency
            );
            if (!decoded) continue;

            const record = records.find((r) => r.address.toLowerCase() === decoded.to.toLowerCase());
            if (!record) continue;

            const dedupId = depositDedupId(decoded.txHash, decoded.logIndex);
            const existing = await prisma.transaction.findUnique({ where: { txHash: dedupId } });
            if (existing) continue;

            const amount = baseUnitsToDecimalString(decoded.baseUnits, decimalsForCurrency(decoded.currency));
            await transactionService.createDepositTransaction(
              record.userId,
              decoded.currency,
              amount,
              dedupId,
              decoded.blockHash,
              BigInt(decoded.blockNumber),
              {
                onchain: true,
                chain: CHAINS.EVM,
                detection: 'erc20-transfer',
                contract: decoded.contractAddress,
                from: decoded.from,
                depositAddress: decoded.to,
                rawTxHash: decoded.txHash,
              },
              {
                confirmations: Math.max(0, currentBlock - decoded.blockNumber),
                requiredConfirmations: config.blockchain.evm.requiredConfirmations,
              }
            );

            logger.info('EVM ERC-20 deposit indexed', {
              userId: record.userId,
              currency: decoded.currency,
              amount,
              txHash: decoded.txHash,
              logIndex: decoded.logIndex,
            });
          }
        } catch (err) {
          scanFailed = true;
          logger.error('EVM ERC-20 log scan failed', {
            fromBlock: start,
            toBlock: end,
            error: (err as Error).message,
          });
          break;
        }
      }
    }

    if (!scanFailed) {
      await prisma.depositAddress.updateMany({
        where: { chain: CHAINS.EVM },
        data: { lastScannedBlock: to },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Confirmation tracking for indexed deposits
  // -------------------------------------------------------------------------

  private async updatePendingDepositConfirmations(): Promise<void> {
    const pending = await prisma.transaction.findMany({
      where: {
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        metadata: { path: ['onchain'], equals: true },
      },
      take: 200,
    });
    if (pending.length === 0) return;

    let currentSlot: number | null = null;
    let currentBlock: number | null = null;

    for (const t of pending) {
      const meta = t.metadata as { chain?: string };
      if (t.blockNumber === null) continue;

      let confirmations: number | null = null;

      if (meta.chain === CHAINS.SOLANA && this.solana) {
        if (currentSlot === null) currentSlot = await this.solana.getSlot('confirmed');
        confirmations = Math.max(0, currentSlot - Number(t.blockNumber));
      } else if (meta.chain === CHAINS.EVM && this.evm) {
        if (currentBlock === null) currentBlock = await this.evm.getBlockNumber();
        confirmations = Math.max(0, currentBlock - Number(t.blockNumber));
      }

      if (confirmations === null) continue;

      try {
        await transactionService.setConfirmations(t.id, confirmations, {
          blockNumber: t.blockNumber,
        });
      } catch (err) {
        logger.error('Failed updating deposit confirmations', {
          transactionId: t.id,
          error: (err as Error).message,
        });
      }
    }
  }
}

export const blockchainIndexer = BlockchainIndexer.getInstance();
