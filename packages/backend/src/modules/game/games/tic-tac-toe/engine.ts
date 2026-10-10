export const MOVE_TIMEOUT_MS = 3000;
export const MAX_TOKENS_PER_PLAYER = 3;
export const HOUSE_RAKE_PERCENT = 4;

export type TttSymbol = 'X' | 'O';
export type TttStatus = 'waiting' | 'playing' | 'finished';
export type TttWinReason = 'line' | 'timeout' | 'resign' | 'draw';

export interface TttPlayer {
  id: string;
  symbol: TttSymbol;
}

export interface TttMove {
  player: string;
  symbol: TttSymbol;
  cell: number;
  at: number;
  vanishedCell: number | null;
}

export interface TttGame {
  id: string;
  stake: string;
  currency: string;
  players: TttPlayer[];
  board: (TttSymbol | null)[];
  status: TttStatus;
  turnPlayerId: string | null;
  deadline: number | null;
  /**
   * Turn timer snapshot taken when the timer was paused (a player dropped and
   * their disconnect grace opened). `null` means the timer is running.
   */
  pausedRemainingMs: number | null;
  winnerId: string | null;
  winReason: TttWinReason | null;
  winningLine: number[] | null;
  moveHistory: TttMove[];
  placements: Record<string, number[]>;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}

export class TttError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TttError';
    this.code = code;
  }
}

export const TTT_WIN_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function d2s(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new TttError('INVALID_AMOUNT', `invalid decimal amount: ${value}`);
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = match[2];
  const frac = (match[3] || '').padEnd(8, '0').slice(0, 8);
  return sign * (BigInt(whole) * 100000000n + BigInt(frac));
}

