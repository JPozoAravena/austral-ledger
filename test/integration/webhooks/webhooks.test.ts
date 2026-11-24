import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedRedisContainer } from '@testcontainers/redis';
import { Test, type TestingModule } from '@nestjs/testing';
import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ENV } from '../../../src/config/config.module.js';
import { parseEnv } from '../../../src/config/env.js';
import { sign, verify } from '../../../src/domain/webhooks/signature.js';
import { outboxEvents, webhookDeliveries } from '../../../src/infra/db/schema.js';
import { WorkerModule } from '../../../src/worker.module.js';
import { createApiKey, createTestApp, createWalletRow, type TestApp } from '../support/app.js';
import { startPostgres, TEST_PEPPER, TEST_WEBHOOK_KEY } from '../support/postgres.js';
import { startRedis } from '../support/redis.js';

const run = promisify(execFile);
const scriptFailure = z.object({ code: z.number(), stderr: z.string() });
const createdBody = z.object({ id: z.string(), secret: z.string() });
const listBody = z.object({ items: z.array(z.object({ id: z.string(), active: z.boolean() })) });
const eventBody = z.object({
  id: z.string(),
  type: z.string(),
  data: z.record(z.string(), z.string()),
});
const SCRIPT = join(process.cwd(), 'scripts', 'verify-webhook-signature.mjs');
const MAX_ATTEMPTS = 3;

interface Received {
  readonly path: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

let pg: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let test: TestApp;
const workers: TestingModule[] = [];
let receiver: Server;
let receiverUrl: string;
const received: Received[] = [];
// Status the receiver answers for a path, given how many requests that path has seen.
const behaviors = new Map<string, (hit: number) => number>();

const idem = (key: string) => ({
  Authorization: `Bearer ${key}`,
  'Idempotency-Key': randomUUID(),
});
const auth = (key: string) => ({ Authorization: `Bearer ${key}` });

async function startWorker(): Promise<void> {
  const env = parseEnv({
    DATABASE_URL: pg.getConnectionUri(),
    REDIS_URL: redis.getConnectionUrl(),
    API_KEY_PEPPER: TEST_PEPPER,
    WEBHOOK_SECRET_KEY: TEST_WEBHOOK_KEY,
    WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true',
    OUTBOX_POLL_MS: '100',
    WEBHOOK_MAX_ATTEMPTS: String(MAX_ATTEMPTS),
    WEBHOOK_BACKOFF_MS: '50',
    LOG_LEVEL: 'silent',
  });
  const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
    .overrideProvider(ENV)
    .useValue(env)
    .compile();
  await moduleRef.init();
  workers.push(moduleRef);
}

beforeAll(async () => {
  [pg, redis] = await Promise.all([startPostgres(), startRedis()]);
  test = await createTestApp(pg.getConnectionUri(), redis.getConnectionUrl(), {
    WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true',
  });
  receiver = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    req.on('end', () => {
      const path = req.url ?? '';
      received.push({ path, headers: req.headers, body });
      const hit = received.filter((r) => r.path === path).length;
      const behavior = behaviors.get(path);
      res.writeHead(behavior === undefined ? 200 : behavior(hit)).end();
    });
  });
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  const address = receiver.address();
  if (address === null || typeof address === 'string') throw new Error('receiver has no port');
  receiverUrl = `http://127.0.0.1:${address.port}`;
  await startWorker();
});

afterAll(async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  await test.app.close();
  await new Promise((resolve) => receiver.close(resolve));
  await Promise.all([pg.stop(), redis.stop()]);
});

interface Platform {
  readonly key: string;
  readonly ref: string;
  readonly endpointId: string;
  readonly secret: string;
  readonly path: string;
}

async function setupPlatform(path: string): Promise<Platform> {
  const ref = `plat-${randomUUID()}`;
  const key = await createApiKey(test.database, 'platform', ref);
  const res = await request(test.url)
    .post('/v1/webhook-endpoints')
    .set(auth(key))
    .send({ url: `${receiverUrl}${path}` });
  expect(res.status).toBe(201);
  const created = createdBody.parse(res.body);
  return { key, ref, endpointId: created.id, secret: created.secret, path };
}

