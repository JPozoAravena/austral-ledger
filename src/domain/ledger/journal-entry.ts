import { LedgerError } from './errors.js';
import { add, isZero, parseClp, type Clp } from './money.js';

/*
 * Sign convention: debit is positive, credit is negative.
 * A valid entry has at least 2 postings, no zero amounts, and sums to exactly 0.
 * An account may appear only once per entry: repeated postings to one account
 * could be netted into a single one, so allowing them only hides mistakes.
 */

export interface Posting {
  readonly accountId: string;
  readonly amount: Clp;
}

export interface JournalEntry {
  readonly id: string;
  readonly kind: string;
  readonly description: string;
  readonly reversalOf: string | null;
  readonly postings: readonly Posting[];
}

export interface PostingInput {
  readonly accountId: string;
  readonly amount: bigint | number | string;
}

export interface JournalEntryInput {
  readonly id: string;
  readonly kind: string;
  readonly description: string;
  readonly reversalOf?: string | null;
  readonly postings: readonly PostingInput[];
}

export function createJournalEntry(input: JournalEntryInput): JournalEntry {
  if (input.postings.length < 2) {
    throw new LedgerError('EMPTY_ENTRY', 'An entry needs at least 2 postings');
  }
  const seen = new Set<string>();
  let total: Clp = 0n;
  const postings = input.postings.map((posting): Posting => {
    const amount = parseClp(posting.amount);
    if (isZero(amount)) {
      throw new LedgerError('INVALID_AMOUNT', 'Posting amount must not be zero');
    }
    if (seen.has(posting.accountId)) {
      throw new LedgerError('DUPLICATE_ACCOUNT', `Account repeated in entry: ${posting.accountId}`);
    }
    seen.add(posting.accountId);
    total = add(total, amount);
    return Object.freeze({ accountId: posting.accountId, amount });
  });
  if (!isZero(total)) {
    throw new LedgerError('UNBALANCED_ENTRY', `Entry sums to ${total}, expected 0`);
  }
  return Object.freeze({
    id: input.id,
    kind: input.kind,
    description: input.description,
    reversalOf: input.reversalOf ?? null,
    postings: Object.freeze(postings),
  });
}
