import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../../../src/infra/db/client.js';
import { accounts, journalEntries, postings } from '../../../src/infra/db/schema.js';

let container: StartedPostgreSqlContainer;
let client: DbClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18.7-alpine').start();
  client = createDbClient({ DATABASE_URL: container.getConnectionUri() });
  await migrate(client.db, { migrationsFolder: join(process.cwd(), 'src/infra/db/migrations') });
});

afterAll(async () => {
  await client.pool.end();
  await container.stop();
});

async function createAccounts() {
  const [a, b] = await client.db
    .insert(accounts)
    .values([{ type: 'PLATFORM_FUNDING' }, { type: 'USER_WALLET' }])
    .returning({ id: accounts.id });
  if (!a || !b) throw new Error('accounts not created');
  return { a: a.id, b: b.id };
}

async function insertEntry(amounts: readonly [bigint, bigint]) {
  const { a, b } = await createAccounts();
  return client.db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(journalEntries)
      .values({ kind: 'TEST', description: 'test' })
      .returning({ id: journalEntries.id });
    if (!entry) throw new Error('entry not created');
    await tx.insert(postings).values([
      { entryId: entry.id, accountId: a, amount: amounts[0] },
      { entryId: entry.id, accountId: b, amount: amounts[1] },
    ]);
    return entry.id;
  });
}

// Drizzle wraps driver errors in `cause`; raw pool errors carry the SQLSTATE directly.
async function expectSqlState(promise: PromiseLike<unknown>, code: string): Promise<void> {
  const error: unknown = await Promise.resolve(promise).then(
    () => null,
    (e: unknown) => e,
  );
  const source = error instanceof Error && error.cause ? error.cause : error;
  expect(source).toMatchObject({ code });
}

describe('ledger constraints', () => {
  it('rejects an unbalanced entry at commit', async () => {
    await expectSqlState(insertEntry([100n, -90n]), 'AL001');
  });

  it('accepts a balanced entry', async () => {
    const id = await insertEntry([100n, -100n]);
    const rows = await client.db.select().from(postings).where(eq(postings.entryId, id));
    expect(rows).toHaveLength(2);
  });

  it('rejects an entry without postings at commit', async () => {
    await expectSqlState(
      client.db.insert(journalEntries).values({ kind: 'TEST', description: 'empty' }),
      'AL001',
    );
  });

  it('rejects UPDATE, DELETE and TRUNCATE on postings', async () => {
    await insertEntry([5n, -5n]);
    await expectSqlState(client.db.update(postings).set({ amount: 1n }), 'AL002');
    await expectSqlState(client.db.delete(postings), 'AL002');
    await expectSqlState(client.pool.query('TRUNCATE postings CASCADE'), 'AL002');
  });

  it('rejects a negative USER_WALLET balance', async () => {
    await expectSqlState(
      client.db.insert(accounts).values({ type: 'USER_WALLET', balance: -1n }),
      '23514',
    );
    await expect(
      client.db.insert(accounts).values({ type: 'SYSTEM_SUSPENSE', balance: -1n }),
    ).resolves.toBeDefined();
  });

  it('rejects reversing the same entry twice', async () => {
    const original = await insertEntry([7n, -7n]);
    const reverse = () =>
      client.db.transaction(async (tx) => {
        const { a, b } = await createAccounts();
        const [entry] = await tx
          .insert(journalEntries)
          .values({ kind: 'REVERSAL', description: 'undo', reversalOf: original })
          .returning({ id: journalEntries.id });
        if (!entry) throw new Error('entry not created');
        await tx.insert(postings).values([
          { entryId: entry.id, accountId: a, amount: -7n },
          { entryId: entry.id, accountId: b, amount: 7n },
        ]);
      });
    await reverse();
    await expectSqlState(reverse(), '23505');
  });
});