function s2d(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / 100000000n;
  const frac = (abs % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  const body = frac.length > 0 ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${body}` : body;
}

function decMul(a: string, b: string): string {
  const product = d2s(a) * d2s(b);
  return s2d(product / 100000000n);
}

export function createTttGame(params: {
  id: string;
  stake: string;
  currency: string;
  firstPlayerId: string;
  now: number;
  secondPlayerId?: string;
}): TttGame {
  const players: TttPlayer[] = [{ id: params.firstPlayerId, symbol: 'X' }];
  if (params.secondPlayerId) {
    players.push({ id: params.secondPlayerId, symbol: 'O' });
  }
  const started = Boolean(params.secondPlayerId);
  return {
    id: params.id,
    stake: params.stake,
    currency: params.currency,
    players,
    board: Array(9).fill(null),
    status: started ? 'playing' : 'waiting',
    turnPlayerId: started ? params.firstPlayerId : null,
    deadline: started ? params.now + MOVE_TIMEOUT_MS : null,
    pausedRemainingMs: null,
    winnerId: null,
    winReason: null,
    winningLine: null,
    moveHistory: [],
    placements: { [params.firstPlayerId]: [], ...(params.secondPlayerId ? { [params.secondPlayerId]: [] } : {}) },
    createdAt: params.now,
    startedAt: started ? params.now : null,
    endedAt: null,
  };
}

export function joinTttGame(game: TttGame, playerId: string, now: number): TttGame {
  if (game.status !== 'waiting') {
    throw new TttError('ALREADY_STARTED', 'game has already started');
  }
  if (game.players.some((player) => player.id === playerId)) {
    throw new TttError('ALREADY_JOINED', 'player is already in this game');
  }
  game.players.push({ id: playerId, symbol: 'O' });
  game.placements[playerId] = [];
  game.status = 'playing';
  game.turnPlayerId = game.players[0].id;
  game.deadline = now + MOVE_TIMEOUT_MS;
  game.pausedRemainingMs = null;
  game.startedAt = now;
  return game;
}

function findWinningLine(game: TttGame): number[] | null {
  for (const line of TTT_WIN_LINES) {
    const [a, b, c] = line;
    const symbol = game.board[a];
    if (symbol && game.board[b] === symbol && game.board[c] === symbol) {
      return line;
    }
  }
  return null;
}

function finish(game: TttGame, winnerId: string | null, reason: TttWinReason, now: number, line: number[] | null = null): TttGame {
  game.status = 'finished';
  game.winnerId = winnerId;
  game.winReason = reason;
  game.winningLine = line;
  game.turnPlayerId = null;
  game.deadline = null;
  game.pausedRemainingMs = null;
  game.endedAt = now;
  return game;
}

export function playTttMove(game: TttGame, playerId: string, cell: number, now: number): { game: TttGame; vanishedCell: number | null } {
  if (game.status !== 'playing') {
    throw new TttError('NOT_PLAYING', 'game is not in progress');
  }
  if (game.turnPlayerId !== playerId) {
    throw new TttError('NOT_YOUR_TURN', 'it is not your turn');
  }
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    throw new TttError('INVALID_CELL', 'cell must be an integer between 0 and 8');
  }
  if (game.board[cell] !== null) {
    throw new TttError('CELL_OCCUPIED', 'cell is already occupied');
  }
  if (game.pausedRemainingMs !== null) {
    throw new TttError('TIMER_PAUSED', 'move timer is paused while a player reconnects');
  }
  if (game.deadline !== null && now > game.deadline) {
    throw new TttError('TIMEOUT', 'move timer expired');
  }

  const player = game.players.find((entry) => entry.id === playerId)!;
  game.board[cell] = player.symbol;

  const placements = game.placements[playerId];
  placements.push(cell);
  let vanishedCell: number | null = null;
  if (placements.length > MAX_TOKENS_PER_PLAYER) {
    vanishedCell = placements.shift()!;
    game.board[vanishedCell] = null;
  }

  game.moveHistory.push({ player: playerId, symbol: player.symbol, cell, at: now, vanishedCell });

  const line = findWinningLine(game);
  if (line) {
    finish(game, playerId, 'line', now, line);
    return { game, vanishedCell };
  }

  if (game.board.every((entry) => entry !== null)) {
    finish(game, null, 'draw', now);
    return { game, vanishedCell };
  }

  const opponent = game.players.find((entry) => entry.id !== playerId)!;
  game.turnPlayerId = opponent.id;
  game.deadline = now + MOVE_TIMEOUT_MS;
  game.pausedRemainingMs = null;
  return { game, vanishedCell };
}

/**
 * Milliseconds left on the current turn, or null when no timer applies
 * (game over / still waiting). Never negative, so a paused or expired turn
 * reports 0 rather than counting down forever.
 */
export function tttTurnRemainingMs(game: TttGame, now: number): number | null {
  if (game.status !== 'playing') return null;
  if (game.pausedRemainingMs !== null) return Math.max(0, game.pausedRemainingMs);
  if (game.deadline === null) return null;
  return Math.max(0, game.deadline - now);
}

export function isTttTimerPaused(game: TttGame): boolean {
  return game.status === 'playing' && game.pausedRemainingMs !== null;
}

/**
 * Freezes the turn timer, banking whatever time was left. Called the instant a
 * player's sockets drop so the opponent cannot win on the clock while the
 * grace window is open.
 */
export function pauseTttTurnTimer(game: TttGame, now: number): number {
  if (game.status !== 'playing') return 0;
  if (game.pausedRemainingMs !== null) return game.pausedRemainingMs;

  const remaining = game.deadline === null ? MOVE_TIMEOUT_MS : Math.max(0, game.deadline - now);
  game.pausedRemainingMs = remaining;
  return remaining;
}

/**
 * Restores a paused turn timer, restarting the clock from the banked time.
 */
export function resumeTttTurnTimer(game: TttGame, now: number): number {
  if (game.status !== 'playing') return 0;
  if (game.pausedRemainingMs === null) {
    return game.deadline === null ? 0 : Math.max(0, game.deadline - now);
  }

  const remaining = game.pausedRemainingMs;
  game.pausedRemainingMs = null;
  game.deadline = now + remaining;
  return remaining;
}

export function timeoutTttGame(game: TttGame, now: number): TttGame {
  // A paused timer belongs to an open disconnect grace; the grace, not the
  // clock, decides that room's fate.
  if (game.status !== 'playing' || game.pausedRemainingMs !== null) {
    return game;
  }
  const loser = game.turnPlayerId;
  const winner = game.players.find((entry) => entry.id !== loser);
  if (!winner) {
    throw new TttError('INVALID_STATE', 'cannot resolve timeout without two players');
  }
  return finish(game, winner.id, 'timeout', now);
}

export function resignTttGame(game: TttGame, playerId: string, now: number): TttGame {
  if (game.status !== 'playing') {
    throw new TttError('NOT_PLAYING', 'game is not in progress');
  }
  if (!game.players.some((entry) => entry.id === playerId)) {
    throw new TttError('NOT_A_PLAYER', 'only players can resign');
  }
  const winner = game.players.find((entry) => entry.id !== playerId)!;
  return finish(game, winner.id, 'resign', now);
}

export function cancelTttGame(game: TttGame, playerId: string): TttGame {
  if (game.status !== 'waiting') {
    throw new TttError('ALREADY_STARTED', 'only waiting games can be cancelled');
  }
  if (game.players[0].id !== playerId) {
    throw new TttError('NOT_OWNER', 'only the creator can cancel a waiting game');
  }
  game.status = 'finished';
  game.deadline = null;
  game.pausedRemainingMs = null;
  game.endedAt = null;
  return game;
}

export type TttDisconnectAction = 'forfeit' | 'cancel';

export interface TttDisconnectPlan {
  roomId: string;
  action: TttDisconnectAction;
}

/**
 * Decides what happens to every room a player sits in once their disconnect
 * grace expires. In-progress rooms are forfeited to the opponent; a room still
 * waiting for an opponent is cancelled and refunded to its owner.
 */
export function planTttDisconnectActions(
  games: Iterable<TttGame>,
  userId: string
): TttDisconnectPlan[] {
  const plan: TttDisconnectPlan[] = [];
  for (const game of games) {
    if (!game.players.some((entry) => entry.id === userId)) continue;

    if (game.status === 'playing') {
      plan.push({ roomId: game.id, action: 'forfeit' });
      continue;
    }

    if (game.status === 'waiting' && game.players[0]?.id === userId) {
      plan.push({ roomId: game.id, action: 'cancel' });
    }
  }
  return plan;
}

export interface TttSettlement {
  pot: string;
  rake: string;
  winnerPayout: string;
  rakePercent: number;
}

export function calculateTttSettlement(stake: string): TttSettlement {
  const pot = decMul(stake, '2');
  const winnerPayout = decMul(pot, s2d((100000000n * BigInt(100 - HOUSE_RAKE_PERCENT)) / 100n));
  const rakeAmount = (() => {
    const rakeScaled = d2s(pot) - d2s(winnerPayout);
    return s2d(rakeScaled);
  })();
  return {
    pot,
    rake: rakeAmount,
    winnerPayout,
    rakePercent: HOUSE_RAKE_PERCENT,
  };
}
