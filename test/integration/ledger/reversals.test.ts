import { randomUUID } from 'node:crypto';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedRedisContainer } from '@testcontainers/redis';
import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { journalEntries } from '../../../src/infra/db/schema.js';
import { createApiKey, createTestApp, createWalletRow, type TestApp } from '../support/app.js';
import { startPostgres } from '../support/postgres.js';
import { startRedis } from '../support/redis.js';

const idBody = z.object({ id: z.uuid() });
const movedBody = z.object({ entryId: z.uuid() });
const accountBody = z.object({ balance: z.string() });
const trialBody = z.object({
  totals: z.object({ debits: z.string(), credits: z.string(), balanced: z.boolean() }),
});
const reconciliationBody = z.object({ mismatches: z.array(z.unknown()) });

let pg: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let test: TestApp;
let url: string;
let platform: string;
let ops: string;
let auditor: string;

const auth = (key: string) => ({ Authorization: `Bearer ${key}`, 'Idempotency-Key': randomUUID() });
const REASON = { reason: 'customer dispute' };

beforeAll(async () => {
  [pg, redis] = await Promise.all([startPostgres(), startRedis()]);
  test = await createTestApp(pg.getConnectionUri(), redis.getConnectionUrl());
  url = test.url;
  platform = await createApiKey(test.database, 'platform', 'plat-1');
  ops = await createApiKey(test.database, 'ops', 'ops');
  auditor = await createApiKey(test.database, 'auditor', 'auditor');
});

afterAll(async () => {
  await test.app.close();
  await pg.stop();
  await redis.stop();
});

const wallet = (owner: string): Promise<string> => createWalletRow(test.database, 'plat-1', owner);

async function fund(accountId: string, amount: string): Promise<void> {
  const res = await request(url)
    .post('/v1/fundings')
    .set(auth(platform))
    .send({ accountId, amount });
  expect(res.status).toBe(201);
}

async function transfer(from: string, to: string, owner: string, amount: string): Promise<string> {
  const key = await createApiKey(test.database, 'user', owner);
  const res = await request(url)
    .post('/v1/transfers')
    .set(auth(key))
    .send({ fromAccountId: from, toAccountId: to, amount });
  expect(res.status).toBe(201);
  return movedBody.parse(res.body).entryId;
}

const reverse = (entryId: string) =>
  request(url).post(`/v1/entries/${entryId}/reverse`).set(auth(ops)).send(REASON);

async function balance(id: string): Promise<string> {
  const res = await request(url).get(`/v1/accounts/${id}`).set(auth(ops));
  return accountBody.parse(res.body).balance;
}

async function requestPayout(accountId: string, owner: string, amount: string): Promise<string> {
  const key = await createApiKey(test.database, 'user', owner);
  const res = await request(url)
    .post('/v1/payouts')
    .set(auth(key))
    .send({ accountId, amount, destination: 'Banco Austral ****1234' });
  expect(res.status).toBe(201);
  return idBody.parse(res.body).id;
}

const failPayout = (id: string) =>
  request(url).post(`/v1/payouts/${id}/fail`).set(auth(ops)).send(REASON);

async function trialBalance(query = '') {
  const res = await request(url).get(`/v1/reports/trial-balance${query}`).set(auth(auditor));
  expect(res.status).toBe(200);
  return trialBody.parse(res.body);
}

describe('entry reversals', () => {
  it('reverses a transfer, restores balances and leaves the original untouched', async () => {
    const a = await wallet('rev-a');
    const b = await wallet('rev-b');
    await fund(a, '1000');
    const entryId = await transfer(a, b, 'rev-a', '400');
    expect([await balance(a), await balance(b)]).toEqual(['600', '400']);

    const res = await reverse(entryId);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'REVERSAL', reversalOf: entryId });
    expect([await balance(a), await balance(b)]).toEqual(['1000', '0']);

    const [original] = await test.database.db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, entryId));
    expect(original).toMatchObject({ kind: 'TRANSFER', reversalOf: null });
  });

  it('rejects a second reversal with 409 and a reversal of a reversal with 422', async () => {
    const a = await wallet('twice-a');
    const b = await wallet('twice-b');
    await fund(a, '500');
    const entryId = await transfer(a, b, 'twice-a', '100');
    const first = await reverse(entryId);
    expect(first.status).toBe(201);

    const second = await reverse(entryId);
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ error: { code: 'ENTRY_ALREADY_REVERSED' } });

    const nested = await reverse(idBody.parse(first.body).id);
    expect(nested.status).toBe(422);
    expect(nested.body).toMatchObject({ error: { code: 'CANNOT_REVERSE_REVERSAL' } });
  });

  it('answers 422 and writes nothing when the reversal would overdraw a wallet', async () => {
    const a = await wallet('spent-a');
    const b = await wallet('spent-b');
    const c = await wallet('spent-c');
    await fund(a, '1000');
    const entryId = await transfer(a, b, 'spent-a', '400');
    await transfer(b, c, 'spent-b', '400');

    const res = await reverse(entryId);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { code: 'INSUFFICIENT_FUNDS' } });
    expect([await balance(a), await balance(b), await balance(c)]).toEqual(['600', '0', '400']);
    const [reversals] = await test.database.db
      .select({ total: count() })
      .from(journalEntries)
      .where(eq(journalEntries.reversalOf, entryId));
    expect(reversals?.total).toBe(0);
  });

  it('applies exactly one of 10 concurrent reversals', async () => {
    const a = await wallet('conc-a');
    const b = await wallet('conc-b');
    await fund(a, '1000');
    const entryId = await transfer(a, b, 'conc-a', '300');

    const results = await Promise.all(Array.from({ length: 10 }, () => reverse(entryId)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect([await balance(a), await balance(b)]).toEqual(['1000', '0']);
  });

  it('requires the ops scope and a valid reason', async () => {
    const id = randomUUID();
    const user = await createApiKey(test.database, 'user', 'someone');
    for (const key of [user, platform, auditor]) {
      const res = await request(url).post(`/v1/entries/${id}/reverse`).set(auth(key)).send(REASON);
      expect(res.status).toBe(403);
    }
    const bad = await request(url).post(`/v1/entries/${id}/reverse`).set(auth(ops)).send({});
    expect(bad.status).toBe(400);
    expect((await reverse(id)).status).toBe(404);
  });
});

