import { Global, Inject, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { createRedisClient } from './client.js';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(ENV) env: Env) {
    this.client = createRedisClient(env);
    // Without a listener ioredis would throw on connection errors; callers already fail open.
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis error: ${error.name}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'ready') await this.client.quit();
    else this.client.disconnect();
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
