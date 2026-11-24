import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module.js';
import { setupOpenApi } from '../../../src/common/openapi.js';
import { ENV } from '../../../src/config/config.module.js';
import { parseEnv } from '../../../src/config/env.js';
import { type ApiScope, generateApiKey, hashApiKey } from '../../../src/domain/auth/api-key.js';
import { DatabaseService } from '../../../src/infra/db/database.module.js';
import { apiKeys } from '../../../src/infra/db/schema.js';
import { startPostgres, TEST_PEPPER } from '../support/postgres.js';

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let url: string;
let database: DatabaseService;

async function createKey(scope: ApiScope, subjectRef: string): Promise<string> {
  const { key, prefix } = generateApiKey(scope);
  await database.db
    .insert(apiKeys)
    .values({ prefix, keyHash: hashApiKey(key, TEST_PEPPER), scope, subjectRef });
  return key;
}

const idSchema = z.object({ id: z.uuid() });
const pageSchema = z.object({
  items: z.array(z.object({ amount: z.string() })),
  nextCursor: z.string().nullable(),
});
const specSchema = z.object({
  components: z.object({ securitySchemes: z.record(z.string(), z.unknown()) }),
  paths: z.record(
    z.string(),
    z.object({ post: z.object({ requestBody: z.unknown().optional() }).optional() }),
  ),
});

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

