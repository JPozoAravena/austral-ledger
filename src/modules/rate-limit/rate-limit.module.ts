import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { IpRateLimitMiddleware } from './ip-rate-limit.middleware.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimiter } from './rate-limiter.js';

@Module({ providers: [RateLimiter, { provide: APP_GUARD, useClass: RateLimitGuard }] })
export class RateLimitModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(IpRateLimitMiddleware).forRoutes('*path');
  }
}