async function fund(platform: Platform, amount: string): Promise<string> {
  const wallet = await createWalletRow(test.database, platform.ref, 'owner');
  const res = await request(test.url)
    .post('/v1/fundings')
    .set(idem(platform.key))
    .send({ accountId: wallet, amount });
  expect(res.status).toBe(201);
  return wallet;
}

const eventCount = async (ref: string): Promise<number> => {
  const [row] = await test.database.db
    .select({ n: count() })
    .from(outboxEvents)
    .where(eq(outboxEvents.platformRef, ref));
  return row?.n ?? 0;
};

const deliveriesOf = (endpointId: string) =>
  test.database.db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.endpointId, endpointId));

describe('transactional outbox', () => {
  it('records one event per transfer and none when the transfer fails', async () => {
    const platform = await setupPlatform('/outbox');
    const from = await fund(platform, '1000');
    const to = await createWalletRow(test.database, platform.ref, 'other');
    expect(await eventCount(platform.ref)).toBe(1);

    const ok = await request(test.url)
      .post('/v1/transfers')
      .set(idem(platform.key))
      .send({ fromAccountId: from, toAccountId: to, amount: '100' });
    expect(ok.status).toBe(201);
    expect(await eventCount(platform.ref)).toBe(2);

    const rejected = await request(test.url)
      .post('/v1/transfers')
      .set(idem(platform.key))
      .send({ fromAccountId: from, toAccountId: to, amount: '5000' });
    expect(rejected.status).toBe(422);
    expect(rejected.body).toMatchObject({ error: { code: 'INSUFFICIENT_FUNDS' } });
    expect(await eventCount(platform.ref)).toBe(2);
  });
});

describe('delivery', () => {
  it('delivers signed events that the domain verifier accepts', async () => {
    const platform = await setupPlatform('/ok');
    const from = await fund(platform, '1000');
    const to = await createWalletRow(test.database, platform.ref, 'other');
    await request(test.url)
      .post('/v1/transfers')
      .set(idem(platform.key))
      .send({ fromAccountId: from, toAccountId: to, amount: '100' })
      .expect(201);

    await vi.waitFor(
      async () => {
        const rows = await deliveriesOf(platform.endpointId);
        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row.status === 'delivered')).toBe(true);
      },
      { timeout: 15_000, interval: 100 },
    );

    const mine = received.filter((r) => r.path === platform.path);
    expect(mine).toHaveLength(2);
    for (const hit of mine) {
      const header = String(hit.headers['austral-signature']);
      expect(() =>
        verify(header, platform.secret, hit.body, Math.floor(Date.now() / 1000)),
      ).not.toThrow();
      expect(hit.headers['user-agent']).toBe('AustralLedger-Webhooks/1');
      expect(hit.headers['austral-event-id']).toBe(eventBody.parse(JSON.parse(hit.body)).id);
    }
    const transfer = mine
      .map((hit) => eventBody.parse(JSON.parse(hit.body)))
      .find((b) => b.type === 'transfer.completed');
    expect(transfer).toMatchObject({
      data: { fromAccountId: from, toAccountId: to, amount: '100' },
    });
    expect(mine.map((hit) => hit.headers['austral-event-type']).sort()).toEqual([
      'funding.completed',
      'transfer.completed',
    ]);
  });

  it('retries with backoff until the receiver answers 2xx', async () => {
    const platform = await setupPlatform('/flaky');
    behaviors.set(platform.path, (hit) => (hit <= 2 ? 500 : 200));
    await fund(platform, '1000');

    await vi.waitFor(
      async () => {
        const [row] = await deliveriesOf(platform.endpointId);
        expect(row).toMatchObject({ status: 'delivered', attempts: 3, lastStatusCode: 200 });
      },
      { timeout: 15_000, interval: 100 },
    );
    expect(received.filter((r) => r.path === platform.path)).toHaveLength(3);
  });

  it('marks the delivery failed once attempts are exhausted', async () => {
    const platform = await setupPlatform('/down');
    behaviors.set(platform.path, () => 500);
    await fund(platform, '1000');

    await vi.waitFor(
      async () => {
        const [row] = await deliveriesOf(platform.endpointId);
        expect(row).toMatchObject({
          status: 'failed',
          attempts: MAX_ATTEMPTS,
          lastStatusCode: 500,
          lastError: 'HTTP_500',
        });
      },
      { timeout: 15_000, interval: 100 },
    );
    expect(received.filter((r) => r.path === platform.path)).toHaveLength(MAX_ATTEMPTS);
  });

  it('creates no duplicate deliveries with concurrent relays', async () => {
    await startWorker();
    const platform = await setupPlatform('/race');
    const total = 40;
    await test.database.db.insert(outboxEvents).values(
      Array.from({ length: total }, () => ({
        eventType: 'funding.completed',
        aggregateId: randomUUID(),
        platformRef: platform.ref,
        payload: { amount: '1' },
      })),
    );

    await vi.waitFor(
      async () => {
        const rows = await deliveriesOf(platform.endpointId);
        expect(rows).toHaveLength(total);
        expect(rows.every((row) => row.status === 'delivered')).toBe(true);
      },
      { timeout: 20_000, interval: 100 },
    );
    const ids = received
      .filter((r) => r.path === platform.path)
      .map((r) => r.headers['austral-event-id']);
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
  });
});

