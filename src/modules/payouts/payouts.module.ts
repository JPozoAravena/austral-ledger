import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { PayoutsController } from './payouts.controller.js';
import { PayoutsRepository } from './payouts.repository.js';
import { PayoutsService } from './payouts.service.js';

@Module({
  imports: [AccountsModule, LedgerModule],
  controllers: [PayoutsController],
  providers: [PayoutsService, PayoutsRepository],
})
export class PayoutsModule {}
