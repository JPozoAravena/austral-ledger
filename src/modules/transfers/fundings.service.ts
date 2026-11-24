import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiError, notFound } from '../../common/api-error.js';
import { buildFunding } from '../../domain/ledger/movements.js';
import type { Executor } from '../../infra/db/client.js';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import { canWriteAccount } from '../auth/access-policy.js';
import type { Principal } from '../auth/principal.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { OutboxRepository } from '../webhooks/outbox.repository.js';
import type { FundingBody } from './transfers.schemas.js';
import type { TransferResult } from './transfers.service.js';

@Injectable()
export class FundingsService {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxRepository,
  ) {}

  /** Credits a wallet of the principal's platform from PLATFORM_FUNDING, inside the caller's transaction. */
  async fund(tx: Executor, principal: Principal, body: FundingBody): Promise<TransferResult> {
    const wallet = await this.accounts.findById(tx, body.accountId);
    if (wallet === null || !canWriteAccount(principal, wallet)) throw notFound('Account');
    if (wallet.type !== 'USER_WALLET') {
      throw new ApiError(422, 'INVALID_ACCOUNT_TYPE', 'Only wallets can be funded');
    }
    const funding = await this.accounts.requireSystem(tx, 'PLATFORM_FUNDING');
    const entry = buildFunding(funding.id, wallet.id, {
      id: randomUUID(),
      description: body.description ?? 'Funding',
      amount: body.amount,
    });
    await this.ledger.postEntry(tx, entry);
    await this.outbox.insert(tx, {
      eventType: 'funding.completed',
      aggregateId: entry.id,
      platformRef: wallet.platformRef,
      payload: { entryId: entry.id, accountId: wallet.id, amount: body.amount },
    });
    return { entryId: entry.id, amount: body.amount };
  }
}
