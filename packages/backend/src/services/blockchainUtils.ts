import { CurrencyType } from '@prisma/client';
import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';

export const CHAINS = {
  SOLANA: 'SOLANA',
  EVM: 'EVM',
} as const;

export type ChainName = (typeof CHAINS)[keyof typeof CHAINS];

/**
 * Primary chain used for deposits/withdrawals of a currency.
 * USDT/USDC exist on both chains; this returns the default (EVM).
 */
export function chainForCurrency(currency: CurrencyType): ChainName | null {
  switch (currency) {
    case CurrencyType.CRYPTO_SOL:
      return CHAINS.SOLANA;
    case CurrencyType.CRYPTO_ETH:
      return CHAINS.EVM;
    case CurrencyType.CRYPTO_USDT:
    case CurrencyType.CRYPTO_USDC:
      return CHAINS.EVM;
    default:
      return null;
  }
}

/** All chains the indexer can credit deposits for a given currency. */
export function chainsForCurrency(currency: CurrencyType): ChainName[] {
  switch (currency) {
    case CurrencyType.CRYPTO_SOL:
      return [CHAINS.SOLANA];
    case CurrencyType.CRYPTO_ETH:
      return [CHAINS.EVM];
    case CurrencyType.CRYPTO_USDT:
    case CurrencyType.CRYPTO_USDC:
      return [CHAINS.SOLANA, CHAINS.EVM];
    default:
      return [];
  }
}

/** Currencies the automated payout engine knows how to broadcast. */
export function isPayoutCurrency(currency: CurrencyType): boolean {
  return (
    currency === CurrencyType.CRYPTO_SOL ||
    currency === CurrencyType.CRYPTO_ETH ||
    currency === CurrencyType.CRYPTO_USDT ||
    currency === CurrencyType.CRYPTO_USDC
  );
}

export function isValidChainAddress(address: string, chain: ChainName): boolean {
  if (!address) return false;
  if (chain === CHAINS.SOLANA) {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }
  try {
    ethers.getAddress(address);
    return true;
  } catch {
    return false;
  }
}

export function baseUnitsToDecimalString(baseUnits: bigint, decimals: number): string {
  return ethers.formatUnits(baseUnits, decimals);
}

export function decimalStringToBaseUnits(amount: string, decimals: number): bigint {
  return ethers.parseUnits(amount, decimals);
}

export function decimalsForCurrency(currency: CurrencyType): number {
  switch (currency) {
    case CurrencyType.CRYPTO_SOL:
      return 9;
    case CurrencyType.CRYPTO_ETH:
      return 18;
    case CurrencyType.CRYPTO_USDT:
    case CurrencyType.CRYPTO_USDC:
      return 6;
    default:
      return 18;
  }
}

/**
 * Unique key stored in Transaction.txHash for a detected deposit.
 * A single on-chain transaction can credit multiple watched accounts
 * (e.g. an ERC-20 log batch), so an optional sub-index is appended.
 */
export function depositDedupId(txHash: string, subIndex?: number | string): string {
  return subIndex === undefined ? txHash : `${txHash}:${subIndex}`;
}

// ---------------------------------------------------------------------------
// Pure parsers (unit-testable, no RPC clients)
// ---------------------------------------------------------------------------

