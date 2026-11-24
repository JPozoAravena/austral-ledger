export interface RateLimitState {
  readonly limit: number;
  readonly remaining: number;
  /** Seconds until the window resets. */
  readonly reset: number;
  readonly limited: boolean;
}

/** `count` includes the current request; `ttlMs` is the time left in the window. */
export function rateLimitState(count: number, ttlMs: number, limit: number): RateLimitState {
  return {
    limit,
    remaining: Math.max(0, limit - count),
    reset: Math.max(1, Math.ceil(ttlMs / 1000)),
    limited: count > limit,
  };
}
