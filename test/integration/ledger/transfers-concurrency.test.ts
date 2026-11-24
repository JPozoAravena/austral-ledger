import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../../../src/config/env.js';
import { computeBalance } from '../../../src/domain/ledger/balance.js';
import { LedgerError } from '../../../src/domain/ledger/errors.js';
import { createDbClient, type DbClient } from '../../../src/infra/db/client.js';
import { DatabaseService } from '../../../src/infra/db/database.module.js';
import { AccountsRepository } from '../../../src/modules/accounts/accounts.repository.js';
import type { Principal } from '../../../src/modules/auth/principal.js';
import { MetricsService } from '../../../src/modules/observability/metrics.service.js';
import { LedgerRepository } from '../../../src/modules/ledger/ledger.repository.js';
import { LedgerService } from '../../../src/modules/ledger/ledger.service.js';
import { FundingsService } from '../../../src/modules/transfers/fundings.service.js';
import { TransfersService } from '../../../src/modules/transfers/transfers.service.js';
import { startPostgres, TEST_PEPPER } from '../support/postgres.js';

const PLATFORM: Principal = { keyId: 'k', scope: 'platform', subjectRef: 'plat-1' };
const INITIAL_BALANCE = 10_000n;

let container: StartedPostgreSqlContainer;
let database: DatabaseService;
let rawClient: DbClient;
let raw: DbClient['pool'];
let accounts: AccountsRepository;
let transfers: TransfersService;
let fundings: FundingsService;

beforeAll(async () => {
  container = await startPostgres();
  database = new DatabaseService(
    parseEnv({
      DATABASE_URL: container.getConnectionUri(),
      REDIS_URL: 'redis://unused',
      API_KEY_PEPPER: TEST_PEPPER,
      DB_POOL_MAX: '25',
    }),
  );
  rawClient = createDbClient({ DATABASE_URL: container.getConnectionUri() }, 2);
  raw = rawClient.pool;
  accounts = new AccountsRepository();
  const ledger = new LedgerService(new LedgerRepository(), new MetricsService());
  transfers = new TransfersService(accounts, ledger);
  fundings = new FundingsService(accounts, ledger);
});

afterAll(async () => {
  await rawClient.pool.end();
  await database.onModuleDestroy();
  await container.stop();
});

async function fundedWallets(count: number, amount: bigint): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const wallet = await accounts.insertWallet(database.db, `user-${i}`, PLATFORM.subjectRef);
    await database.db.transaction((tx) =>
      fundings.fund(tx, PLATFORM, { accountId: wallet.id, amount: amount.toString() }),
    );
    ids.push(wallet.id);
  }
  return ids;
}

async function balanceOf(id: string): Promise<bigint> {
  const account = await accounts.findById(database.db, id);
  if (!account) throw new Error('account missing');
  return account.balance;
}

async function expectLedgerConsistent(): Promise<void> {
  const total = await raw.query<{ sum: string | null }>(
    'SELECT COALESCE(SUM(amount), 0) AS sum FROM postings',
  );
  expect(BigInt(total.rows[0]?.sum ?? '1')).toBe(0n);

  const rows = await raw.query<{
    id: string;
    type: Parameters<typeof computeBalance>[0];
    balance: string;
    net: string;
  }>(
    `SELECT a.id, a.type, a.balance, COALESCE(SUM(p.amount), 0) AS net
       FROM accounts a LEFT JOIN postings p ON p.account_id = a.id
      GROUP BY a.id`,
  );
  for (const row of rows.rows) {
    expect(BigInt(row.balance), `cached balance of ${row.id}`).toBe(
      computeBalance(row.type, [{ amount: BigInt(row.net) }]),
    );
    if (row.type === 'USER_WALLET') expect(BigInt(row.balance)).toBeGreaterThanOrEqual(0n);
  }
}

describe('concurrent transfers', () => {
  it('keeps the ledger consistent under 100 concurrent transfers, including crossed pairs', async () => {
    const wallets = await fundedWallets(8, INITIAL_BALANCE);
    const [a, b] = wallets;
    if (a === undefined || b === undefined) throw new Error('wallets missing');

    const transferRequests = Array.from({ length: 100 }, (_, i) => {
      // The first 40 alternate A->B and B->A: with unordered locks these deadlock.
      const [from, to] =
        i < 40
          ? i % 2 === 0
            ? [a, b]
            : [b, a]
          : [wallets[i % wallets.length], wallets[(i * 3 + 1) % wallets.length]];
      return { from, to, amount: String((i % 50) + 1) };
    });

    const results = await Promise.allSettled(
      transferRequests.map(({ from, to, amount }) => {
        if (from === undefined || to === undefined || from === to) {
          return Promise.reject(new Error('invalid test pair'));
        }
        return database.db.transaction((tx) =>
          transfers.transfer(tx, PLATFORM, { fromAccountId: from, toAccountId: to, amount }),
        );
      }),
    );

    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toHaveLength(0);

    let total = 0n;
    for (const id of wallets) total += await balanceOf(id);
    expect(total).toBe(INITIAL_BALANCE * BigInt(wallets.length));
    await expectLedgerConsistent();
  });

  it('lets exactly the affordable transfers through when one wallet is drained concurrently', async () => {
    const [source, ...others] = await fundedWallets(6, 1_000n);
    if (source === undefined) throw new Error('wallets missing');

    const results = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) =>
        database.db.transaction((tx) =>
          transfers.transfer(tx, PLATFORM, {
            fromAccountId: source,
            toAccountId: others[i % others.length] ?? source,
            amount: '100',
          }),
        ),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(succeeded).toHaveLength(10);
    expect(rejected).toHaveLength(20);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(LedgerError);
      expect(r.reason).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    }
    expect(await balanceOf(source)).toBe(0n);
    await expectLedgerConsistent();
  });
});