beforeAll(async () => {
  container = await startPostgres();
  const env = parseEnv({
    DATABASE_URL: container.getConnectionUri(),
    REDIS_URL: 'redis://unused',
    API_KEY_PEPPER: TEST_PEPPER,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(env)
    .compile();
  app = moduleRef.createNestApplication();
  setupOpenApi(app);
  await app.listen(0);
  url = await app.getUrl();
  database = app.get(DatabaseService);
});

afterAll(async () => {
  await app.close();
  await container.stop();
});

async function createWallet(platformKey: string, ownerRef: string): Promise<string> {
  const res = await request(url).post('/v1/accounts').set(bearer(platformKey)).send({ ownerRef });
  expect(res.status).toBe(201);
  return idSchema.parse(res.body).id;
}

describe('authentication and scopes', () => {
  it('answers 401 without a key, with a malformed key, with an unknown key and with a revoked key', async () => {
    const revoked = await createKey('platform', 'plat-x');
    await database.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.keyHash, hashApiKey(revoked, TEST_PEPPER)));
    const unknown = generateApiKey('platform').key;

    for (const headers of [{}, bearer('garbage'), bearer(unknown), bearer(revoked)]) {
      const res = await request(url).post('/v1/accounts').set(headers).send({ ownerRef: 'u' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid API key' },
      });
    }
  });

  it('answers 403 when the scope does not match', async () => {
    const user = await createKey('user', 'user-1');
    const platform = await createKey('platform', 'plat-1');
    const create = await request(url)
      .post('/v1/accounts')
      .set(bearer(user))
      .send({ ownerRef: 'u' });
    expect(create.status).toBe(403);
    const settle = await request(url)
      .post('/v1/payouts/6f1f5b0e-0000-4000-8000-000000000000/settle')
      .set(bearer(platform));
    expect(settle.status).toBe(403);
  });

  it('keeps /health public and validates input with a uniform error body', async () => {
    expect((await request(url).get('/health')).status).toBe(200);
    const platform = await createKey('platform', 'plat-1');
    const res = await request(url).post('/v1/accounts').set(bearer(platform)).send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('BOLA, transfers and payouts', () => {
  it('hides other users and platforms behind 404 and runs the payout flow', async () => {
    const platform = await createKey('platform', 'plat-A');
    const otherPlatform = await createKey('platform', 'plat-B');
    const ops = await createKey('ops', 'ops');
    const auditor = await createKey('auditor', 'auditor');
    const userA = await createKey('user', 'user-A');
    const userB = await createKey('user', 'user-B');
    const walletA = await createWallet(platform, 'user-A');
    const walletB = await createWallet(platform, 'user-B');
    const foreignWallet = await createWallet(otherPlatform, 'user-Z');

    const fund = await request(url)
      .post('/v1/fundings')
      .set(bearer(platform))
      .send({ accountId: walletA, amount: '1000' });
    expect(fund.status).toBe(201);
    expect(
      (
        await request(url)
          .post('/v1/fundings')
          .set(bearer(otherPlatform))
          .send({ accountId: walletA, amount: '5' })
      ).status,
    ).toBe(404);

    // Reads: own account, someone else's, other platform, ops and auditor.
    const own = await request(url).get(`/v1/accounts/${walletA}`).set(bearer(userA));
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ id: walletA, balance: '1000', platformRef: 'plat-A' });
    expect((await request(url).get(`/v1/accounts/${walletA}`).set(bearer(userB))).status).toBe(404);
    expect(
      (await request(url).get(`/v1/accounts/${walletA}/postings`).set(bearer(userB))).status,
    ).toBe(404);
    expect(
      (await request(url).get(`/v1/accounts/${walletA}`).set(bearer(otherPlatform))).status,
    ).toBe(404);
    expect((await request(url).get(`/v1/accounts/${walletA}`).set(bearer(ops))).status).toBe(200);
    expect((await request(url).get(`/v1/accounts/${walletA}`).set(bearer(auditor))).status).toBe(
      200,
    );

    // Transfers: B cannot move A's money, A cannot reach another platform, overdraft is 422.
    const steal = await request(url)
      .post('/v1/transfers')
      .set(bearer(userB))
      .send({ fromAccountId: walletA, toAccountId: walletB, amount: '10' });
    expect(steal.status).toBe(404);
    const crossPlatform = await request(url)
      .post('/v1/transfers')
      .set(bearer(userA))
      .send({ fromAccountId: walletA, toAccountId: foreignWallet, amount: '10' });
    expect(crossPlatform.status).toBe(404);
    const overdraft = await request(url)
      .post('/v1/transfers')
      .set(bearer(userA))
      .send({ fromAccountId: walletA, toAccountId: walletB, amount: '5000' });
    expect(overdraft.status).toBe(422);
    expect(overdraft.body).toMatchObject({ error: { code: 'INSUFFICIENT_FUNDS' } });
    const auditorMove = await request(url)
      .post('/v1/transfers')
      .set(bearer(auditor))
      .send({ fromAccountId: walletA, toAccountId: walletB, amount: '1' });
    expect(auditorMove.status).toBe(403);
    const ok = await request(url)
      .post('/v1/transfers')
      .set(bearer(userA))
      .send({ fromAccountId: walletA, toAccountId: walletB, amount: '200', description: 'rent' });
    expect(ok.status).toBe(201);
    const bAfter = await request(url).get(`/v1/accounts/${walletB}`).set(bearer(userB));
    expect(bAfter.body).toMatchObject({ balance: '200' });

    // Postings pagination, newest first.
    const page1 = await request(url)
      .get(`/v1/accounts/${walletA}/postings?limit=1`)
      .set(bearer(userA));
    const body1 = pageSchema.parse(page1.body);
    expect(body1.items.map((p) => p.amount)).toEqual(['200']);
    const page2 = await request(url)
      .get(`/v1/accounts/${walletA}/postings?limit=1&cursor=${body1.nextCursor ?? ''}`)
      .set(bearer(userA));
    const body2 = pageSchema.parse(page2.body);
    expect(body2.items.map((p) => p.amount)).toEqual(['-1000']);
    expect(body2.nextCursor).toBeNull();

    // Payout: requested -> settle.
    const payoutReq = await request(url)
      .post('/v1/payouts')
      .set(bearer(userA))
      .send({ accountId: walletA, amount: '300', destination: 'Banco Austral ****1234' });
    expect(payoutReq.status).toBe(201);
    const payout = idSchema.parse(payoutReq.body);
    expect(payoutReq.body).toMatchObject({ status: 'requested' });
    expect(
      (await request(url).get(`/v1/accounts/${walletA}`).set(bearer(userA))).body,
    ).toMatchObject({ balance: '500' });
    expect((await request(url).get(`/v1/payouts/${payout.id}`).set(bearer(userB))).status).toBe(
      404,
    );
    expect((await request(url).get(`/v1/payouts/${payout.id}`).set(bearer(userA))).status).toBe(
      200,
    );
    expect(
      (
        await request(url)
          .post('/v1/payouts')
          .set(bearer(userB))
          .send({ accountId: walletA, amount: '1', destination: 'x' })
      ).status,
    ).toBe(404);
    expect(
      (await request(url).post(`/v1/payouts/${payout.id}/settle`).set(bearer(userA))).status,
    ).toBe(403);

    const settled = await request(url).post(`/v1/payouts/${payout.id}/settle`).set(bearer(ops));
    expect(settled.status).toBe(201);
    expect(settled.body).toMatchObject({ id: payout.id, status: 'paid', amount: '300' });
    const again = await request(url).post(`/v1/payouts/${payout.id}/settle`).set(bearer(ops));
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: { code: 'PAYOUT_NOT_REQUESTED' } });

    const tooMuch = await request(url)
      .post('/v1/payouts')
      .set(bearer(userA))
      .send({ accountId: walletA, amount: '501', destination: 'Banco Austral ****1234' });
    expect(tooMuch.status).toBe(422);
  });
});

describe('OpenAPI', () => {
  it('serves the spec with bearer auth and zod-derived request bodies', async () => {
    const res = await request(url).get('/docs-json');
    expect(res.status).toBe(200);
    const spec = specSchema.parse(res.body);
    expect(spec.components.securitySchemes).toHaveProperty('bearer');
    expect(JSON.stringify(spec.paths['/v1/transfers']?.post?.requestBody)).toContain(
      'fromAccountId',
    );
    expect(spec.paths).toHaveProperty('/v1/payouts/{id}/settle');
  });
});
