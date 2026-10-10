export interface PathRowConfig {
  winProbability: number;
  multiplier: number;
}

export const PATH_ROW_COUNT = 5;

export const DEFAULT_PATH_ROWS: PathRowConfig[] = [
  { winProbability: 0.95, multiplier: 1.0105 },
  { winProbability: 0.85, multiplier: 1.1294 },
  { winProbability: 0.7, multiplier: 1.3714 },
  { winProbability: 0.55, multiplier: 1.7455 },
  { winProbability: 0.4, multiplier: 2.4 },
];

export type PathRoundStatus = 'committed' | 'active' | 'settled' | 'cancelled';

export interface PathRound {
  id: string;
  userId: string;
  stake: string;
  currency: string;
  rows: PathRowConfig[];
  status: PathRoundStatus;
  clearedRows: number;
  digest: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: number;
  expiresAt: number;
  settledAt: number | null;
  lastRowResult: { row: number; float: number; success: boolean } | null;
}

export class PathError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PathError';
    this.code = code;
  }
}

export function validatePathRows(rows: unknown): PathRowConfig[] {
  if (!Array.isArray(rows) || rows.length !== PATH_ROW_COUNT) {
    throw new PathError('INVALID_ROWS', `exactly ${PATH_ROW_COUNT} rows are required`);
  }
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      throw new PathError('INVALID_ROWS', 'each row must be an object');
    }
    const { winProbability, multiplier } = row as PathRowConfig;
    if (typeof winProbability !== 'number' || Number.isNaN(winProbability) || winProbability <= 0 || winProbability >= 1) {
      throw new PathError('INVALID_ROWS', 'winProbability must be within (0, 1)');
    }
    if (typeof multiplier !== 'number' || Number.isNaN(multiplier) || multiplier <= 0) {
      throw new PathError('INVALID_ROWS', 'multiplier must be greater than 0');
    }
  }
  return rows as PathRowConfig[];
}

export function rowSucceeded(row: PathRowConfig, float: number): boolean {
  if (!Number.isFinite(float) || float < 0 || float >= 1) {
    throw new PathError('INVALID_FLOAT', 'float must be within [0, 1)');
  }
  return float < row.winProbability;
}

function d2s(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new PathError('INVALID_AMOUNT', `invalid decimal amount: ${value}`);
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
  return s2d((d2s(a) * d2s(b)) / 100000000n);
}

export function multiplierNumberToString(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PathError('INVALID_MULTIPLIER', 'multiplier must be a positive finite number');
  }
  return String(value);
}

export function cumulativeMultiplier(rows: PathRowConfig[], clearedRows: number): string {
  if (clearedRows < 0 || clearedRows > rows.length) {
    throw new PathError('INVALID_CLEARED', 'clearedRows out of range');
  }
  let product = '1';
  for (let i = 0; i < clearedRows; i++) {
    product = decMul(product, multiplierNumberToString(rows[i].multiplier));
  }
  return product;
}

export function pathPayout(stake: string, rows: PathRowConfig[], clearedRows: number): string {
  return decMul(stake, cumulativeMultiplier(rows, clearedRows));
}

export function createPathRound(params: {
  id: string;
  userId: string;
  stake: string;
  currency: string;
  rows: PathRowConfig[];
  digest: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  now: number;
  ttlMs: number;
}): PathRound {
  return {
    id: params.id,
    userId: params.userId,
    stake: params.stake,
    currency: params.currency,
    rows: validatePathRows(params.rows),
    status: 'committed',
    clearedRows: 0,
    digest: params.digest,
    serverSeed: params.serverSeed,
    serverSeedHash: params.serverSeedHash,
    clientSeed: params.clientSeed,
    nonce: params.nonce,
    createdAt: params.now,
    expiresAt: params.now + params.ttlMs,
    settledAt: null,
    lastRowResult: null,
  };
}

export function advancePathRound(round: PathRound, rowFloats: number[], now: number): PathRound {
  if (round.status !== 'committed' && round.status !== 'active') {
    throw new PathError('ROUND_NOT_ACTIVE', 'round is not active');
  }
  if (round.status === 'committed') {
    round.status = 'active';
  }
  const rowIndex = round.clearedRows;
  if (rowIndex >= round.rows.length) {
    throw new PathError('ALL_ROWS_CLEARED', 'all rows are already cleared');
  }
  const float = rowFloats[rowIndex];
  if (float === undefined) {
    throw new PathError('MISSING_FLOAT', 'missing float for row');
  }
  const success = rowSucceeded(round.rows[rowIndex], float);
  round.lastRowResult = { row: rowIndex, float, success };
  if (!success) {
    round.status = 'settled';
    round.settledAt = now;
    return round;
  }
  round.clearedRows += 1;
  if (round.clearedRows === round.rows.length) {
    round.status = 'settled';
    round.settledAt = now;
  }
  return round;
}

export function cashoutPathRound(round: PathRound, now: number): PathRound {
  if (round.status !== 'active' && round.status !== 'committed') {
    throw new PathError('ROUND_NOT_ACTIVE', 'round is not active');
  }
  if (round.clearedRows === 0) {
    throw new PathError('NOTHING_CLEARED', 'advance at least one row before cashing out');
  }
  round.status = 'settled';
  round.settledAt = now;
  return round;
}

export function cancelPathRound(round: PathRound, now: number): PathRound {
  if (round.status !== 'committed' && round.status !== 'active') {
    throw new PathError('ROUND_NOT_CANCELLABLE', 'round can no longer be cancelled');
  }
  if (round.clearedRows > 0) {
    throw new PathError('ALREADY_STARTED', 'cannot cancel after the first advance');
  }
  round.status = 'cancelled';
  round.settledAt = now;
  return round;
}
