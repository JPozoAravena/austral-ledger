import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.module.js';

export type LockState =
  | { readonly status: 'acquired'; readonly token: string }
  | { readonly status: 'busy' }
  | { readonly status: 'unavailable' };

// Compare-and-delete: only the owner of the token may release the lock.
const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

const lockKey = (apiKeyId: string, key: string): string => `idem:${apiKeyId}:${key}`;

@Injectable()
export class IdempotencyLock {
  private readonly logger = new Logger(IdempotencyLock.name);

  constructor(private readonly redis: RedisService) {}

  /** Fail-open: if Redis is down the request proceeds, and the PostgreSQL unique constraint still prevents double execution. */
  async acquire(apiKeyId: string, key: string, ttlMs: number): Promise<LockState> {
    const token = randomUUID();
    try {
      const reply = await this.redis.client.set(lockKey(apiKeyId, key), token, 'PX', ttlMs, 'NX');
      return reply === 'OK' ? { status: 'acquired', token } : { status: 'busy' };
    } catch {
      this.logger.warn('Idempotency lock unavailable, continuing without it');
      return { status: 'unavailable' };
    }
  }

  async release(apiKeyId: string, key: string, token: string): Promise<void> {
    try {
      await this.redis.client.eval(RELEASE_SCRIPT, 1, lockKey(apiKeyId, key), token);
    } catch {
      this.logger.warn('Idempotency lock release failed; it will expire on its own');
    }
  }
}
