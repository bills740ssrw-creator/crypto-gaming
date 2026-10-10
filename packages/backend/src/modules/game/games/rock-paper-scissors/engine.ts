export type RpsMove = 'rock' | 'paper' | 'scissors';
export type RpsOutcome = 'win' | 'loss' | 'push';

export interface RpsConfig {
  baseWinMultiplier: number;
  streakBonusStep: number;
  maxStreakMultiplier: number;
}

export const RPS_MOVES: RpsMove[] = ['rock', 'paper', 'scissors'];

export const DEFAULT_RPS_CONFIG: RpsConfig = {
  baseWinMultiplier: 1.95,
  streakBonusStep: 0.1,
  maxStreakMultiplier: 1.5,
};

const BEATS: Record<RpsMove, RpsMove> = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
};

export class RpsError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RpsError';
    this.code = code;
  }
}

export function isRpsMove(value: string): value is RpsMove {
  return value === 'rock' || value === 'paper' || value === 'scissors';
}

export function houseMoveFromFloat(float: number): RpsMove {
  if (!Number.isFinite(float) || float < 0 || float >= 1) {
    throw new RpsError('INVALID_FLOAT', 'float must be within [0, 1)');
  }
  const index = Math.min(2, Math.floor(float * 3));
  return RPS_MOVES[index];
}

export function rpsOutcome(player: RpsMove, house: RpsMove): RpsOutcome {
  if (player === house) return 'push';
  return BEATS[player] === house ? 'win' : 'loss';
}

export function streakMultiplier(streak: number, config: RpsConfig = DEFAULT_RPS_CONFIG): number {
  const effective = Math.max(0, Math.floor(streak));
  const bonus = 1 + effective * config.streakBonusStep;
  const capped = Math.min(bonus, config.maxStreakMultiplier);
  return Math.round(capped * 1e6) / 1e6;
}

export function totalWinMultiplier(streak: number, config: RpsConfig = DEFAULT_RPS_CONFIG): number {
  const total = config.baseWinMultiplier * streakMultiplier(streak, config);
  return Math.round(total * 1e6) / 1e6;
}

export function nextStreak(streak: number, outcome: RpsOutcome): number {
  if (outcome === 'win') return streak + 1;
  if (outcome === 'push') return streak;
  return 0;
}

function d2s(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new RpsError('INVALID_AMOUNT', `invalid decimal amount: ${value}`);
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

function decSub(a: string, b: string): string {
  return s2d(d2s(a) - d2s(b));
}

export interface RpsPayout {
  payout: string;
  net: string;
  multiplier: number;
  streakAfter: number;
}

export function rpsPayout(
  stake: string,
  outcome: RpsOutcome,
  streak: number,
  config: RpsConfig = DEFAULT_RPS_CONFIG
): RpsPayout {
  const streakAfter = nextStreak(streak, outcome);
  if (outcome === 'loss') {
    return { payout: '0', net: `-${stake}`, multiplier: 0, streakAfter: 0 };
  }
  if (outcome === 'push') {
    return { payout: stake, net: '0', multiplier: 1, streakAfter };
  }
  const multiplier = totalWinMultiplier(streak, config);
  const payout = decMul(stake, String(multiplier));
  return { payout, net: decSub(payout, stake), multiplier, streakAfter };
}
