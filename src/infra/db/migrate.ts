import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { parseEnv } from '../../config/env.js';
import { createDbClient } from './client.js';

const { pool, db } = createDbClient(parseEnv(process.env));
try {
  await migrate(db, { migrationsFolder: join(process.cwd(), 'src/infra/db/migrations') });
} finally {
  await pool.end();
}
