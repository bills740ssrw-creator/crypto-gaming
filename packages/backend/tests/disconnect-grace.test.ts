import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISCONNECT_GRACE_MS,
  noteUserConnected,
  noteUserDisconnected,
  startDisconnectGrace,
  cancelDisconnectGrace,
  hasDisconnectGrace,
  pendingDisconnectCount,
  resetDisconnectGrace,
  registerDisconnectHandler,
  registerDisconnectSuspendHandler,
  registerReconnectHandler,
  clearDisconnectHandlers,
  getDisconnectHandlerCount,
  getDisconnectSuspendHandlerCount,
  getReconnectHandlerCount,
} from '../src/websocket/disconnect-grace.ts';

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  resetDisconnectGrace();
  clearDisconnectHandlers();
});

test('grace window defaults to five seconds', () => {
  assert.equal(DISCONNECT_GRACE_MS, 5000);
});

test('last socket dropping opens a grace window', () => {
  noteUserDisconnected('alice', 0);
  assert.equal(hasDisconnectGrace('alice'), true);
  assert.equal(pendingDisconnectCount(), 1);
});

test('another open tab keeps the seat (no grace window)', () => {
  noteUserDisconnected('alice', 2);
  assert.equal(hasDisconnectGrace('alice'), false);
  assert.equal(pendingDisconnectCount(), 0);
});

test('a reconnect inside the window cancels the grace', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  registerDisconnectHandler((userId) => {
    calls.push(userId);
  });

  noteUserDisconnected('alice', 0);
  assert.equal(hasDisconnectGrace('alice'), true);

  noteUserConnected('alice');
  assert.equal(hasDisconnectGrace('alice'), false);

  t.mock.timers.tick(DISCONNECT_GRACE_MS);
  assert.deepEqual(calls, []);
});

test('expiry fires the handlers exactly once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  registerDisconnectHandler((userId) => {
    calls.push(userId);
  });

  noteUserDisconnected('alice', 0);
  assert.equal(hasDisconnectGrace('alice'), true);

  t.mock.timers.tick(DISCONNECT_GRACE_MS);
  await flush();

  assert.deepEqual(calls, ['alice']);
  assert.equal(hasDisconnectGrace('alice'), false);
  assert.equal(pendingDisconnectCount(), 0);

  t.mock.timers.tick(DISCONNECT_GRACE_MS);
  await flush();
  assert.equal(calls.length, 1);
});

test('a handler that throws does not stop the remaining handlers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  registerDisconnectHandler(() => {
    throw new Error('boom');
  });
  registerDisconnectHandler(() => {
    throw new Error('also boom');
  });
  registerDisconnectHandler((userId) => {
    calls.push(userId);
  });

  noteUserDisconnected('alice', 0);
  t.mock.timers.tick(DISCONNECT_GRACE_MS);
  await flush();

  assert.deepEqual(calls, ['alice']);
});

test('async handlers are awaited before the next one runs', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const order: string[] = [];
  registerDisconnectHandler(async (userId) => {
    await new Promise((resolve) => setImmediate(resolve));
    order.push(`first:${userId}`);
  });
  registerDisconnectHandler((userId) => {
    order.push(`second:${userId}`);
  });

  noteUserDisconnected('alice', 0);
  t.mock.timers.tick(DISCONNECT_GRACE_MS);
  await flush();
  await flush();

  assert.deepEqual(order, ['first:alice', 'second:alice']);
});

test('restarting a grace window does not double-fire it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  registerDisconnectHandler((userId) => {
    calls.push(userId);
  });

  startDisconnectGrace('alice');
  t.mock.timers.tick(DISCONNECT_GRACE_MS / 2);
  // Restart: the original window is cancelled, not queued alongside the new one.
  startDisconnectGrace('alice');

  t.mock.timers.tick(DISCONNECT_GRACE_MS / 2);
  await flush();
  assert.equal(calls.length, 0);

  t.mock.timers.tick(DISCONNECT_GRACE_MS / 2);
  await flush();
  assert.equal(calls.length, 1);
});

