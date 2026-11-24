import { and, eq, isNull } from 'drizzle-orm';
import { parseEnv } from '../../config/env.js';
import type { AccountType } from '../../domain/ledger/account-type.js';
import { generateApiKey, hashApiKey } from '../../domain/auth/api-key.js';
import { createDbClient } from './client.js';
import { accounts, apiKeys } from './schema.js';

const SYSTEM_ACCOUNTS: readonly AccountType[] = [
  'PLATFORM_FUNDING',
  'PAYOUT_CLEARING',
  'FEE_REVENUE',
  'SYSTEM_SUSPENSE',
];

const env = parseEnv(process.env);
const { pool, db } = createDbClient(env);
try {
  await db.transaction(async (tx) => {
    for (const type of SYSTEM_ACCOUNTS) {
      const [existing] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.type, type));
      if (!existing) await tx.insert(accounts).values({ type });
    }
    const [opsKey] = await tx
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.scope, 'ops'), isNull(apiKeys.revokedAt)));
    if (opsKey) {
      console.info(
        'System accounts ready. An active ops key already exists; revoke it to issue a new one.',
      );
      return;
    }
    const { key, prefix } = generateApiKey('ops');
    await tx.insert(apiKeys).values({
      prefix,
      keyHash: hashApiKey(key, env.API_KEY_PEPPER),
      scope: 'ops',
      subjectRef: 'ops',
    });
    console.info(`System accounts ready. Ops API key (shown once, store it now): ${key}`);
  });
} finally {
  await pool.end();
}
