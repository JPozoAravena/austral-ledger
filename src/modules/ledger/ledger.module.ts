import { Module } from '@nestjs/common';
import { LedgerRepository } from './ledger.repository.js';
import { LedgerService } from './ledger.service.js';

@Module({ providers: [LedgerService, LedgerRepository], exports: [LedgerService] })
export class LedgerModule {}
