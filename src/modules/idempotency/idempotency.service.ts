import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { Executor } from '../../infra/db/client.js';
import { DatabaseService } from '../../infra/db/database.module.js';
import { IDEMPOTENCY_UNIQUE } from '../../infra/db/schema.js';
import { MetricsService } from '../observability/metrics.service.js';
import { IdempotencyLock } from './idempotency.lock.js';
import { IdempotencyRepository, type StoredResponse } from './idempotency.repository.js';

export interface IdempotencyContext {
  readonly apiKeyId: string;
  readonly key: string;
  readonly requestHash: string;
}

export interface ResponseWriter {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

interface Outcome {
  readonly status: number;
  readonly body: unknown;
  readonly replayed: boolean;
}

// Drizzle wraps driver errors in `cause`, so walk the chain looking for our unique violation.
function isIdempotencyConflict(error: unknown): boolean {
  for (let current = error; typeof current === 'object' && current !== null;) {
    if (
      'code' in current &&
      current.code === '23505' &&
      'constraint' in current &&
      current.constraint === IDEMPOTENCY_UNIQUE
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}

@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly database: DatabaseService,
    private readonly repository: IdempotencyRepository,
    private readonly lock: IdempotencyLock,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Runs `handler` at most once per (api key, Idempotency-Key). The handler receives the
   * transaction that also stores the idempotency record, so money never moves without a
   * record or the other way round. Only successful responses are stored; any error rolls back.
   */
  async respond<T>(
    res: ResponseWriter,
    ctx: IdempotencyContext,
    handler: (tx: Executor) => Promise<T>,
  ): Promise<unknown> {
    const { status, body, replayed } = await this.run(ctx, handler);
    res.status(status);
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return body;
  }

  private async run<T>(
    ctx: IdempotencyContext,
    handler: (tx: Executor) => Promise<T>,
  ): Promise<Outcome> {
    const { db } = this.database;
    const stored = await this.repository.find(db, ctx.apiKeyId, ctx.key);
    if (stored !== null) return this.replay(ctx, stored);

    const lock = await this.lock.acquire(ctx.apiKeyId, ctx.key, this.env.IDEMPOTENCY_LOCK_TTL_MS);
    try {
      // The lock may have been busy or expired while another request finished: look again.
      const finished = await this.repository.find(db, ctx.apiKeyId, ctx.key);
      if (finished !== null) return this.replay(ctx, finished);
      if (lock.status === 'busy') {
        throw new ApiError(
          409,
          'IDEMPOTENCY_REQUEST_IN_PROGRESS',
          'A request with this Idempotency-Key is still being processed',
        );
      }
      return await this.execute(ctx, handler);
    } finally {
      if (lock.status === 'acquired') {
        await this.lock.release(ctx.apiKeyId, ctx.key, lock.token);
      }
    }
  }

  private async execute<T>(
    ctx: IdempotencyContext,
    handler: (tx: Executor) => Promise<T>,
  ): Promise<Outcome> {
    try {
      const body = await this.database.db.transaction(async (tx) => {
        const result = await handler(tx);
        await this.repository.insert(tx, {
          apiKeyId: ctx.apiKeyId,
          key: ctx.key,
          requestHash: ctx.requestHash,
          status: HttpStatus.CREATED,
          body: result,
          expiresAt: new Date(Date.now() + this.env.IDEMPOTENCY_TTL_HOURS * 3_600_000),
        });
        return result;
      });
      return { status: HttpStatus.CREATED, body, replayed: false };
    } catch (error) {
      if (!isIdempotencyConflict(error)) throw error;
      // Lost a race (lock expired or Redis down): the transaction rolled back, serve the winner.
      const winner = await this.repository.find(this.database.db, ctx.apiKeyId, ctx.key);
      if (winner === null) throw error;
      return this.replay(ctx, winner);
    }
  }

  private replay(ctx: IdempotencyContext, stored: StoredResponse): Outcome {
    if (stored.requestHash !== ctx.requestHash) {
      throw new ApiError(
        422,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key was already used with a different request',
      );
    }
    this.metrics.idempotencyReplays.inc();
    return { status: stored.status, body: stored.body, replayed: true };
  }
}
