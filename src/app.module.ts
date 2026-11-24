import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './infra/db/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({ imports: [CommonModule, ConfigModule, DatabaseModule, AuthModule, HealthModule] })
export class AppModule {}