test('grace windows are tracked per user', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  registerDisconnectHandler((userId) => {
    calls.push(userId);
  });

  noteUserDisconnected('alice', 0);
  t.mock.timers.tick(DISCONNECT_GRACE_MS / 2);
  noteUserDisconnected('bob', 0);
  assert.equal(pendingDisconnectCount(), 2);

  t.mock.timers.tick(DISCONNECT_GRACE_MS / 2);
  await flush();

  assert.deepEqual(calls, ['alice']);
  assert.equal(hasDisconnectGrace('bob'), true);

  t.mock.timers.tick(DISCONNECT_GRACE_MS);
  await flush();
  assert.deepEqual(calls, ['alice', 'bob']);
  assert.equal(pendingDisconnectCount(), 0);
});

test('cancelling an absent window is a no-op', () => {
  assert.equal(cancelDisconnectGrace('nobody'), false);
  assert.equal(pendingDisconnectCount(), 0);
});

test('handlers are registered only once', () => {
  const handler = (): void => {};
  registerDisconnectHandler(handler);
  registerDisconnectHandler(handler);
  assert.equal(getDisconnectHandlerCount(), 1);
});

test('resetDisconnectGrace clears pending windows without touching handlers', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const handler = (): void => {};
  registerDisconnectHandler(handler);

  noteUserDisconnected('alice', 0);
  assert.equal(pendingDisconnectCount(), 1);

  resetDisconnectGrace();
  assert.equal(pendingDisconnectCount(), 0);
  assert.equal(getDisconnectHandlerCount(), 1);
});

test('suspend handlers fire the moment the last socket drops', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const suspended: string[] = [];
  registerDisconnectSuspendHandler((userId) => {
    suspended.push(userId);
  });

  noteUserDisconnected('alice', 0);
  assert.deepEqual(suspended, ['alice']);
});

test('suspend handlers stay quiet while another socket is open', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const suspended: string[] = [];
  registerDisconnectSuspendHandler((userId) => {
    suspended.push(userId);
  });

  noteUserDisconnected('alice', 2);
  assert.deepEqual(suspended, []);
  assert.equal(hasDisconnectGrace('alice'), false);
});

test('a reconnect inside the window fires the reconnect handlers', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const resumed: string[] = [];
  registerReconnectHandler((userId) => {
    resumed.push(userId);
  });

  noteUserDisconnected('alice', 0);
  assert.deepEqual(resumed, []);

  noteUserConnected('alice');
  assert.deepEqual(resumed, ['alice']);
  assert.equal(hasDisconnectGrace('alice'), false);
});

test('reconnecting without an open grace does not fire reconnect handlers', () => {
  const resumed: string[] = [];
  registerReconnectHandler((userId) => {
    resumed.push(userId);
  });

  noteUserConnected('alice');
  assert.deepEqual(resumed, []);
});

test('grace expiry never fires the reconnect handlers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const expired: string[] = [];
  const resumed: string[] = [];
  registerDisconnectHandler((userId) => {
    expired.push(userId);
  });
  registerReconnectHandler((userId) => {
    resumed.push(userId);
  });

  noteUserDisconnected('alice', 0);
  t.mock.timers.tick(DISCONNECT_GRACE_MS);
  await flush();

  assert.deepEqual(expired, ['alice']);
  assert.deepEqual(resumed, []);
});

test('suspend and reconnect handlers are registered only once', () => {
  const suspend = (): void => {};
  const reconnect = (): void => {};
  registerDisconnectSuspendHandler(suspend);
  registerDisconnectSuspendHandler(suspend);
  registerReconnectHandler(reconnect);
  registerReconnectHandler(reconnect);

  assert.equal(getDisconnectSuspendHandlerCount(), 1);
  assert.equal(getReconnectHandlerCount(), 1);
});

test('clearing handlers wipes all three registries', () => {
  registerDisconnectHandler(() => {});
  registerDisconnectSuspendHandler(() => {});
  registerReconnectHandler(() => {});

  clearDisconnectHandlers();

  assert.equal(getDisconnectHandlerCount(), 0);
  assert.equal(getDisconnectSuspendHandlerCount(), 0);
  assert.equal(getReconnectHandlerCount(), 0);
});
