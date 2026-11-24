import { randomUUID } from 'node:crypto';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedRedisContainer } from '@testcontainers/redis';
import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idempotencyRecords, postings } from '../../../src/infra/db/schema.js';
import { IdempotencyRepository } from '../../../src/modules/idempotency/idempotency.repository.js';
import {
  bearer,
  createApiKey,
  createTestApp,
  createWalletRow,
  type TestApp,
} from '../support/app.js';
import { startPostgres } from '../support/postgres.js';
import { startRedis } from '../support/redis.js';

let pg: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let main: TestApp;
// Same database, but Redis is unreachable: the lock fails open and only PostgreSQL protects.
let noRedis: TestApp;

const LIMITS = { RATE_LIMIT_POST_MAX: '1000', RATE_LIMIT_MAX: '1000' };

beforeAll(async () => {
  [pg, redis] = await Promise.all([startPostgres(), startRedis()]);
  main = await createTestApp(pg.getConnectionUri(), redis.getConnectionUrl(), LIMITS);
  noRedis = await createTestApp(pg.getConnectionUri(), 'redis://127.0.0.1:1', LIMITS);
});

afterAll(async () => {
  await Promise.all([main.app.close(), noRedis.app.close()]);
  await Promise.all([pg.stop(), redis.stop()]);
});

async function postingCount(walletId: string): Promise<number> {
  const [row] = await main.database.db
    .select({ n: count() })
    .from(postings)
    .where(eq(postings.accountId, walletId));
  return row?.n ?? 0;
}

async function setup(platformRef: string) {
  const platform = await createApiKey(main.database, 'platform', platformRef);
  const wallet = await createWalletRow(main.database, platformRef, `owner-${platformRef}`);
  return { platform, wallet };
}

const fund = (app: TestApp, platform: string, key: string, accountId: string, amount = '1000') =>
  request(app.url)
    .post('/v1/fundings')
    .set(bearer(platform))
    .set('Idempotency-Key', key)
    .send({ accountId, amount });

describe('Idempotency-Key', () => {
  it('requires a valid header on money endpoints', async () => {
    const { platform, wallet } = await setup('plat-header');
    const res = await request(main.url)
      .post('/v1/fundings')
      .set(bearer(platform))
      .send({ accountId: wallet, amount: '10' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
  });

  it('replays the stored response for the same key and body, posting a single entry', async () => {
    const { platform, wallet } = await setup('plat-replay');
    const key = randomUUID();
    const first = await fund(main, platform, key, wallet);
    // Reordered keys are the same request.
    const second = await request(main.url)
      .post('/v1/fundings')
      .set(bearer(platform))
      .set('Idempotency-Key', key)
      .send({ amount: '1000', accountId: wallet });
    expect(first.status).toBe(201);
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(await postingCount(wallet)).toBe(1);
  });

  it('answers 422 when the key is reused with a different body', async () => {
    const { platform, wallet } = await setup('plat-reuse');
    const key = randomUUID();
    expect((await fund(main, platform, key, wallet, '100')).status).toBe(201);
    const reused = await fund(main, platform, key, wallet, '200');
    expect(reused.status).toBe(422);
    expect(reused.body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(await postingCount(wallet)).toBe(1);
  });

  it('does not collide across API keys', async () => {
    const a = await setup('plat-iso-a');
    const b = await setup('plat-iso-b');
    const key = randomUUID();
    const [resA, resB] = await Promise.all([
      fund(main, a.platform, key, a.wallet),
      fund(main, b.platform, key, b.wallet),
    ]);
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.headers['idempotent-replayed']).toBeUndefined();
    expect(resB.headers['idempotent-replayed']).toBeUndefined();
    expect(await postingCount(a.wallet)).toBe(1);
    expect(await postingCount(b.wallet)).toBe(1);
  });

  it('stores nothing when the handler fails, so a retry with funds succeeds', async () => {
    const { platform, wallet } = await setup('plat-atomic');
    const peer = await createWalletRow(main.database, 'plat-atomic', 'peer');
    const key = randomUUID();
    const transfer = () =>
      request(main.url)
        .post('/v1/transfers')
        .set(bearer(platform))
        .set('Idempotency-Key', key)
        .send({ fromAccountId: wallet, toAccountId: peer, amount: '100' });

    const failed = await transfer();
    expect(failed.status).toBe(422);
    expect(failed.body).toMatchObject({ error: { code: 'INSUFFICIENT_FUNDS' } });
    const [records] = await main.database.db
      .select({ n: count() })
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.idemKey, key));
    expect(records?.n).toBe(0);

    expect((await fund(main, platform, randomUUID(), wallet, '500')).status).toBe(201);
    const retried = await transfer();
    expect(retried.status).toBe(201);
    expect(retried.headers['idempotent-replayed']).toBeUndefined();
  });

  it('never double-charges 20 concurrent requests with the same key', async () => {
    const { platform, wallet } = await setup('plat-race');
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => fund(main, platform, key, wallet)),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
    const created = responses.filter((r) => r.status === 201);
    expect(created.length).toBeGreaterThanOrEqual(1);
    for (const response of created) expect(response.body).toEqual(created[0]?.body);
    for (const conflict of responses.filter((r) => r.status === 409)) {
      expect(conflict.body).toMatchObject({ error: { code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' } });
    }
    expect(await postingCount(wallet)).toBe(1);
  });

  it('still posts once when Redis is down and requests race on the unique constraint', async () => {
    const { platform, wallet } = await setup('plat-noredis');
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => fund(noRedis, platform, key, wallet)),
    );
    expect(responses.every((r) => r.status === 201)).toBe(true);
    for (const response of responses) expect(response.body).toEqual(responses[0]?.body);
    expect(await postingCount(wallet)).toBe(1);
  });

  it('removes only expired records on cleanup', async () => {
    const { platform, wallet } = await setup('plat-cleanup');
    const key = randomUUID();
    expect((await fund(main, platform, key, wallet)).status).toBe(201);
    const repository = new IdempotencyRepository();
    expect(await repository.deleteExpired(main.database.db)).toBe(0);

    const expire = () =>
      main.database.db
        .update(idempotencyRecords)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(idempotencyRecords.idemKey, key));
    await expire();
    // An expired record no longer replays: the same key runs again.
    const again = await fund(main, platform, key, wallet);
    expect(again.status).toBe(201);
    expect(again.headers['idempotent-replayed']).toBeUndefined();
    expect(await postingCount(wallet)).toBe(2);

    await expire();
    expect(await repository.deleteExpired(main.database.db)).toBe(1);
  });
});
