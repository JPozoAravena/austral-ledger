import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './infra/db/database.module.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { TransfersModule } from './modules/transfers/transfers.module.js';
import { PayoutsModule } from './modules/payouts/payouts.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [
    CommonModule,
    ConfigModule,
    DatabaseModule,
    AuthModule,
    AccountsModule,
    TransfersModule,
    PayoutsModule,
    HealthModule,
  ],
})
export class AppModule {}
