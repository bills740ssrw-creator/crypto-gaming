import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, wagerRateLimit, apiRateLimit } from '../src/middleware/rateLimit.ts';
import {
  memoryStore,
  memoryHit,
  redisOrMemoryStore,
  resetMemoryRateLimits,
  memoryRateLimitSize,
} from '../src/services/rate-limit-store.ts';

type FakeRes = {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
  setHeader(key: string, value: string): void;
  status(code: number): FakeRes;
  json(payload: unknown): FakeRes;
};

function createRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(key, value) {
      res.headers[key] = value;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function run(middleware: unknown, req: unknown): Promise<{ next: boolean; res: FakeRes }> {
  const res = createRes();
  let called = false;
  const fn = middleware as (r: unknown, s: unknown, n: () => void) => Promise<void>;
  await fn(req, res, () => {
    called = true;
  });
  return { next: called, res };
}

function wagerReq(userId?: string, ip = '10.0.0.1') {
  return { ip, path: '/api/game/ttt/1/move', headers: {}, userId };
}

beforeEach(() => {
  resetMemoryRateLimits();
});

test('the wager budget allows five requests then returns 429', async () => {
  const req = wagerReq('wager-user-a');

  for (let attempt = 1; attempt <= 5; attempt++) {
    const { next, res } = await run(wagerRateLimit, req);
    assert.equal(next, true, `request ${attempt} should pass`);
    assert.equal(res.headers['X-RateLimit-Limit'], '5');
    assert.equal(res.headers['X-RateLimit-Remaining'], String(5 - attempt));
  }

  const blocked = await run(wagerRateLimit, req);
  assert.equal(blocked.next, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body.success, false);
  assert.equal(blocked.res.body.error.code, 'RATE_LIMIT_EXCEEDED');
  assert.ok(blocked.res.body.error.details.retryAfter >= 0);
});

test('the wager budget is tracked per user, not per ip', async () => {
  const heavy = wagerReq('wager-user-b', '10.0.0.2');
  for (let i = 0; i < 6; i++) {
    await run(wagerRateLimit, heavy);
  }

  const blocked = await run(wagerRateLimit, heavy);
  assert.equal(blocked.next, false);

  const other = wagerReq('wager-user-c', '10.0.0.2');
  const allowed = await run(wagerRateLimit, other);
  assert.equal(allowed.next, true);
});

test('an unauthenticated wager request falls back to the client ip', async () => {
  const req = { ip: '10.0.0.77', path: '/api/game/ttt/1/move', headers: {} };

  for (let i = 0; i < 5; i++) {
    const { next } = await run(wagerRateLimit, req);
    assert.equal(next, true);
  }

  const blocked = await run(wagerRateLimit, req);
  assert.equal(blocked.next, false);
  assert.equal(blocked.res.statusCode, 429);
});

test('the wager limit is tighter than the general api limit', async () => {
  const req = { ip: '10.0.0.55', path: '/api/game', headers: {}, userId: 'wager-user-d' };

  // The general API budget (60/min) lets the same burst straight through.
  for (let i = 0; i < 6; i++) {
    const { next } = await run(apiRateLimit, req);
    assert.equal(next, true, `api request ${i + 1} should not be throttled`);
  }

  for (let i = 0; i < 5; i++) {
    assert.equal((await run(wagerRateLimit, req)).next, true);
  }
  assert.equal((await run(wagerRateLimit, req)).next, false);
});

test('the counter window rolls over once it expires', async () => {
  const limiter = rateLimit({
    windowMs: 50,
    maxRequests: 2,
    keyGenerator: () => 'window-user',
    store: memoryStore,
  });

  assert.equal((await run(limiter, {})).next, true);
  assert.equal((await run(limiter, {})).next, true);
  assert.equal((await run(limiter, {})).next, false);

  await new Promise((resolve) => setTimeout(resolve, 120));

  assert.equal((await run(limiter, {})).next, true);
});

test('memory counters increment and reset exactly at the window boundary', () => {
  resetMemoryRateLimits();

  const first = memoryHit('counter-key', 1000, 1000);
  assert.equal(first.count, 1);
  assert.equal(first.ttl, 1000);

  const second = memoryHit('counter-key', 1000, 1500);
  assert.equal(second.count, 2);
  assert.equal(second.ttl, 500);

  const afterWindow = memoryHit('counter-key', 1000, 2500);
  assert.equal(afterWindow.count, 1);
  assert.equal(afterWindow.ttl, 1000);

  assert.ok(memoryRateLimitSize() >= 1);
});

test('the default store keeps counting when redis is unreachable', async () => {
  const first = await redisOrMemoryStore.hit('store-probe', 1000);
  const second = await redisOrMemoryStore.hit('store-probe', 1000);

  assert.equal(first.count, 1);
  assert.equal(second.count, 2);
  assert.ok(second.ttl > 0);
  assert.ok(second.ttl <= 1000);
});

test('a broken store fails open rather than blocking traffic', async () => {
  const broken = {
    hit: () => Promise.reject(new Error('store unavailable')),
  };
  const limiter = rateLimit({
    windowMs: 1000,
    maxRequests: 1,
    keyGenerator: () => 'broken-user',
    store: broken,
  });

  const { next, res } = await run(limiter, {});
  assert.equal(next, true);
  assert.equal(res.statusCode, 200);
});
