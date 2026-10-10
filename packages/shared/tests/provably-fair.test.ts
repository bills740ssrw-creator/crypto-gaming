import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSeed,
  sha256Hex,
  hashServerSeed,
  computeDigest,
  digestToFloat,
  chunkToFloat,
  createTurnCommitment,
  verifyTurn,
  verifyServerSeedHash,
  constantTimeHexEqual,
  crashMultiplier,
  floatToRoll,
  randomIntInRange,
  pickSymbol,
  slotReels,
} from '../src/utils/provably-fair.ts';

test('generateSeed produces lowercase 64-char hex', () => {
  const seed = generateSeed(32);
  assert.match(seed, /^[0-9a-f]{64}$/);
  const other = generateSeed(32);
  assert.notEqual(seed, other);
  assert.throws(() => generateSeed(8));
});

test('sha256Hex matches the known abc vector', async () => {
  const digest = await sha256Hex('abc');
  assert.equal(digest, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('hashServerSeed equals sha256 of the seed', async () => {
  const seed = generateSeed(32);
  assert.equal(await hashServerSeed(seed), await sha256Hex(seed));
  assert.match(await hashServerSeed(seed), /^[0-9a-f]{64}$/);
});

test('computeDigest is deterministic HMAC over clientSeed:nonce', async () => {
  const seed = generateSeed(32);
  const a = await computeDigest(seed, 'client', 1);
  const b = await computeDigest(seed, 'client', 1);
  const c = await computeDigest(seed, 'client', 2);
  const d = await computeDigest(seed, 'other', 1);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('digestToFloat and chunkToFloat stay in [0, 1)', async () => {
  const digest = await computeDigest(generateSeed(32), 'client', 7);
  const float = digestToFloat(digest);
  assert.ok(float >= 0 && float < 1);
  for (let i = 0; i < 5; i++) {
    const chunk = chunkToFloat(digest, i);
    assert.ok(chunk >= 0 && chunk < 1);
  }
  assert.throws(() => digestToFloat('nope'));
  assert.throws(() => chunkToFloat(digest, -1));
});

test('createTurnCommitment is sha256 of seed:client:nonce', async () => {
  const seed = generateSeed(32);
  const commitment = await createTurnCommitment(seed, 'client', 3);
  assert.equal(commitment, await sha256Hex(`${seed}:client:3`));
});

test('verifyTurn accepts honest input and rejects tampering', async () => {
  const serverSeed = generateSeed(32);
  const clientSeed = 'my-client-seed';
  const nonce = 42;
  const serverSeedHash = await hashServerSeed(serverSeed);
  const digest = await computeDigest(serverSeed, clientSeed, nonce);
  const float = digestToFloat(digest);

  const honest = await verifyTurn({ serverSeed, clientSeed, nonce, publishedServerSeedHash: serverSeedHash, expectedDigest: digest, expectedFloat: float });
  assert.ok(honest.valid);
  assert.equal(honest.digestValid, true);
  assert.equal(honest.floatValid, true);

  const tampered = await verifyTurn({ serverSeed, clientSeed, nonce, publishedServerSeedHash: 'f'.repeat(64), expectedDigest: digest });
  assert.ok(!tampered.valid);
  assert.equal(tampered.serverSeedHashValid, false);
});

test('verifyServerSeedHash detects seed mismatch', async () => {
  const seed = generateSeed(32);
  const hash = await hashServerSeed(seed);
  assert.ok(await verifyServerSeedHash(seed, hash));
  assert.ok(!(await verifyServerSeedHash(seed, 'f'.repeat(64))));
});

test('constantTimeHexEqual compares case-insensitively and length-safely', () => {
  assert.ok(constantTimeHexEqual('abcd', 'abcd'));
  assert.ok(!constantTimeHexEqual('abcd', 'abce'));
  assert.ok(!constantTimeHexEqual('abcd', 'abc'));
  assert.ok(!constantTimeHexEqual('abcd', 'ABCD'));
});

test('crashMultiplier applies house edge and clamps to at least 1', () => {
  assert.equal(crashMultiplier(0, 1), 1);
  assert.equal(crashMultiplier(0.5, 1), 1.98);
  assert.ok(Math.abs(crashMultiplier(0.99, 1) - 99) < 1e-9);
  assert.throws(() => crashMultiplier(1, 1));
});

test('floatToRoll and randomIntInRange map floats into ranges', () => {
  assert.equal(floatToRoll(0.5), 50);
  assert.equal(floatToRoll(0), 0);
  assert.equal(randomIntInRange(0, 0, 5), 0);
  assert.equal(randomIntInRange(0.9999999, 0, 5), 5);
  assert.throws(() => randomIntInRange(0.5, 5, 1));
});

test('pickSymbol and slotReels stay within symbol bounds', async () => {
  const digest = await computeDigest(generateSeed(32), 'slots', 1);
  const symbol = pickSymbol(digest, 8, 0);
  assert.ok(symbol >= 0 && symbol < 8);
  const reels = slotReels(digest, 5, 10);
  assert.equal(reels.length, 5);
  for (const reel of reels) {
    assert.ok(reel >= 0 && reel < 10);
  }
  assert.throws(() => slotReels(digest, 0, 10));
});
