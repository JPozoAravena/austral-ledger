import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeysRepository } from './api-keys.repository.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  providers: [AuthService, ApiKeysRepository, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
