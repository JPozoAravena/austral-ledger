import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import type { AccountState, BalanceUpdate } from '../../domain/ledger/apply-entry.js';
import type { JournalEntry } from '../../domain/ledger/journal-entry.js';
import type { Executor } from '../../infra/db/client.js';
import { accounts, journalEntries, postings } from '../../infra/db/schema.js';

@Injectable()
export class LedgerRepository {
  /** Row locks are taken in id order, so concurrent entries can never wait on each other in a cycle. */
  async lockAccounts(tx: Executor, ids: readonly string[]): Promise<AccountState[]> {
    return tx
      .select({ id: accounts.id, type: accounts.type, balance: accounts.balance })
      .from(accounts)
      .where(inArray(accounts.id, [...ids]))
      .orderBy(accounts.id)
      .for('update');
  }

  async insertEntry(tx: Executor, entry: JournalEntry): Promise<void> {
    await tx.insert(journalEntries).values({
      id: entry.id,
      kind: entry.kind,
      description: entry.description,
      reversalOf: entry.reversalOf,
    });
    await tx.insert(postings).values(
      entry.postings.map((p) => ({
        entryId: entry.id,
        accountId: p.accountId,
        amount: p.amount,
      })),
    );
  }

  async updateBalance(tx: Executor, update: BalanceUpdate): Promise<void> {
    await tx
      .update(accounts)
      .set({ balance: update.balance })
      .where(eq(accounts.id, update.accountId));
  }
}
