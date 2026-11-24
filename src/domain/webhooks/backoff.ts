const MAX_BACKOFF_MS = 60 * 60 * 1000;

/**
 * Exponential backoff with equal jitter: the delay after the n-th failed attempt
 * is uniform in [base * 2^(n-1) / 2, base * 2^(n-1)], capped at one hour.
 */
export function backoffDelayMs(
  failedAttempts: number,
  baseMs: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(baseMs * 2 ** (failedAttempts - 1), MAX_BACKOFF_MS);
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}
