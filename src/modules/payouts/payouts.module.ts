import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { IdempotencyModule } from '../idempotency/idempotency.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { OutboxModule } from '../webhooks/outbox.module.js';
import { PayoutsController } from './payouts.controller.js';
import { PayoutsRepository } from './payouts.repository.js';
import { PayoutsService } from './payouts.service.js';

@Module({
  imports: [AccountsModule, LedgerModule, IdempotencyModule, OutboxModule],
  controllers: [PayoutsController],
  providers: [PayoutsService, PayoutsRepository],
})
export class PayoutsModule {}
