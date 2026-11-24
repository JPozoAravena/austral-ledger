import { parseEnv } from '../../config/env.js';
import { createDbClient } from '../../infra/db/client.js';
import { IdempotencyRepository } from './idempotency.repository.js';

/** Deletes expired idempotency records. Run it from any scheduler. */
const { pool, db } = createDbClient(parseEnv(process.env));
try {
  await new IdempotencyRepository().deleteExpired(db);
} finally {
  await pool.end();
}
