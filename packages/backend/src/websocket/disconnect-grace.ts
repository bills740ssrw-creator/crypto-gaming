import { logger } from '../services/logger';

/**
 * How long a player keeps their seat after their last socket drops.
 * A reconnect inside this window is treated as a blip; expiry forfeits.
 */
export const DISCONNECT_GRACE_MS: number = Number(process.env.DISCONNECT_GRACE_MS ?? 5000);

export type DisconnectHandler = (userId: string) => void | Promise<void>;

const graceTimers = new Map<string, NodeJS.Timeout>();
/** Fires when the grace window opens (last socket just dropped). */
const suspendHandlers: DisconnectHandler[] = [];
/** Fires when a grace window expires. */
const handlers: DisconnectHandler[] = [];
/** Fires when a grace window is cancelled by a reconnect. */
const reconnectHandlers: DisconnectHandler[] = [];

function unrefTimer(timer: NodeJS.Timeout): void {
  const maybeUnref = timer as NodeJS.Timeout & { unref?: () => void };
  if (typeof maybeUnref.unref === 'function') maybeUnref.unref();
}

function registerHandler(list: DisconnectHandler[], handler: DisconnectHandler): void {
  if (!list.includes(handler)) {
    list.push(handler);
  }
}

export function registerDisconnectHandler(handler: DisconnectHandler): void {
  registerHandler(handlers, handler);
}

export function registerDisconnectSuspendHandler(handler: DisconnectHandler): void {
  registerHandler(suspendHandlers, handler);
}

export function registerReconnectHandler(handler: DisconnectHandler): void {
  registerHandler(reconnectHandlers, handler);
}

export function getDisconnectHandlerCount(): number {
  return handlers.length;
}

export function getDisconnectSuspendHandlerCount(): number {
  return suspendHandlers.length;
}

export function getReconnectHandlerCount(): number {
  return reconnectHandlers.length;
}

export function clearDisconnectHandlers(): void {
  suspendHandlers.length = 0;
  handlers.length = 0;
  reconnectHandlers.length = 0;
}

export function cancelDisconnectGrace(userId: string): boolean {
  const timer = graceTimers.get(userId);
  if (!timer) return false;
  clearTimeout(timer);
  graceTimers.delete(userId);
  logger.debug('Disconnect grace cancelled (player reconnected)', { userId });
  return true;
}

export function startDisconnectGrace(userId: string): void {
  cancelDisconnectGrace(userId);
  const timer = setTimeout(() => {
    graceTimers.delete(userId);
    void runHandlers(handlers, userId, 'disconnect grace expired');
  }, DISCONNECT_GRACE_MS);
  unrefTimer(timer);
  graceTimers.set(userId, timer);
  logger.debug('Disconnect grace started', { userId, graceMs: DISCONNECT_GRACE_MS });
}

/**
 * Called the moment a player's last socket drops. Suspending work (pausing a
 * turn timer, for example) has to happen here rather than on grace expiry —
 * by expiry it is already too late.
 */
function runSuspendHandlers(userId: string): void {
  void runHandlers(suspendHandlers, userId, 'disconnect handlers started');
}

export function noteUserConnected(userId: string): void {
  if (!cancelDisconnectGrace(userId)) return;
  void runHandlers(reconnectHandlers, userId, 'disconnect grace cancelled by reconnect');
}

export function noteUserDisconnected(userId: string, remainingSockets: number): void {
  if (remainingSockets > 0) {
    cancelDisconnectGrace(userId);
    return;
  }
  runSuspendHandlers(userId);
  startDisconnectGrace(userId);
}

export function hasDisconnectGrace(userId: string): boolean {
  return graceTimers.has(userId);
}

export function pendingDisconnectCount(): number {
  return graceTimers.size;
}

export function resetDisconnectGrace(): void {
  for (const timer of graceTimers.values()) {
    clearTimeout(timer);
  }
  graceTimers.clear();
}

async function runHandlers(list: DisconnectHandler[], userId: string, context: string): Promise<void> {
  if (list.length === 0) return;
  logger.info(context, { userId });
  for (const handler of list) {
    try {
      await handler(userId);
    } catch (error) {
      logger.error('Disconnect handler failed', {
        userId,
        error: (error as Error).message,
      });
    }
  }
}
