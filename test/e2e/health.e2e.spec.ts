import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { ENV } from '../../src/config/config.module.js';
import { parseEnv } from '../../src/config/env.js';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // The pool connects lazily, so /health works without a database.
      .overrideProvider(ENV)
      .useValue(
        parseEnv({
          DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
          REDIS_URL: 'redis://localhost:6379',
          API_KEY_PEPPER: 'p'.repeat(32),
        }),
      )
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds with status ok', async () => {
    const res = await request(await app.getUrl()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
