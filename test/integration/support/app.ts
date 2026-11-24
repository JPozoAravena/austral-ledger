import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type ApiScope, generateApiKey, hashApiKey } from '../../../src/domain/auth/api-key.js';
import { AppModule } from '../../../src/app.module.js';
import { ENV } from '../../../src/config/config.module.js';
import { parseEnv } from '../../../src/config/env.js';
import { DatabaseService } from '../../../src/infra/db/database.module.js';
import { accounts, apiKeys } from '../../../src/infra/db/schema.js';
import { TEST_PEPPER } from './postgres.js';

export interface TestApp {
  readonly app: INestApplication;
  readonly url: string;
  readonly database: DatabaseService;
}

export async function createTestApp(
  databaseUrl: string,
  redisUrl: string,
  overrides: Record<string, string> = {},
): Promise<TestApp> {
  const env = parseEnv({
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    API_KEY_PEPPER: TEST_PEPPER,
    LOG_LEVEL: 'silent',
    DB_POOL_MAX: '30',
    ...overrides,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(env)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  return { app, url: await app.getUrl(), database: app.get(DatabaseService) };
}

export async function createApiKey(
  database: DatabaseService,
  scope: ApiScope,
  subjectRef: string,
): Promise<string> {
  const { key, prefix } = generateApiKey(scope);
  await database.db
    .insert(apiKeys)
    .values({ prefix, keyHash: hashApiKey(key, TEST_PEPPER), scope, subjectRef });
  return key;
}

/** Creates a wallet directly in the database and returns its id. */
export async function createWalletRow(
  database: DatabaseService,
  platformRef: string,
  ownerRef: string,
): Promise<string> {
  const [wallet] = await database.db
    .insert(accounts)
    .values({ type: 'USER_WALLET', ownerRef, platformRef })
    .returning({ id: accounts.id });
  if (wallet === undefined) throw new Error('wallet insert returned no row');
  return wallet.id;
}

export const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