export interface SolanaTokenBalanceEntry {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

export interface SolanaMetaLike {
  preBalances: number[];
  postBalances: number[];
  preTokenBalances?: SolanaTokenBalanceEntry[] | null;
  postTokenBalances?: SolanaTokenBalanceEntry[] | null;
  loadedAddresses?: { writable: string[]; readonly: string[] } | null;
}

export interface SolanaDepositDelta {
  currency: CurrencyType;
  baseUnits: bigint;
  subIndex?: number;
}

/**
 * Extracts every positive balance delta credited to `depositAddress` inside a
 * Solana transaction: native SOL (lamports) plus any SPL token transfers whose
 * token account owner is the deposit address.
 */
export function parseSolanaDepositDeltas(
  meta: SolanaMetaLike,
  staticAccountKeys: string[],
  depositAddress: string,
  mintToCurrency: Record<string, CurrencyType>
): SolanaDepositDelta[] {
  const deltas: SolanaDepositDelta[] = [];
  const combinedKeys = [
    ...staticAccountKeys,
    ...(meta.loadedAddresses?.writable ?? []),
    ...(meta.loadedAddresses?.readonly ?? []),
  ];

  const accountIndex = combinedKeys.indexOf(depositAddress);
  if (accountIndex >= 0) {
    const pre = BigInt(meta.preBalances[accountIndex] ?? 0);
    const post = BigInt(meta.postBalances[accountIndex] ?? 0);
    if (post > pre) {
      deltas.push({ currency: CurrencyType.CRYPTO_SOL, baseUnits: post - pre });
    }
  }

  const tokenEntries = new Map<string, { accountIndex: number; mint: string; pre: bigint; post: bigint; owner?: string }>();
  for (const entry of meta.preTokenBalances ?? []) {
    tokenEntries.set(`${entry.mint}:${entry.accountIndex}`, {
      accountIndex: entry.accountIndex,
      mint: entry.mint,
      pre: BigInt(entry.uiTokenAmount.amount),
      post: 0n,
      owner: entry.owner,
    });
  }
  for (const entry of meta.postTokenBalances ?? []) {
    const key = `${entry.mint}:${entry.accountIndex}`;
    const existing = tokenEntries.get(key);
    if (existing) {
      existing.post = BigInt(entry.uiTokenAmount.amount);
      existing.owner = existing.owner ?? entry.owner;
    } else {
      tokenEntries.set(key, {
        accountIndex: entry.accountIndex,
        mint: entry.mint,
        pre: 0n,
        post: BigInt(entry.uiTokenAmount.amount),
        owner: entry.owner,
      });
    }
  }

  for (const entry of tokenEntries.values()) {
    if (entry.owner !== depositAddress) continue;
    const currency = mintToCurrency[entry.mint];
    if (!currency) continue;
    if (entry.post > entry.pre) {
      deltas.push({ currency, baseUnits: entry.post - entry.pre, subIndex: entry.accountIndex });
    }
  }

  return deltas;
}

export const ERC20_TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

export interface EvmLogLike {
  address: string;
  topics: readonly string[];
  data: string;
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
}

export interface DecodedErc20Transfer {
  currency: CurrencyType;
  baseUnits: bigint;
  from: string;
  to: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  contractAddress: string;
}

/**
 * Decodes a raw ERC-20 Transfer log. Returns null when the log is not a
 * well-formed Transfer event or the token contract is not recognized.
 */
export function decodeErc20TransferLog(
  log: EvmLogLike,
  tokenContractToCurrency: Record<string, CurrencyType>
): DecodedErc20Transfer | null {
  if (log.topics.length < 3) return null;
  if (log.topics[0].toLowerCase() !== ERC20_TRANSFER_TOPIC.toLowerCase()) return null;

  const contract = ethers.getAddress(log.address);
  const currency = tokenContractToCurrency[contract.toLowerCase()];
  if (!currency) return null;

  let to: string;
  let baseUnits: bigint;
  try {
    to = ethers.getAddress(ethers.dataSlice(log.topics[2], 12));
    baseUnits = ethers.getBigInt(log.data);
  } catch {
    return null;
  }

  return {
    currency,
    baseUnits,
    from: ethers.getAddress(ethers.dataSlice(log.topics[1], 12)),
    to,
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    contractAddress: contract,
  };
}

/** Zero-padded 32-byte topic value for an address, for getLogs topic filters. */
export function addressToTopic(address: string): string {
  return ethers.zeroPadValue(ethers.getAddress(address), 32);
}
