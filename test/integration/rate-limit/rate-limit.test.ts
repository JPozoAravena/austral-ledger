import { randomUUID } from 'node:crypto';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedRedisContainer } from '@testcontainers/redis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
let test: TestApp;

beforeAll(async () => {
  [pg, redis] = await Promise.all([startPostgres(), startRedis()]);
  test = await createTestApp(pg.getConnectionUri(), redis.getConnectionUrl(), {
    RATE_LIMIT_MAX: '3',
    RATE_LIMIT_POST_MAX: '2',
    RATE_LIMIT_WINDOW_SECONDS: '60',
  });
});

afterAll(async () => {
  await test.app.close();
  await Promise.all([pg.stop(), redis.stop()]);
});

describe('rate limiting', () => {
  it('answers 429 after the limit with headers, per API key, and exempts health and metrics', async () => {
    const key = await createApiKey(test.database, 'platform', 'plat-rl');
    const wallet = await createWalletRow(test.database, 'plat-rl', 'o');
    const get = () => request(test.url).get(`/v1/accounts/${wallet}`).set(bearer(key));

    for (const remaining of [2, 1, 0]) {
      const res = await get();
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe('3');
      expect(res.headers['ratelimit-remaining']).toBe(String(remaining));
      expect(Number(res.headers['ratelimit-reset'])).toBeGreaterThan(0);
    }
    const limited = await get();
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(limited.headers['ratelimit-remaining']).toBe('0');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

    // Another key has its own budget.
    const other = await createApiKey(test.database, 'platform', 'plat-rl-2');
    expect(
      (await request(test.url).get(`/v1/accounts/${wallet}`).set(bearer(other))).status,
    ).not.toBe(429);

    for (let i = 0; i < 6; i += 1) {
      expect((await request(test.url).get('/health')).status).toBe(200);
      expect((await request(test.url).get('/metrics')).status).toBe(200);
    }
    const metrics = await request(test.url).get('/metrics');
    expect(metrics.text).toMatch(/^rate_limited_total 1$/m);
  });

  it('applies the stricter limit to POST requests', async () => {
    const key = await createApiKey(test.database, 'platform', 'plat-rl-post');
    const wallet = await createWalletRow(test.database, 'plat-rl-post', 'o');
    const post = () =>
      request(test.url)
        .post('/v1/fundings')
        .set(bearer(key))
        .set('Idempotency-Key', randomUUID())
        .send({ accountId: wallet, amount: '10' });

    expect((await post()).headers['ratelimit-limit']).toBe('2');
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429);
  });
});
