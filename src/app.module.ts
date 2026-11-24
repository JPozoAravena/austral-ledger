import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './infra/db/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({ imports: [ConfigModule, DatabaseModule, AuthModule, HealthModule] })
export class AppModule {}
