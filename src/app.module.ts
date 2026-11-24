import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './infra/db/database.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { TransfersModule } from './modules/transfers/transfers.module.js';
import { PayoutsModule } from './modules/payouts/payouts.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdempotencyModule } from './modules/idempotency/idempotency.module.js';
import { ObservabilityModule } from './modules/observability/observability.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module.js';

@Module({
  imports: [
    CommonModule,
    ConfigModule,
    ObservabilityModule,
    DatabaseModule,
    RedisModule,
    // Guard order matters: auth first, then rate limit.
    AuthModule,
    RateLimitModule,
    IdempotencyModule,
    AccountsModule,
    TransfersModule,
    PayoutsModule,
    ReportsModule,
    WebhooksModule,
    HealthModule,
  ],
})
export class AppModule {}
