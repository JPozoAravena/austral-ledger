import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiError, notFound } from '../../common/api-error.js';
import { buildTransfer } from '../../domain/ledger/movements.js';
import { DatabaseService } from '../../infra/db/database.module.js';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import { canWriteAccount } from '../auth/access-policy.js';
import type { Principal } from '../auth/principal.js';
import { LedgerService } from '../ledger/ledger.service.js';
import type { TransferBody } from './transfers.schemas.js';

export interface TransferResult {
  readonly entryId: string;
  readonly amount: string;
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsRepository,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * The source must be writable by the principal and the destination must live
   * on the same platform. Anything else answers 404 so account ids cannot be probed.
   */
  transfer(principal: Principal, body: TransferBody): Promise<TransferResult> {
    return this.database.db.transaction(async (tx) => {
      const from = await this.accounts.findById(tx, body.fromAccountId);
      const to = await this.accounts.findById(tx, body.toAccountId);
      if (from === null || !canWriteAccount(principal, from)) throw notFound('Account');
      if (to === null || from.platformRef === null || to.platformRef !== from.platformRef) {
        throw notFound('Account');
      }
      if (from.type !== 'USER_WALLET' || to.type !== 'USER_WALLET') {
        throw new ApiError(
          422,
          'INVALID_ACCOUNT_TYPE',
          'Transfers are only allowed between wallets',
        );
      }
      const entry = buildTransfer(from.id, to.id, {
        id: randomUUID(),
        description: body.description ?? 'Transfer',
        amount: body.amount,
      });
      await this.ledger.postEntry(tx, entry);
      return { entryId: entry.id, amount: body.amount };
    });
  }
}
