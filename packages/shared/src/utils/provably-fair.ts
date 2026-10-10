import type { webcrypto } from 'node:crypto';

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_CHARS = '0123456789abcdef';
const FLOAT_HEX_CHARS = 8;
const FLOAT_DENOMINATOR = 0x100000000;
const encoder = new TextEncoder();

export interface ProvablyFairTurn {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  digest: string;
  float: number;
  rollPercent: number;
}

export interface VerifyTurnInput {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  publishedServerSeedHash?: string;
  expectedDigest?: string;
  expectedFloat?: number;
  expectedRoll?: number;
}

export interface TurnVerification {
  valid: boolean;
  serverSeedHash: string;
  publishedServerSeedHash?: string;
  serverSeedHashValid: boolean | null;
  digest: string;
  expectedDigest?: string;
  digestValid: boolean | null;
  float: number;
  expectedFloat?: number;
  floatValid: boolean | null;
  rollPercent: number;
  expectedRoll?: number;
  rollValid: boolean | null;
}

function subtle(): webcrypto.SubtleCrypto {
  const api = globalThis.crypto;
  if (!api || !api.subtle) {
    throw new Error('Web Crypto API is not available in this environment');
  }
  return api.subtle;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_CHARS[bytes[i] >> 4] + HEX_CHARS[bytes[i] & 0x0f];
  }
  return hex;
}

function assertSeed(value: string, label: string): void {
  if (typeof value !== 'string' || !HEX_64.test(value)) {
    throw new Error(`${label} must be a 64-character lowercase hex string`);
  }
}

function assertNonce(nonce: number): void {
  if (!Number.isSafeInteger(nonce) || nonce < 0) {
    throw new Error('nonce must be a non-negative safe integer');
  }
}

function assertClientSeed(clientSeed: string): void {
  if (typeof clientSeed !== 'string' || clientSeed.length === 0) {
    throw new Error('clientSeed must be a non-empty string');
  }
  if (encoder.encode(clientSeed).length > 512) {
    throw new Error('clientSeed must be at most 512 bytes when UTF-8 encoded');
  }
}

