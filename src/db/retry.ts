/**
 * Prisma errors of a database waking up or dropping the connection: P2028 (no connection for the transaction within
 * maxWait), P1001 (server unreachable), P1017 (server closed the connection). A transaction failing with one of them was
 * rolled back, so trying it again is safe.
 */
export const WAKE_UP_ERROR_CODES: ReadonlySet<string> = new Set(["P2028", "P1001", "P1017"]);

/** Pause before the next try: long enough for a suspended Neon compute to finish waking up. */
export const WAKE_UP_RETRY_DELAY_MS = 2_000;

export function isWakeUpError(error: unknown): boolean {
  return error instanceof Error && "code" in error && typeof error.code === "string" && WAKE_UP_ERROR_CODES.has(error.code);
}

export type RetryOptions = {
  retries?: number; // tries after the first one
  delayMs?: number;
  wait?: (ms: number) => Promise<void>; // replaced in tests
  onRetry?: (error: unknown, attempt: number) => void; // attempt: 1 for the first new try
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs an operation, and again after a pause when it fails with a wake-up error (WAKE_UP_ERROR_CODES), up to `retries`
 * more times; any other error, or the last wake-up error, is thrown as it is.
 */
export async function retryOnWakeUp<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 1, delayMs = WAKE_UP_RETRY_DELAY_MS, wait = sleep, onRetry } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries || !isWakeUpError(error)) {
        throw error;
      }
      onRetry?.(error, attempt + 1);
      await wait(delayMs);
    }
  }
}
