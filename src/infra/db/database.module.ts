import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { createDbClient, type Database } from './client.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client;

  constructor(@Inject(ENV) env: Env) {
    this.client = createDbClient(env, env.DB_POOL_MAX);
  }

  get db(): Database {
    return this.client.db;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.pool.end();
  }
}

@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
