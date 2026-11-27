// Pure scoring logic shared by client (previews) and server (authoritative).
// Kept dependency-free so it can be unit-tested.

export const PROMPTS_PER_DAY = 5;
export const MAX_POINTS_PER_PROMPT = 100;
/** The last debate of every room is the Final Boss: double points. */
export const BOSS_INDEX = PROMPTS_PER_DAY - 1;
export const multiplierFor = (index: number) => (index === BOSS_INDEX ? 2 : 1);
export const MAX_POINTS_PER_DAY =
  Array.from({ length: PROMPTS_PER_DAY }, (_, i) => multiplierFor(i)).reduce((s, m) => s + m, 0) * MAX_POINTS_PER_PROMPT;

/**
 * Virtual votes added (split evenly) so the first few players aren't scored
 * against a "room" of 1-2 people. Fades out naturally as real votes arrive.
 */
export const PRIOR_VOTES = 4;

export type Tally = { a: number; b: number };

/** % of the room that picked A, smoothed with the prior. 0..100, 1 decimal. */
export function scoringPctA(t: Tally): number {
  const half = PRIOR_VOTES / 2;
  const pct = ((t.a + half) / (t.a + t.b + PRIOR_VOTES)) * 100;
  return Math.round(pct * 10) / 10;
}

/** Raw % of real votes that picked A (what we show players). */
export function displayPctA(t: Tally): number {
  const total = t.a + t.b;
  if (total === 0) return 50;
  return Math.round((t.a / total) * 100);
}

/** Every point of error costs 2 points: perfect = 100, 50% off = 0. */
export function pointsFor(guessPctA: number, actualPctA: number): number {
  const guess = clamp(Math.round(guessPctA), 0, 100);
  const err = Math.abs(guess - actualPctA);
  return clamp(Math.round(MAX_POINTS_PER_PROMPT - err * 2), 0, MAX_POINTS_PER_PROMPT);
}

export type Grade = 'bullseye' | 'close' | 'off' | 'miss';

export function gradeFor(points: number): Grade {
  if (points >= 94) return 'bullseye';
  if (points >= 75) return 'close';
  if (points >= 45) return 'off';
  return 'miss';
}

export const GRADE_EMOJI: Record<Grade, string> = {
  bullseye: '🎯',
  close: '🟩',
  off: '🟨',
  miss: '🟥',
};

export type Title = { name: string; emoji: string; min: number };

/** Daily titles, highest first. Used for summary + user flair. */
/** Thresholds are fractions of the daily max so they survive rule changes. */
export const TITLES: Title[] = [
  { name: 'Mind Reader', emoji: '🔮', min: Math.round(MAX_POINTS_PER_DAY * 0.9) },
  { name: 'Room Reader', emoji: '🧠', min: Math.round(MAX_POINTS_PER_DAY * 0.76) },
  { name: 'Vibe Checker', emoji: '📡', min: Math.round(MAX_POINTS_PER_DAY * 0.6) },
  { name: 'Hot Take Haver', emoji: '🌶️', min: Math.round(MAX_POINTS_PER_DAY * 0.4) },
  { name: 'Certified Contrarian', emoji: '🙃', min: 0 },
];

export function titleFor(score: number): Title {
  return TITLES.find((t) => score >= t.min) ?? TITLES[TITLES.length - 1]!;
}

/** Streak update. Only the current day's round extends a streak. */
export function nextStreak(prevStreak: number, lastDay: number | undefined, day: number): number {
  if (lastDay === day) return prevStreak; // already counted today
  if (lastDay === day - 1) return prevStreak + 1;
  return 1;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Points for a debate at a given position (applies the Final Boss multiplier). */
export function weightedPoints(index: number, guessPctA: number, actualPctA: number): number {
  return pointsFor(guessPctA, actualPctA) * multiplierFor(index);
}

/** Grade on the 0-100 accuracy scale regardless of multiplier. */
export function gradeForIndex(index: number, points: number): Grade {
  return gradeFor(points / multiplierFor(index));
}

/** Re-scores a set of guesses against final splits. Returns per-prompt points + total. */
export function rescore(guesses: number[], finalPctA: number[]): { points: number[]; total: number } {
  const points = guesses.map((g, i) => weightedPoints(i, g, finalPctA[i] ?? 50));
  return { points, total: points.reduce((s, p) => s + p, 0) };
}

/** Index of the debate closest to a 50/50 split (ties -> earliest). */
export function divisiveIndex(pctA: number[]): number {
  let best = 0;
  pctA.forEach((p, i) => {
    if (Math.abs(p - 50) < Math.abs(pctA[best]! - 50)) best = i;
  });
  return best;
}

/** Index of the most one-sided debate (ties -> earliest). */
export function lopsidedIndex(pctA: number[]): number {
  let best = 0;
  pctA.forEach((p, i) => {
    if (Math.abs(p - 50) > Math.abs(pctA[best]! - 50)) best = i;
  });
  return best;
}
