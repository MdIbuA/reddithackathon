// Request/response contracts between the web view and the server.

export type Pick = 'a' | 'b';

export type Prompt = {
  id: string;
  q: string;
  a: string;
  b: string;
  /** Reddit username if this prompt was suggested by the community. */
  author?: string;
};

export type Reveal = {
  pick: Pick;
  guess: number; // predicted % picking A
  actualPctA: number; // raw % shown to the player
  scoredPctA: number; // smoothed % used for scoring
  total: number; // real votes incl. yours
  points: number;
};

export type Summary = {
  score: number;
  title: string;
  titleEmoji: string;
  grid: string; // emoji grid, e.g. 🎯🟩🟨🟥🟩
  rank: number; // 1-based rank on today's board
  players: number;
  contrarianCount: number; // prompts where you were in the minority
  /** True once the room has closed and the score was re-scored against the final split. */
  final: boolean;
  /** Score shown at play time, before the room closed. */
  provisionalScore: number;
  /** Per-debate points after re-scoring (present once final). */
  finalPoints?: number[];
};

export type VerdictPrompt = { q: string; a: string; b: string; author?: string; pctA: number; total: number };

/** Snapshot of a closed room, shown at the top of the next day's post. */
export type Verdict = {
  day: number;
  players: number;
  prompts: VerdictPrompt[];
  divisive: number; // index of the closest-to-50/50 debate
  lopsided: number; // index of the most one-sided debate
  top: { username: string; score: number }[];
};

export type YesterdayInfo = {
  verdict: Verdict;
  /** The player's locked result for that room, if they played. */
  me: { score: number; rank: number; title: string; titleEmoji: string; delta: number } | null;
};

export type UserStats = {
  streak: number;
  bestStreak: number;
  played: number;
  totalScore: number;
};

export type StateResponse = {
  day: number;
  isToday: boolean;
  subreddit: string;
  username: string | null;
  snoovatar: string | null;
  prompts: Prompt[];
  answers: (Reveal | null)[];
  summary: Summary | null;
  stats: UserStats;
  playersToday: number;
  /** Final split per debate once this room has closed (null while live). */
  closed: Verdict | null;
  yesterday: YesterdayInfo | null;
};

export type AnswerRequest = { index: number; pick: Pick; guess: number };
export type AnswerResponse = { reveal: Reveal; summary: Summary | null; stats: UserStats };

export type LeaderboardEntry = { rank: number; username: string; score: number };
export type LeaderboardResponse = {
  day: LeaderboardEntry[];
  allTime: LeaderboardEntry[];
  me: { dayRank: number | null; allTimeRank: number | null };
};

export type Suggestion = { id: string; q: string; a: string; b: string; author: string; votes: number };
export type SuggestRequest = { q: string; a: string; b: string };
export type SuggestionsResponse = { items: Suggestion[]; remainingToday: number };

export type OkResponse = { ok: true; message?: string };
export type ErrorResponse = { error: string; code?: 'LOGIN_REQUIRED' | 'BAD_REQUEST' | 'NOT_FOUND' | 'RATE_LIMITED' };
