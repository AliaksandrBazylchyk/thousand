import type { Marriage, PlayerId, Turn } from './types';

export const CARD_POINTS_TOTAL = 120;
export const MIN_BID = 100;
export const BID_STEP = 5;
export const MIN_DARK_BID = 120;
export const MIN_DARK_OVERBID = 125;

export const BARREL_SCORE = 880;
export const WIN_SCORE = 1000;
export const BARREL_ATTEMPTS = 3;
export const PENALTY = 120;
export const BOLTS_PER_PENALTY = 3;
export const DEAL_REPEATS_PER_PENALTY = 3;
export const BULLDOZER_SCORE = 555;

export const MARRIAGE_POINTS: Record<Marriage, number> = {
  spades: 40,
  clubs: 60,
  diamonds: 80,
  hearts: 100,
  aces: 200,
};

/** Округление до ближайшего кратного 5; ровно посередине (x,5) — вверх (R1). */
export function round5(value: number): number {
  return Math.floor((value + 2.5) / 5) * 5;
}

export function marriagesSum(marriages: readonly Marriage[]): number {
  return marriages.reduce((sum, m) => sum + MARRIAGE_POINTS[m], 0);
}

/** Очерёдность для раздающего на месте dealerIndex. */
export function turnAt(seats: readonly PlayerId[], dealerIndex: number): Turn {
  const n = seats.length;
  const at = (offset: number) => seats[(((dealerIndex + offset) % n) + n) % n]!;
  const dealer = at(0);
  return {
    dealer,
    shifter: at(-1),
    onHundred: at(1),
    prikupSitter: n === 4 ? dealer : null,
    active: n === 4 ? seats.filter((p) => p !== dealer) : [...seats],
  };
}
