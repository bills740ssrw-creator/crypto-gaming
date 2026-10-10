import { createHash } from 'crypto';
import { CurrencyType } from '@prisma/client';
import { Keypair } from '@solana/web3.js';
import { ethers } from 'ethers';
import { prisma } from './prisma';
import { config } from '../config';
import { logger } from './logger';
import { CHAINS, ChainName, chainsForCurrency } from './blockchainUtils';

export interface DepositAddressRecord {
  id: string;
  userId: string;
  chain: string;
  currency: CurrencyType;
  address: string;
  hdIndex: number | null;
}

/**
 * Derives per-user custodial deposit addresses deterministically from platform
 * seeds, so no per-address private keys are ever stored in the database.
 *
 * - Solana: keypair seeded with sha256(DEPOSIT_SEED:userId) — the key is only
 *   needed on-demand (e.g. future sweeps) and can be re-derived at any time.
 * - EVM: HD path m/44'/60'/0'/0/{index} from DEPOSIT_MNEMONIC, where index is
 *   a stable hash of the userId. The mnemonic never leaves config/env.
 */
export class DepositAddressService {
  private static instance: DepositAddressService;

  private constructor() {}

  static getInstance(): DepositAddressService {
    if (!DepositAddressService.instance) {
      DepositAddressService.instance = new DepositAddressService();
    }
    return DepositAddressService.instance;
  }

  deriveSolanaKeypair(userId: string): Keypair {
    const seed = config.blockchain.depositSeed;
    if (!seed) {
      throw new Error('DEPOSIT_SEED is not configured; cannot derive Solana deposit addresses');
    }
    const digest = createHash('sha256').update(`${seed}:${userId}`).digest();
    return Keypair.fromSeed(new Uint8Array(digest));
  }

  deriveEvmIndex(userId: string): number {
    const digest = createHash('sha256').update(`evm:${userId}`).digest();
    return digest.readUInt32BE(0) % 1_000_000;
  }

  deriveEvmAddress(userId: string): { address: string; hdIndex: number } {
    const mnemonic = config.blockchain.depositMnemonic;
    if (!mnemonic) {
      throw new Error('DEPOSIT_MNEMONIC is not configured; cannot derive EVM deposit addresses');
    }
    const hdIndex = this.deriveEvmIndex(userId);
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${hdIndex}`);
    return { address: wallet.address, hdIndex };
  }

  /**
   * Returns existing deposit addresses for the user across every chain the
   * currency supports, creating any missing rows. Currencies like USDT/USDC
   * get both a Solana and an EVM address.
   */
  async getOrCreate(userId: string, currency: CurrencyType): Promise<DepositAddressRecord[]> {
    const chains = chainsForCurrency(currency);
    if (chains.length === 0) {
      return [];
    }

    const results: DepositAddressRecord[] = [];
    for (const chain of chains) {
      results.push(await this.getOrCreateForChain(userId, currency, chain));
    }
    return results;
  }

  async getOrCreateForChain(userId: string, currency: CurrencyType, chain: ChainName): Promise<DepositAddressRecord> {
    const existing = await prisma.depositAddress.findUnique({
      where: { userId_chain_currency: { userId, chain, currency } },
    });
    if (existing) return existing;

    let address: string;
    let hdIndex: number | null = null;

    if (chain === CHAINS.SOLANA) {
      // One Solana keypair per user (not per currency); SPL tokens arrive at
      // the associated token accounts of the same owner address.
      const existingSol = await prisma.depositAddress.findFirst({
        where: { userId, chain: CHAINS.SOLANA },
      });
      if (existingSol) {
        address = existingSol.address;
      } else {
        address = this.deriveSolanaKeypair(userId).publicKey.toBase58();
      }
    } else {
      const existingEvm = await prisma.depositAddress.findFirst({
        where: { userId, chain: CHAINS.EVM },
      });
      if (existingEvm) {
        address = existingEvm.address;
        hdIndex = existingEvm.hdIndex;
      } else {
        const derived = this.deriveEvmAddress(userId);
        address = derived.address;
        hdIndex = derived.hdIndex;
      }
    }

    const created = await prisma.depositAddress.upsert({
      where: { userId_chain_currency: { userId, chain, currency } },
      create: { userId, chain, currency, address, hdIndex },
      update: {},
    });

    logger.info('Deposit address created', { userId, chain, currency, address });
    return created;
  }

  async getUserDepositAddresses(userId: string): Promise<DepositAddressRecord[]> {
    return prisma.depositAddress.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export const depositAddressService = DepositAddressService.getInstance();
