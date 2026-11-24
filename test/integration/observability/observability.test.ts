import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedRedisContainer } from '@testcontainers/redis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';
import { startPostgres } from '../support/postgres.js';
import { startRedis } from '../support/redis.js';

let pg: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let test: TestApp;

beforeAll(async () => {
  [pg, redis] = await Promise.all([startPostgres(), startRedis()]);
  test = await createTestApp(pg.getConnectionUri(), redis.getConnectionUrl());
});

afterAll(async () => {
  await test.app.close();
  await Promise.all([pg.stop(), redis.stop()]);
});

describe('correlation id', () => {
  it('echoes a valid incoming X-Request-Id and includes it in error bodies', async () => {
    const res = await request(test.url).get('/v1/accounts/x').set('X-Request-Id', 'req-123_ABC');
    expect(res.status).toBe(401);
    expect(res.headers['x-request-id']).toBe('req-123_ABC');
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED', requestId: 'req-123_ABC' } });
  });

  it('generates a UUID when the id is missing or invalid', async () => {
    const missing = await request(test.url).get('/health');
    expect(missing.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const invalid = await request(test.url).get('/health').set('X-Request-Id', 'bad id!');
    expect(invalid.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('GET /metrics', () => {
  it('exposes the request histogram with the route pattern', async () => {
    await request(test.url).get('/health');
    const res = await request(test.url).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toMatch(/route="\/health"/);
    expect(res.text).toContain('process_cpu_user_seconds_total');
  });
});
