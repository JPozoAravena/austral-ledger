import { describe, expect, it } from 'vitest';
import { rateLimitState } from '../../../src/modules/rate-limit/rate-limit-state.js';

describe('rateLimitState', () => {
  it('reports the remaining quota and rounds the reset up to whole seconds', () => {
    expect(rateLimitState(1, 59_100, 100)).toEqual({
      limit: 100,
      remaining: 99,
      reset: 60,
      limited: false,
    });
  });

  it('allows exactly `limit` requests and limits the next one', () => {
    expect(rateLimitState(100, 1000, 100)).toMatchObject({ remaining: 0, limited: false });
    expect(rateLimitState(101, 1000, 100)).toMatchObject({ remaining: 0, limited: true });
  });

  it('never reports a reset below one second', () => {
    expect(rateLimitState(1, 0, 10).reset).toBe(1);
  });
});
