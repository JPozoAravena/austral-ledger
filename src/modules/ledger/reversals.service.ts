import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiError, notFound } from '../../common/api-error.js';
import { isUniqueViolation } from '../../common/pg-error.js';
import type { JournalEntry } from '../../domain/ledger/journal-entry.js';
import { reverseEntry } from '../../domain/ledger/reversal.js';
import type { Executor } from '../../infra/db/client.js';
import { REVERSAL_UNIQUE } from '../../infra/db/schema.js';
import { OutboxRepository } from '../webhooks/outbox.repository.js';
import { LedgerRepository } from './ledger.repository.js';
import { LedgerService } from './ledger.service.js';

const PAYOUT_KINDS: ReadonlySet<string> = new Set(['PAYOUT_REQUEST', 'PAYOUT_SETTLEMENT']);

const alreadyReversed = (): ApiError =>
  new ApiError(409, 'ENTRY_ALREADY_REVERSED', 'Entry has already been reversed');

@Injectable()
export class ReversalsService {
  constructor(
    private readonly repository: LedgerRepository,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxRepository,
  ) {}

  /** Locks the entry so a concurrent reversal waits and then sees the first one. */
  async load(tx: Executor, id: string): Promise<JournalEntry> {
    const entry = await this.repository.findEntryForUpdate(tx, id);
    if (entry === null) throw notFound('Entry');
    return entry;
  }

  /** Posts the compensating entry; the original is never modified. */
  async reverse(tx: Executor, original: JournalEntry, reason: string): Promise<JournalEntry> {
    const reversal = reverseEntry(original, {
      id: randomUUID(),
      description: `Reversal: ${reason}`,
    });
    if (await this.repository.isReversed(tx, original.id)) throw alreadyReversed();
    try {
      await this.ledger.postEntry(tx, reversal);
    } catch (error) {
      // The unique constraint is the backstop if the lock-and-check above is ever bypassed.
      throw isUniqueViolation(error, REVERSAL_UNIQUE) ? alreadyReversed() : error;
    }
    return reversal;
  }

  /** Ops-initiated reversal. Payout entries go through the payout endpoints to keep payout state consistent. */
  async reverseByOps(tx: Executor, id: string, reason: string): Promise<JournalEntry> {
    const original = await this.load(tx, id);
    if (PAYOUT_KINDS.has(original.kind)) {
      throw new ApiError(
        422,
        'USE_PAYOUT_FAIL',
        'Payout entries are reversed by failing the payout',
      );
    }
    const reversal = await this.reverse(tx, original, reason);
    const platformRefs = await this.repository.platformRefs(
      tx,
      original.postings.map((p) => p.accountId),
    );
    for (const platformRef of platformRefs) {
      await this.outbox.insert(tx, {
        eventType: 'entry.reversed',
        aggregateId: reversal.id,
        platformRef,
        payload: { entryId: original.id, reversalEntryId: reversal.id, reason },
      });
    }
    return reversal;
  }
}
