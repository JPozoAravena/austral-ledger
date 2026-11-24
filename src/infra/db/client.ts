import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;
/** Accepts both the root database and a transaction, so repositories work in either. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export interface DbClient {
  readonly pool: Pool;
  readonly db: Database;
}

export function createDbClient(config: Pick<Env, 'DATABASE_URL'>, poolMax = 10): DbClient {
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: poolMax });
  return { pool, db: drizzle(pool, { schema }) };
}
