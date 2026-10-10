import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CurrencyType } from '@prisma/client';
import {
  CHAINS,
  chainForCurrency,
  chainsForCurrency,
  isPayoutCurrency,
  isValidChainAddress,
  baseUnitsToDecimalString,
  decimalStringToBaseUnits,
  decimalsForCurrency,
  depositDedupId,
  parseSolanaDepositDeltas,
  decodeErc20TransferLog,
  ERC20_TRANSFER_TOPIC,
} from '../src/services/blockchainUtils';
import { depositAddressService } from '../src/services/depositAddress';

// Known-valid mainnet-format addresses for validation tests
const SOL_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const EVM_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

test('chainForCurrency maps currencies to chains', () => {
  assert.equal(chainForCurrency(CurrencyType.CRYPTO_SOL), CHAINS.SOLANA);
  assert.equal(chainForCurrency(CurrencyType.CRYPTO_ETH), CHAINS.EVM);
  assert.equal(chainForCurrency(CurrencyType.CRYPTO_USDT), CHAINS.EVM);
  assert.equal(chainForCurrency(CurrencyType.CRYPTO_USDC), CHAINS.EVM);
  assert.equal(chainForCurrency(CurrencyType.CRYPTO_BTC), null);
  assert.equal(chainForCurrency(CurrencyType.GOLD_COINS), null);
});

test('chainsForCurrency includes both chains for USDT/USDC', () => {
  assert.deepEqual(chainsForCurrency(CurrencyType.CRYPTO_USDC), [CHAINS.SOLANA, CHAINS.EVM]);
  assert.deepEqual(chainsForCurrency(CurrencyType.CRYPTO_SOL), [CHAINS.SOLANA]);
  assert.deepEqual(chainsForCurrency(CurrencyType.CRYPTO_BTC), []);
});

test('isPayoutCurrency covers exactly the indexer-supported set', () => {
  assert.equal(isPayoutCurrency(CurrencyType.CRYPTO_SOL), true);
  assert.equal(isPayoutCurrency(CurrencyType.CRYPTO_ETH), true);
  assert.equal(isPayoutCurrency(CurrencyType.CRYPTO_USDT), true);
  assert.equal(isPayoutCurrency(CurrencyType.CRYPTO_USDC), true);
  assert.equal(isPayoutCurrency(CurrencyType.CRYPTO_LTC), false);
  assert.equal(isPayoutCurrency(CurrencyType.GOLD_COINS), false);
});

test('isValidChainAddress validates Solana and EVM addresses', () => {
  assert.equal(isValidChainAddress(SOL_ADDRESS, CHAINS.SOLANA), true);
  assert.equal(isValidChainAddress('not-an-address', CHAINS.SOLANA), false);
  assert.equal(isValidChainAddress('', CHAINS.SOLANA), false);
  assert.equal(isValidChainAddress(EVM_ADDRESS, CHAINS.EVM), true);
  assert.equal(isValidChainAddress('0x1234', CHAINS.EVM), false);
  assert.equal(isValidChainAddress('hello', CHAINS.EVM), false);
});

test('unit conversion helpers round-trip', () => {
  assert.equal(baseUnitsToDecimalString(1_000_000_000n, 9), '1.0');
  assert.equal(baseUnitsToDecimalString(1_000_000n, 6), '1.0');
  assert.equal(decimalStringToBaseUnits('1.5', 9), 1_500_000_000n);
  assert.equal(decimalsForCurrency(CurrencyType.CRYPTO_SOL), 9);
  assert.equal(decimalsForCurrency(CurrencyType.CRYPTO_ETH), 18);
  assert.equal(decimalsForCurrency(CurrencyType.CRYPTO_USDT), 6);
});

test('depositDedupId appends sub-index only when present', () => {
  assert.equal(depositDedupId('abc'), 'abc');
  assert.equal(depositDedupId('abc', 5), 'abc:5');
  assert.equal(depositDedupId('abc', 'log'), 'abc:log');
});

test('parseSolanaDepositDeltas detects native SOL deposit to the right account', () => {
  const depositAddress = 'DepAddr11111111111111111111111111111111111';
  const deltas = parseSolanaDepositDeltas(
    {
      preBalances: [1_000_000, 2_000_000_000],
      postBalances: [5_000, 3_000_000_000], // fee payer loses rent-ish, deposit account +1 SOL
    },
    ['FeePayer11111111111111111111111111111111', depositAddress],
    depositAddress,
    {}
  );
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].currency, CurrencyType.CRYPTO_SOL);
  assert.equal(deltas[0].baseUnits, 1_000_000_000n);
});

test('parseSolanaDepositDeltas ignores outgoing SOL and other accounts', () => {
  const depositAddress = 'DepAddr11111111111111111111111111111111111';
  const deltas = parseSolanaDepositDeltas(
    {
      preBalances: [2_000_000_000, 1_000_000_000],
      postBalances: [1_000_000_000, 1_000_000_000], // deposit address sent funds OUT
    },
    ['DepAddr11111111111111111111111111111111111', 'Other11111111111111111111111111111111111'],
    depositAddress,
    {}
  );
  assert.equal(deltas.length, 0);
});

