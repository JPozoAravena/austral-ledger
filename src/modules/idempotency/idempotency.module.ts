import { Module } from '@nestjs/common';
import { IdempotencyLock } from './idempotency.lock.js';
import { IdempotencyRepository } from './idempotency.repository.js';
import { IdempotencyService } from './idempotency.service.js';

@Module({
  providers: [IdempotencyService, IdempotencyRepository, IdempotencyLock],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
