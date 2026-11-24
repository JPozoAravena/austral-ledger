import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DbClient {
  readonly pool: Pool;
  readonly db: Database;
}

export function createDbClient(config: Pick<Env, 'DATABASE_URL'>): DbClient {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  return { pool, db: drizzle(pool, { schema }) };
}
