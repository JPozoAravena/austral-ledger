import { Injectable } from '@nestjs/common';
import { applyEntry } from '../../domain/ledger/apply-entry.js';
import type { JournalEntry } from '../../domain/ledger/journal-entry.js';
import type { Executor } from '../../infra/db/client.js';
import { MetricsService } from '../observability/metrics.service.js';
import { LedgerRepository } from './ledger.repository.js';

@Injectable()
export class LedgerService {
  constructor(
    private readonly repository: LedgerRepository,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Posts a domain-validated entry inside the caller's transaction: locks the
   * accounts in id order, checks the resulting balances, then writes the entry,
   * postings and cached balances. Rejects with INSUFFICIENT_FUNDS before writing anything.
   */
  async postEntry(tx: Executor, entry: JournalEntry): Promise<void> {
    const ids = entry.postings.map((p) => p.accountId).sort();
    const locked = await this.repository.lockAccounts(tx, ids);
    const updates = applyEntry(entry, locked);
    await this.repository.insertEntry(tx, entry);
    for (const update of updates) await this.repository.updateBalance(tx, update);
    this.metrics.ledgerEntriesPosted.inc({ kind: entry.kind });
  }
}
