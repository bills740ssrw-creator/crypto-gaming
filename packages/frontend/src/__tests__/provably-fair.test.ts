import {
  generateSeed,
  sha256Hex,
  hashServerSeed,
  computeDigest,
  digestToFloat,
  floatToRoll,
  chunkToFloat,
  computeTurn,
  verifyServerSeedHash,
  verifyTurn,
  constantTimeHexEqual,
  createTurnCommitment,
} from '@crypto-gaming/shared';

const SERVER_SEED = 'a'.repeat(64);
const OTHER_SERVER_SEED = 'b'.repeat(64);

describe('sha256Hex', () => {
  it('matches the published SHA-256 test vector for "abc"', async () => {
    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('is case/format stable: lowercase 64-char hex', async () => {
    const digest = await sha256Hex('anything');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('generateSeed', () => {
  it('produces a valid lowercase 64-char hex seed', () => {
    const seed = generateSeed(32);
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(generateSeed(32)).not.toBe(seed);
  });

  it('rejects invalid byte sizes', () => {
    expect(() => generateSeed(8)).toThrow();
    expect(() => generateSeed(1024)).toThrow();
  });
});

describe('hashServerSeed / verifyServerSeedHash', () => {
  it('publishes a hash that does not reveal the server seed', async () => {
    const hash = await hashServerSeed(SERVER_SEED);
    expect(hash).toBe(await sha256Hex(SERVER_SEED));
    expect(hash).not.toContain(SERVER_SEED);
  });

  it('accepts the correct published hash', async () => {
    const published = await hashServerSeed(SERVER_SEED);
    await expect(verifyServerSeedHash(SERVER_SEED, published)).resolves.toBe(true);
  });

  it('rejects a hash from a different server seed', async () => {
    const published = await hashServerSeed(SERVER_SEED);
    await expect(verifyServerSeedHash(OTHER_SERVER_SEED, published)).resolves.toBe(false);
  });

  it('rejects malformed server seeds', async () => {
    await expect(hashServerSeed('short')).rejects.toThrow(/64-character/);
  });
});

describe('computeDigest (HMAC over clientSeed:nonce)', () => {
  it('is deterministic for identical inputs', async () => {
    const a = await computeDigest(SERVER_SEED, 'my-seed', 1);
    const b = await computeDigest(SERVER_SEED, 'my-seed', 1);
    expect(a).toBe(b);
  });

  it('changes when the user client seed changes', async () => {
    const a = await computeDigest(SERVER_SEED, 'my-seed', 1);
    const b = await computeDigest(SERVER_SEED, 'my-seed', 2);
    const c = await computeDigest(SERVER_SEED, 'other-seed', 1);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });

  it('changes when the server seed changes', async () => {
    const a = await computeDigest(SERVER_SEED, 'my-seed', 1);
    const b = await computeDigest(OTHER_SERVER_SEED, 'my-seed', 1);
    expect(a).not.toBe(b);
  });

  it('rejects an empty client seed', async () => {
    await expect(computeDigest(SERVER_SEED, '', 1)).rejects.toThrow(/non-empty/);
  });
});

describe('digestToFloat / floatToRoll / chunkToFloat', () => {
  it('maps the first 8 hex chars of the digest onto [0, 1)', async () => {
    const digest = await computeDigest(SERVER_SEED, 'my-seed', 7);
    const float = digestToFloat(digest);
    expect(float).toBeGreaterThanOrEqual(0);
    expect(float).toBeLessThan(1);
    expect(float).toBeCloseTo(parseInt(digest.slice(0, 8), 16) / 0x100000000, 15);
  });

  it('clamps into a two-decimal percentage range', () => {
    expect(floatToRoll(0)).toBe(0);
    expect(floatToRoll(0.123456789)).toBe(12.34);
    expect(floatToRoll(0.99999)).toBe(99.99);
    expect(() => floatToRoll(1)).toThrow();
    expect(() => floatToRoll(-0.1)).toThrow();
  });

  it('reads later chunks without going out of range', async () => {
    const digest = await computeDigest(SERVER_SEED, 'my-seed', 0);
    for (let i = 0; i < 8; i++) {
      const value = chunkToFloat(digest, i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(() => chunkToFloat(digest, -1)).toThrow();
  });

  it('rejects non-hex input', () => {
    expect(() => digestToFloat('zzzzzzzz')).toThrow();
    expect(() => digestToFloat('short')).toThrow();
  });
});

describe('computeTurn', () => {
  it('returns every field a provably-fair UI needs to show', async () => {
    const turn = await computeTurn(SERVER_SEED, 'client-seed-1', 42);

    expect(turn.serverSeedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(turn.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(turn.serverSeedHash).not.toContain(SERVER_SEED);
    expect(turn.clientSeed).toBe('client-seed-1');
    expect(turn.nonce).toBe(42);
    expect(turn.float).toBe(digestToFloat(turn.digest));
    expect(turn.rollPercent).toBe(floatToRoll(turn.float));
    expect(turn.float).toBeGreaterThanOrEqual(0);
    expect(turn.float).toBeLessThan(1);
  });

  it('produces a stable result for a fixed seed triple', async () => {
    const a = await computeTurn(SERVER_SEED, 'client-seed-1', 42);
    const b = await computeTurn(SERVER_SEED, 'client-seed-1', 42);
    expect(a).toEqual(b);
  });

  it('advances the result as the nonce advances', async () => {
    const first = await computeTurn(SERVER_SEED, 'client-seed-1', 0);
    const second = await computeTurn(SERVER_SEED, 'client-seed-1', 1);
    expect(first.digest).not.toBe(second.digest);
  });
});

describe('verifyTurn', () => {
  it('confirms a turn against the published server seed hash', async () => {
    const turn = await computeTurn(SERVER_SEED, 'client-seed-1', 42);
    const result = await verifyTurn({
      serverSeed: SERVER_SEED,
      clientSeed: 'client-seed-1',
      nonce: 42,
      publishedServerSeedHash: turn.serverSeedHash,
      expectedDigest: turn.digest,
      expectedFloat: turn.float,
      expectedRoll: turn.rollPercent,
    });

    expect(result.valid).toBe(true);
    expect(result.serverSeedHashValid).toBe(true);
    expect(result.digestValid).toBe(true);
    expect(result.floatValid).toBe(true);
    expect(result.rollValid).toBe(true);
    expect(result.rollPercent).toBe(turn.rollPercent);
  });

  it('fails when the client seed is tampered with', async () => {
    const turn = await computeTurn(SERVER_SEED, 'client-seed-1', 42);
    const result = await verifyTurn({
      serverSeed: SERVER_SEED,
      clientSeed: 'client-seed-1-TAMPERED',
      nonce: 42,
      publishedServerSeedHash: turn.serverSeedHash,
      expectedDigest: turn.digest,
    });

    expect(result.valid).toBe(false);
    expect(result.digestValid).toBe(false);
    expect(result.serverSeedHashValid).toBe(true);
  });

  it('fails when the published server seed hash was swapped', async () => {
    const turn = await computeTurn(SERVER_SEED, 'client-seed-1', 42);
    const forgedHash = await hashServerSeed(OTHER_SERVER_SEED);
    const result = await verifyTurn({
      serverSeed: SERVER_SEED,
      clientSeed: 'client-seed-1',
      nonce: 42,
      publishedServerSeedHash: forgedHash,
      expectedDigest: turn.digest,
    });

    expect(result.valid).toBe(false);
    expect(result.serverSeedHashValid).toBe(false);
    expect(result.digestValid).toBe(true);
  });

  it('treats omitted expectations as unchecked (null), not failed', async () => {
    const result = await verifyTurn({
      serverSeed: SERVER_SEED,
      clientSeed: 'client-seed-1',
      nonce: 42,
    });

    expect(result.valid).toBe(true);
    expect(result.serverSeedHashValid).toBeNull();
    expect(result.digestValid).toBeNull();
    expect(result.floatValid).toBeNull();
    expect(result.rollValid).toBeNull();
  });

  it('fails when the nonce does not match the played round', async () => {
    const turn = await computeTurn(SERVER_SEED, 'client-seed-1', 42);
    const result = await verifyTurn({
      serverSeed: SERVER_SEED,
      clientSeed: 'client-seed-1',
      nonce: 43,
      expectedDigest: turn.digest,
    });
    expect(result.valid).toBe(false);
  });
});

describe('createTurnCommitment', () => {
  it('commits to the triple without leaking the server seed', async () => {
    const commitment = await createTurnCommitment(SERVER_SEED, 'client-seed-1', 5);
    expect(commitment).toBe(await sha256Hex(`${SERVER_SEED}:client-seed-1:5`));
    expect(commitment).not.toContain(SERVER_SEED);
  });

  it('rejects out-of-range nonces', async () => {
    await expect(createTurnCommitment(SERVER_SEED, 'c', -1)).rejects.toThrow(/nonce/);
  });
});

describe('constantTimeHexEqual', () => {
  it('compares equal-length hex strings', () => {
    expect(constantTimeHexEqual('abc123', 'abc123')).toBe(true);
    expect(constantTimeHexEqual('abc123', 'abc124')).toBe(false);
    expect(constantTimeHexEqual('abc123', 'abc12')).toBe(false);
    expect(constantTimeHexEqual('abc123', 'ABC123')).toBe(false);
    expect(constantTimeHexEqual('', '')).toBe(true);
    expect(constantTimeHexEqual('', 'a')).toBe(false);
  });
});
