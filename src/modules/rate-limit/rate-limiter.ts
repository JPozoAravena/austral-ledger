import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { RedisService } from '../../infra/redis/redis.module.js';

// Fixed window, atomic: INCR, and (re)arm the expiry if the key has none.
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}`;

const hitReply = z.tuple([z.number(), z.number()]);

export interface Hit {
  readonly count: number;
  readonly ttlMs: number;
}

@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);

  constructor(private readonly redis: RedisService) {}

  /** Returns null when Redis is unavailable: rate limiting fails open. */
  async hit(key: string, windowMs: number): Promise<Hit | null> {
    try {
      const reply = hitReply.parse(await this.redis.client.eval(HIT_SCRIPT, 1, key, windowMs));
      return { count: reply[0], ttlMs: reply[1] };
    } catch {
      this.logger.warn('Rate limiter unavailable, allowing request');
      return null;
    }
  }
}
