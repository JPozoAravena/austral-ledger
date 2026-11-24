import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module.js';
import { OutboxModule } from '../webhooks/outbox.module.js';
import { EntriesController } from './entries.controller.js';
import { LedgerRepository } from './ledger.repository.js';
import { LedgerService } from './ledger.service.js';
import { ReversalsService } from './reversals.service.js';

@Module({
  imports: [OutboxModule, IdempotencyModule],
  controllers: [EntriesController],
  providers: [LedgerService, LedgerRepository, ReversalsService],
  exports: [LedgerService, ReversalsService],
})
export class LedgerModule {}
