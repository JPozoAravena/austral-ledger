import { parseArgs } from 'node:util';
import { parseEnv } from '../../config/env.js';
import { generateApiKey, hashApiKey, isApiScope } from '../../domain/auth/api-key.js';
import { createDbClient } from './client.js';
import { apiKeys } from './schema.js';

const { values } = parseArgs({
  options: { scope: { type: 'string' }, subject: { type: 'string' } },
});
const { scope, subject } = values;
if (scope === undefined || !isApiScope(scope) || subject === undefined || subject === '') {
  console.error(
    'Usage: npm run apikey:create -- --scope <platform|user|ops|auditor> --subject <ref>',
  );
  process.exit(1);
}

const env = parseEnv(process.env);
const { pool, db } = createDbClient(env);
try {
  const { key, prefix } = generateApiKey(scope);
  await db.insert(apiKeys).values({
    prefix,
    keyHash: hashApiKey(key, env.API_KEY_PEPPER),
    scope,
    subjectRef: subject,
  });
  console.info(`API key (shown once, store it now): ${key}`);
} finally {
  await pool.end();
}
