/**
 * How long an interactive transaction waits for a database connection before Prisma gives up (P2028): a suspended Neon
 * compute takes a few seconds to wake up, so the default 2 s would fail the first request after a quiet period. Every
 * interactive transaction passes it as maxWait.
 */
export const TRANSACTION_MAX_WAIT_MS = 15_000;