describe('verification script', () => {
  it('exits 0 for a valid signature and 1 for an invalid one', async () => {
    const body = '{"id":"evt","data":{"amount":"1"}}';
    const header = sign('whsec_script', Math.floor(Date.now() / 1000), body);
    const verify = (secret: string, h: string) => {
      const pending = run(process.execPath, [SCRIPT, '--secret', secret, '--header', h]);
      pending.child.stdin?.end(body);
      return pending;
    };

    expect((await verify('whsec_script', header)).stdout.trim()).toBe('valid');
    const failure = await verify('whsec_other', header).catch((error: unknown) =>
      scriptFailure.parse(error),
    );
    expect(failure).toMatchObject({ code: 1 });
    expect(failure.stderr.trim()).toBe('invalid: signature mismatch');
    await expect(verify('whsec_script', 'nope')).rejects.toMatchObject({ code: 1 });
  });
});

describe('endpoint API', () => {
  it('hides and protects endpoints across platforms (BOLA) and only deactivates', async () => {
    const a = await setupPlatform('/bola-a');
    const b = await setupPlatform('/bola-b');

    const listB = await request(test.url).get('/v1/webhook-endpoints').set(auth(b.key));
    expect(listB.status).toBe(200);
    expect(listBody.parse(listB.body).items.map((item) => item.id)).toEqual([b.endpointId]);
    expect(JSON.stringify(listB.body)).not.toContain('secret');

    await request(test.url)
      .delete(`/v1/webhook-endpoints/${a.endpointId}`)
      .set(auth(b.key))
      .expect(404);
    const stillActive = await request(test.url).get('/v1/webhook-endpoints').set(auth(a.key));
    expect(listBody.parse(stillActive.body).items[0]).toMatchObject({
      id: a.endpointId,
      active: true,
    });

    await request(test.url)
      .delete(`/v1/webhook-endpoints/${a.endpointId}`)
      .set(auth(a.key))
      .expect(204);
    const after = await request(test.url).get('/v1/webhook-endpoints').set(auth(a.key));
    expect(listBody.parse(after.body).items[0]).toMatchObject({ id: a.endpointId, active: false });
  });

  it('rejects invalid URLs and non-platform keys', async () => {
    const platform = await setupPlatform('/validation');
    const bad = await request(test.url)
      .post('/v1/webhook-endpoints')
      .set(auth(platform.key))
      .send({ url: 'not a url' });
    expect(bad.status).toBe(422);
    expect(bad.body).toMatchObject({ error: { code: 'INVALID_WEBHOOK_URL' } });

    const userKey = await createApiKey(test.database, 'user', 'someone');
    await request(test.url).get('/v1/webhook-endpoints').set(auth(userKey)).expect(403);
  });
});
