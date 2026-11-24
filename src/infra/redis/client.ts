import { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';

/** Bounded retries and command timeout keep callers from hanging when Redis is down (they fail open). */
export function createRedisClient(config: Pick<Env, 'REDIS_URL'>): Redis {
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    commandTimeout: 1000,
  });
}
