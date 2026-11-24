import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiError, notFound } from '../../common/api-error.js';
import { buildTransfer } from '../../domain/ledger/movements.js';
import type { Executor } from '../../infra/db/client.js';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import { canWriteAccount } from '../auth/access-policy.js';
import type { Principal } from '../auth/principal.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { OutboxRepository } from '../webhooks/outbox.repository.js';
import type { TransferBody } from './transfers.schemas.js';

export interface TransferResult {
  readonly entryId: string;
  readonly amount: string;
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxRepository,
  ) {}

  /**
   * Runs inside the caller's transaction, so the idempotency record commits with the entry.
   * The source must be writable by the principal and the destination must live
   * on the same platform. Anything else answers 404 so account ids cannot be probed.
   */
  async transfer(tx: Executor, principal: Principal, body: TransferBody): Promise<TransferResult> {
    const from = await this.accounts.findById(tx, body.fromAccountId);
    const to = await this.accounts.findById(tx, body.toAccountId);
    if (from === null || !canWriteAccount(principal, from)) throw notFound('Account');
    if (to === null || from.platformRef === null || to.platformRef !== from.platformRef) {
      throw notFound('Account');
    }
    if (from.type !== 'USER_WALLET' || to.type !== 'USER_WALLET') {
      throw new ApiError(422, 'INVALID_ACCOUNT_TYPE', 'Transfers are only allowed between wallets');
    }
    const entry = buildTransfer(from.id, to.id, {
      id: randomUUID(),
      description: body.description ?? 'Transfer',
      amount: body.amount,
    });
    await this.ledger.postEntry(tx, entry);
    await this.outbox.insert(tx, {
      eventType: 'transfer.completed',
      aggregateId: entry.id,
      platformRef: from.platformRef,
      payload: {
        entryId: entry.id,
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: body.amount,
      },
    });
    return { entryId: entry.id, amount: body.amount };
  }
}