test('parseSolanaDepositDeltas detects SPL token deposits by owner', () => {
  const depositAddress = 'DepAddr11111111111111111111111111111111111';
  const deltas = parseSolanaDepositDeltas(
    {
      preBalances: [0, 0],
      postBalances: [0, 0],
      preTokenBalances: [
        { accountIndex: 1, mint: USDC_MINT, owner: depositAddress, uiTokenAmount: { amount: '1000000' } },
        { accountIndex: 2, mint: USDC_MINT, owner: 'SomeoneElse11111111111111111111111111111', uiTokenAmount: { amount: '5' } },
      ],
      postTokenBalances: [
        { accountIndex: 1, mint: USDC_MINT, owner: depositAddress, uiTokenAmount: { amount: '3500000' } },
        { accountIndex: 2, mint: USDC_MINT, owner: 'SomeoneElse11111111111111111111111111111', uiTokenAmount: { amount: '9' } },
      ],
    },
    ['Program1111111111111111111111111111111', 'TokenAcct111111111111111111111111111111', 'OtherToken1111111111111111111111111111'],
    depositAddress,
    { [USDC_MINT]: CurrencyType.CRYPTO_USDC }
  );
  // Only the deposit address's token account should credit (+2.5 USDC)
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].currency, CurrencyType.CRYPTO_USDC);
  assert.equal(deltas[0].baseUnits, 2_500_000n);
  assert.equal(deltas[0].subIndex, 1);
});

test('parseSolanaDepositDeltas ignores unknown mints', () => {
  const depositAddress = 'DepAddr11111111111111111111111111111111111';
  const deltas = parseSolanaDepositDeltas(
    {
      preBalances: [0],
      postBalances: [0],
      postTokenBalances: [
        { accountIndex: 0, mint: 'ScamMint111111111111111111111111111111111', owner: depositAddress, uiTokenAmount: { amount: '999' } },
      ],
    },
    [depositAddress],
    depositAddress,
    { [USDC_MINT]: CurrencyType.CRYPTO_USDC }
  );
  assert.equal(deltas.length, 0);
});

test('decodeErc20TransferLog decodes a USDT transfer', () => {
  const to = '0x1111111111111111111111111111111111111111';
  const from = '0x2222222222222222222222222222222222222222';
  const pad = (addr: string) => '0x' + addr.slice(2).toLowerCase().padStart(64, '0');

  const decoded = decodeErc20TransferLog(
    {
      address: EVM_ADDRESS,
      topics: [ERC20_TRANSFER_TOPIC, pad(from), pad(to)],
      data: '0x' + (1_500_000n).toString(16).padStart(64, '0'),
      transactionHash: '0xdeadbeef',
      logIndex: 3,
      blockNumber: 123456,
      blockHash: '0xblock',
    },
    { [EVM_ADDRESS.toLowerCase()]: CurrencyType.CRYPTO_USDT }
  );

  assert.ok(decoded);
  assert.equal(decoded!.currency, CurrencyType.CRYPTO_USDT);
  assert.equal(decoded!.baseUnits, 1_500_000n);
  assert.equal(decoded!.to.toLowerCase(), to);
  assert.equal(decoded!.logIndex, 3);
});

test('decodeErc20TransferLog rejects unknown contracts and malformed logs', () => {
  const pad = (addr: string) => '0x' + addr.slice(2).toLowerCase().padStart(64, '0');
  const base = {
    address: '0x9999999999999999999999999999999999999999',
    topics: [ERC20_TRANSFER_TOPIC, pad(EVM_ADDRESS), pad(EVM_ADDRESS)],
    data: '0x' + (1n).toString(16).padStart(64, '0'),
    transactionHash: '0xdeadbeef',
    logIndex: 0,
    blockNumber: 1,
    blockHash: '0xblock',
  };
  assert.equal(decodeErc20TransferLog(base, {}), null);
  assert.equal(decodeErc20TransferLog({ ...base, topics: ['0xnope'] }, {}), null);
});

test('Solana deposit address derivation is deterministic per user', () => {
  const a1 = depositAddressService.deriveSolanaKeypair('user-1').publicKey.toBase58();
  const a2 = depositAddressService.deriveSolanaKeypair('user-1').publicKey.toBase58();
  const b = depositAddressService.deriveSolanaKeypair('user-2').publicKey.toBase58();
  assert.equal(a1, a2);
  assert.notEqual(a1, b);
  assert.equal(isValidChainAddress(a1, CHAINS.SOLANA), true);
});

test('EVM deposit address derivation is deterministic and valid', () => {
  const d1 = depositAddressService.deriveEvmAddress('user-1');
  const d2 = depositAddressService.deriveEvmAddress('user-1');
  const d3 = depositAddressService.deriveEvmAddress('user-2');
  assert.equal(d1.address, d2.address);
  assert.equal(d1.hdIndex, d2.hdIndex);
  assert.notEqual(d1.address, d3.address);
  assert.equal(isValidChainAddress(d1.address, CHAINS.EVM), true);
  assert.ok(d1.hdIndex >= 0 && d1.hdIndex < 1_000_000);
});
