// The rules of the weekly challenge (src/engine/challenge.ts, src/db/challenge.ts). Constants rather than environment
// variables, as the save limits (src/lib/limits.ts): rules of the game, the same everywhere.

/** League matchdays of the club that count: a challenge save's score is written once its club has played them. */
export const CHALLENGE_HORIZON_MATCHDAYS = 10;

/** First division clubs a challenge may give, by their rank in the source season (Club.initialRank); any second division club may be given too. */
export const CHALLENGE_FIRST_DIVISION_RANKS = { from: 12, to: 18 } as const;

/** The most saves of one week's challenge: each weighs as a worldVersion 2 save, on the database's storage. */
export const MAX_CHALLENGE_SAVES_PER_WEEK = 20;

/** Hours a challenge save is kept once its challenge has ended: the daily purge deletes it after (src/db/purge.ts). */
export const CHALLENGE_SAVE_RETENTION_HOURS = 24;
