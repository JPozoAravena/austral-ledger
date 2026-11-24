import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { IdempotencyModule } from '../idempotency/idempotency.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { FundingsService } from './fundings.service.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  imports: [AccountsModule, LedgerModule, IdempotencyModule],
  controllers: [TransfersController],
  providers: [TransfersService, FundingsService],
})
export class TransfersModule {}