describe('payout failure', () => {
  it('returns the money to the wallet and refuses paid payouts', async () => {
    const a = await wallet('pay-a');
    await fund(a, '1000');
    const failing = await requestPayout(a, 'pay-a', '300');
    expect(await balance(a)).toBe('700');

    const failed = await failPayout(failing);
    expect(failed.status).toBe(201);
    expect(failed.body).toMatchObject({ status: 'failed' });
    expect(await balance(a)).toBe('1000');

    const again = await failPayout(failing);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: { code: 'PAYOUT_NOT_REQUESTED' } });

    const paying = await requestPayout(a, 'pay-a', '200');
    const settled = await request(url).post(`/v1/payouts/${paying}/settle`).set(auth(ops));
    expect(settled.status).toBe(201);
    const paid = await failPayout(paying);
    expect(paid.status).toBe(409);
    expect(paid.body).toMatchObject({ error: { code: 'PAYOUT_NOT_REQUESTED' } });
  });

  it('sends payout entries to the payout endpoint instead of /reverse', async () => {
    const a = await wallet('pay-b');
    await fund(a, '100');
    await requestPayout(a, 'pay-b', '50');
    const [requestEntry] = await test.database.db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(eq(journalEntries.kind, 'PAYOUT_REQUEST'))
      .limit(1);
    const res = await reverse(z.string().parse(requestEntry?.id));
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { code: 'USE_PAYOUT_FAIL' } });
  });
});

describe('reports', () => {
  it('stays balanced and reconciled after a mix of operations', async () => {
    const a = await wallet('mix-a');
    const b = await wallet('mix-b');
    await fund(a, '5000');
    await fund(b, '2000');
    const moved = await transfer(a, b, 'mix-a', '1500');
    const settling = await requestPayout(b, 'mix-b', '700');
    await request(url).post(`/v1/payouts/${settling}/settle`).set(auth(ops));
    const failing = await requestPayout(a, 'mix-a', '300');
    expect((await failPayout(failing)).status).toBe(201);
    expect((await reverse(moved)).status).toBe(201);

    const report = await trialBalance();
    expect(report.totals.balanced).toBe(true);
    expect(report.totals.debits).toBe(report.totals.credits);
    const reconciliation = await request(url).get('/v1/reports/reconciliation').set(auth(ops));
    expect(reconciliation.status).toBe(200);
    expect(reconciliationBody.parse(reconciliation.body).mismatches).toEqual([]);
  });

  it('excludes entries created after asOf', async () => {
    const a = await wallet('asof-a');
    const before = await trialBalance();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const cutoff = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fund(a, '777');

    const past = await trialBalance(`?asOf=${encodeURIComponent(cutoff)}`);
    expect(past.totals.debits).toBe(before.totals.debits);
    const now = await trialBalance();
    expect(BigInt(now.totals.debits) - BigInt(before.totals.debits)).toBe(777n);
    const invalid = await request(url)
      .get('/v1/reports/trial-balance?asOf=yesterday')
      .set(auth(ops));
    expect(invalid.status).toBe(400);
  });

  it('is readable by ops and auditor only', async () => {
    const user = await createApiKey(test.database, 'user', 'nobody');
    for (const key of [user, platform]) {
      for (const path of ['trial-balance', 'reconciliation']) {
        expect((await request(url).get(`/v1/reports/${path}`).set(auth(key))).status).toBe(403);
      }
    }
    expect((await request(url).get('/v1/reports/trial-balance').set(auth(ops))).status).toBe(200);
  });
});
