import { LedgerError } from './errors.js';
import { createJournalEntry, type JournalEntry } from './journal-entry.js';
import { neg } from './money.js';

export interface ReversalInput {
  readonly id: string;
  readonly description: string;
}

/** Builds the compensating entry: same accounts, negated amounts, linked via reversalOf. */
export const REVERSAL_KIND = 'REVERSAL';

export function reverseEntry(original: JournalEntry, input: ReversalInput): JournalEntry {
  if (original.kind === REVERSAL_KIND || original.reversalOf !== null) {
    throw new LedgerError('CANNOT_REVERSE_REVERSAL', 'A reversal entry cannot be reversed');
  }
  return createJournalEntry({
    id: input.id,
    kind: REVERSAL_KIND,
    description: input.description,
    reversalOf: original.id,
    postings: original.postings.map((p) => ({ accountId: p.accountId, amount: neg(p.amount) })),
  });
}
