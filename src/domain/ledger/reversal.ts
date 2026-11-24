import { createJournalEntry, type JournalEntry } from './journal-entry.js';
import { neg } from './money.js';

export interface ReversalInput {
  readonly id: string;
  readonly description: string;
}

/** Builds the compensating entry: same accounts, negated amounts, linked via reversalOf. */
export function reverseEntry(original: JournalEntry, input: ReversalInput): JournalEntry {
  return createJournalEntry({
    id: input.id,
    kind: 'REVERSAL',
    description: input.description,
    reversalOf: original.id,
    postings: original.postings.map((p) => ({ accountId: p.accountId, amount: neg(p.amount) })),
  });
}
