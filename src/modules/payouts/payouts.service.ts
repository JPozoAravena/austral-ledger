import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiError, notFound } from '../../common/api-error.js';
import { buildPayoutRequest, buildPayoutSettlement } from '../../domain/ledger/movements.js';
import { parsePositiveClp } from '../../domain/ledger/money.js';
import { DatabaseService } from '../../infra/db/database.module.js';
import type { Executor } from '../../infra/db/client.js';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import { canReadAccount, canWriteAccount } from '../auth/access-policy.js';
import type { Principal } from '../auth/principal.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { OutboxRepository } from '../webhooks/outbox.repository.js';
import { PayoutsRepository, type PayoutRecord } from './payouts.repository.js';
import type { PayoutBody } from './payouts.schemas.js';

@Injectable()
export class PayoutsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly payouts: PayoutsRepository,
    private readonly accounts: AccountsRepository,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxRepository,
  ) {}

  /** Debits the wallet into PAYOUT_CLEARING; the payout stays `requested` until ops settle it. */
  async request(tx: Executor, principal: Principal, body: PayoutBody): Promise<PayoutRecord> {
    const wallet = await this.accounts.findById(tx, body.accountId);
    if (wallet === null || !canWriteAccount(principal, wallet)) throw notFound('Account');
    if (wallet.type !== 'USER_WALLET') {
      throw new ApiError(422, 'INVALID_ACCOUNT_TYPE', 'Payouts are only allowed from wallets');
    }
    const clearing = await this.accounts.requireSystem(tx, 'PAYOUT_CLEARING');
    const entry = buildPayoutRequest(wallet.id, clearing.id, {
      id: randomUUID(),
      description: 'Payout request',
      amount: body.amount,
    });
    await this.ledger.postEntry(tx, entry);
    const payout = await this.payouts.insert(tx, {
      accountId: wallet.id,
      amount: parsePositiveClp(body.amount),
      destination: body.destination,
      entryId: entry.id,
    });
    await this.outbox.insert(tx, {
      eventType: 'payout.requested',
      aggregateId: payout.id,
      platformRef: wallet.platformRef,
      payload: {
        payoutId: payout.id,
        accountId: wallet.id,
        amount: body.amount,
        entryId: entry.id,
      },
    });
    return payout;
  }

  /** Simulated bank settlement: clears PAYOUT_CLEARING against PLATFORM_FUNDING. */
  async settle(tx: Executor, id: string): Promise<PayoutRecord> {
    const payout = await this.payouts.findByIdForUpdate(tx, id);
    if (payout === null) throw notFound('Payout');
    if (payout.status !== 'requested') {
      throw new ApiError(409, 'PAYOUT_NOT_REQUESTED', `Payout is already ${payout.status}`);
    }
    const clearing = await this.accounts.requireSystem(tx, 'PAYOUT_CLEARING');
    const funding = await this.accounts.requireSystem(tx, 'PLATFORM_FUNDING');
    const entry = buildPayoutSettlement(clearing.id, funding.id, {
      id: randomUUID(),
      description: 'Payout settlement',
      amount: payout.amount,
    });
    await this.ledger.postEntry(tx, entry);
    const paid = await this.payouts.markPaid(tx, payout.id, entry.id);
    const wallet = await this.accounts.findById(tx, payout.accountId);
    await this.outbox.insert(tx, {
      eventType: 'payout.paid',
      aggregateId: paid.id,
      platformRef: wallet?.platformRef ?? null,
      payload: {
        payoutId: paid.id,
        accountId: paid.accountId,
        amount: paid.amount.toString(),
        settlementEntryId: entry.id,
      },
    });
    return paid;
  }

  async get(principal: Principal, id: string): Promise<PayoutRecord> {
    const db = this.database.db;
    const payout = await this.payouts.findById(db, id);
    const wallet = payout === null ? null : await this.accounts.findById(db, payout.accountId);
    if (payout === null || wallet === null || !canReadAccount(principal, wallet)) {
      throw notFound('Payout');
    }
    return payout;
  }
}
