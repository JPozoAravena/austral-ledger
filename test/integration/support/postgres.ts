import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDbClient } from '../../../src/infra/db/client.js';
import { accounts } from '../../../src/infra/db/schema.js';

export const TEST_PEPPER = 'test-pepper-test-pepper-test-pepper-1234';

/** Starts a throwaway PostgreSQL, applies every migration and creates the system accounts. */
export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  const container = await new PostgreSqlContainer('postgres:18.7-alpine').start();
  const client = createDbClient({ DATABASE_URL: container.getConnectionUri() });
  try {
    await migrate(client.db, { migrationsFolder: join(process.cwd(), 'src/infra/db/migrations') });
    await client.db
      .insert(accounts)
      .values([
        { type: 'PLATFORM_FUNDING' },
        { type: 'PAYOUT_CLEARING' },
        { type: 'FEE_REVENUE' },
        { type: 'SYSTEM_SUSPENSE' },
      ]);
  } finally {
    await client.pool.end();
  }
  return container;
}