export function constantTimeHexEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function generateSeed(bytes: number = 32): string {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 256) {
    throw new Error('seed size must be an integer between 16 and 256 bytes');
  }
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  return bytesToHex(buffer);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await subtle().digest('SHA-256', encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashServerSeed(serverSeed: string): Promise<string> {
  assertSeed(serverSeed, 'serverSeed');
  return sha256Hex(serverSeed);
}

export async function createTurnCommitment(
  serverSeed: string,
  clientSeed: string,
  nonce: number
): Promise<string> {
  assertSeed(serverSeed, 'serverSeed');
  assertClientSeed(clientSeed);
  assertNonce(nonce);
  return sha256Hex(`${serverSeed}:${clientSeed}:${nonce}`);
}

export async function computeDigest(
  serverSeed: string,
  clientSeed: string,
  nonce: number
): Promise<string> {
  assertSeed(serverSeed, 'serverSeed');
  assertClientSeed(clientSeed);
  assertNonce(nonce);
  const key = await subtle().importKey(
    'raw',
    encoder.encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await subtle().sign('HMAC', key, encoder.encode(`${clientSeed}:${nonce}`));
  return bytesToHex(new Uint8Array(signature));
}

export function digestToFloat(digest: string): number {
  assertSeed(digest, 'digest');
  const slice = digest.slice(0, FLOAT_HEX_CHARS);
  return Number.parseInt(slice, 16) / FLOAT_DENOMINATOR;
}

export function floatToRoll(float: number): number {
  if (!Number.isFinite(float) || float < 0 || float >= 1) {
    throw new Error('float must be in the range [0, 1)');
  }
  return Math.floor(float * 10000) / 100;
}

export function chunkToFloat(digest: string, chunkIndex: number): number {
  assertSeed(digest, 'digest');
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw new Error('chunkIndex must be a non-negative integer');
  }
  const offset = (chunkIndex * FLOAT_HEX_CHARS) % 56;
  const slice = digest.slice(offset, offset + FLOAT_HEX_CHARS);
  return Number.parseInt(slice, 16) / FLOAT_DENOMINATOR;
}

export async function computeTurn(
  serverSeed: string,
  clientSeed: string,
  nonce: number
): Promise<ProvablyFairTurn> {
  const [serverSeedHash, digest] = await Promise.all([
    hashServerSeed(serverSeed),
    computeDigest(serverSeed, clientSeed, nonce),
  ]);
  const float = digestToFloat(digest);
  return {
    serverSeedHash,
    clientSeed,
    nonce,
    digest,
    float,
    rollPercent: floatToRoll(float),
  };
}

export async function verifyServerSeedHash(
  serverSeed: string,
  publishedServerSeedHash: string
): Promise<boolean> {
  const recomputed = await hashServerSeed(serverSeed);
  return constantTimeHexEqual(recomputed, publishedServerSeedHash);
}

export async function verifyTurn(input: VerifyTurnInput): Promise<TurnVerification> {
  const { serverSeed, clientSeed, nonce, publishedServerSeedHash, expectedDigest, expectedFloat, expectedRoll } = input;

  const serverSeedHash = await hashServerSeed(serverSeed);
  const digest = await computeDigest(serverSeed, clientSeed, nonce);
  const float = digestToFloat(digest);
  const rollPercent = floatToRoll(float);

  const serverSeedHashValid =
    publishedServerSeedHash === undefined
      ? null
      : constantTimeHexEqual(serverSeedHash, publishedServerSeedHash);

  const digestValid =
    expectedDigest === undefined
      ? null
      : constantTimeHexEqual(digest, expectedDigest.toLowerCase());

  const floatValid =
    expectedFloat === undefined
      ? null
      : Number.isFinite(expectedFloat) && Math.abs(float - expectedFloat) <= 1e-12;

  const rollValid =
    expectedRoll === undefined
      ? null
      : Number.isFinite(expectedRoll) && Math.abs(rollPercent - expectedRoll) <= 1e-9;

  const checks = [serverSeedHashValid, digestValid, floatValid, rollValid];
  const valid = checks.every((check) => check === null || check === true);

  return {
    valid,
    serverSeedHash,
    publishedServerSeedHash,
    serverSeedHashValid,
    digest,
    expectedDigest,
    digestValid,
    float,
    expectedFloat,
    floatValid,
    rollPercent,
    expectedRoll,
    rollValid,
  };
}

export function crashMultiplier(float: number, houseEdgePercent: number = 1, maxMultiplier: number = 1000000): number {
  if (!Number.isFinite(float) || float < 0 || float >= 1) {
    throw new Error('float must be in the range [0, 1)');
  }
  if (!Number.isFinite(houseEdgePercent) || houseEdgePercent < 0 || houseEdgePercent >= 100) {
    throw new Error('houseEdgePercent must be in the range [0, 100)');
  }
  if (!Number.isFinite(maxMultiplier) || maxMultiplier < 1) {
    throw new Error('maxMultiplier must be at least 1');
  }
  const houseEdge = houseEdgePercent / 100;
  const raw = (1 - houseEdge) / (1 - float);
  return Math.min(maxMultiplier, Math.max(1, raw));
}

export function randomIntInRange(float: number, min: number, max: number): number {
  if (!Number.isFinite(float) || float < 0 || float >= 1) {
    throw new Error('float must be in the range [0, 1)');
  }
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new Error('min and max must be integers with max >= min');
  }
  const value = min + Math.floor(float * (max - min + 1));
  return Math.min(value, max);
}

export function pickSymbol(digest: string, symbolCount: number, pick: number): number {
  if (!Number.isInteger(symbolCount) || symbolCount < 2) {
    throw new Error('symbolCount must be an integer >= 2');
  }
  return randomIntInRange(chunkToFloat(digest, pick), 0, symbolCount - 1);
}

export function slotReels(digest: string, reelCount: number, symbolCount: number): number[] {
  if (!Number.isInteger(reelCount) || reelCount < 1 || reelCount > 32) {
    throw new Error('reelCount must be an integer between 1 and 32');
  }
  const reels: number[] = [];
  for (let i = 0; i < reelCount; i++) {
    reels.push(pickSymbol(digest, symbolCount, i));
  }
  return reels;
}
