import { describe, expect, it } from 'vitest';
import { createJournalEntry } from '../../../src/domain/ledger/journal-entry.js';
import { reverseEntry } from '../../../src/domain/ledger/reversal.js';

const base = { id: 'e1', kind: 'TRANSFER', description: 'test' };

describe('createJournalEntry', () => {
  it('creates a balanced entry', () => {
    const entry = createJournalEntry({
      ...base,
      postings: [
        { accountId: 'a', amount: 1000 },
        { accountId: 'b', amount: '-1000' },
      ],
    });
    expect(entry.reversalOf).toBeNull();
    expect(entry.postings).toEqual([
      { accountId: 'a', amount: 1000n },
      { accountId: 'b', amount: -1000n },
    ]);
  });

  it('is immutable', () => {
    const entry = createJournalEntry({
      ...base,
      postings: [
        { accountId: 'a', amount: 1n },
        { accountId: 'b', amount: -1n },
      ],
    });
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.postings)).toBe(true);
    expect(Object.isFrozen(entry.postings[0])).toBe(true);
  });

  it('rejects unbalanced entries', () => {
    expect(() =>
      createJournalEntry({
        ...base,
        postings: [
          { accountId: 'a', amount: 10 },
          { accountId: 'b', amount: -9 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'UNBALANCED_ENTRY' }));
  });

  it.each([0, 1])('rejects fewer than 2 postings (%i)', (count) => {
    const postings = Array.from({ length: count }, () => ({ accountId: 'a', amount: 1 }));
    expect(() => createJournalEntry({ ...base, postings })).toThrow(
      expect.objectContaining({ code: 'EMPTY_ENTRY' }),
    );
  });

  it('rejects zero amounts', () => {
    expect(() =>
      createJournalEntry({
        ...base,
        postings: [
          { accountId: 'a', amount: 0 },
          { accountId: 'b', amount: 0 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
  });

  it('rejects non-integer amounts', () => {
    expect(() =>
      createJournalEntry({
        ...base,
        postings: [
          { accountId: 'a', amount: 1.5 },
          { accountId: 'b', amount: -1.5 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
  });

  it('rejects a repeated account', () => {
    expect(() =>
      createJournalEntry({
        ...base,
        postings: [
          { accountId: 'a', amount: 5 },
          { accountId: 'a', amount: -5 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'DUPLICATE_ACCOUNT' }));
  });
});

describe('reverseEntry', () => {
  it('negates amounts and links to the original', () => {
    const original = createJournalEntry({
      ...base,
      postings: [
        { accountId: 'a', amount: 700 },
        { accountId: 'b', amount: -700 },
      ],
    });
    const reversal = reverseEntry(original, { id: 'e2', description: 'undo' });
    expect(reversal.reversalOf).toBe('e1');
    expect(reversal.kind).toBe('REVERSAL');
    expect(reversal.postings).toEqual([
      { accountId: 'a', amount: -700n },
      { accountId: 'b', amount: 700n },
    ]);
  });

  it('refuses to reverse a reversal', () => {
    const original = createJournalEntry({
      ...base,
      postings: [
        { accountId: 'a', amount: 700 },
        { accountId: 'b', amount: -700 },
      ],
    });
    const reversal = reverseEntry(original, { id: 'e2', description: 'undo' });
    expect(() => reverseEntry(reversal, { id: 'e3', description: 'redo' })).toThrow(
      expect.objectContaining({ code: 'CANNOT_REVERSE_REVERSAL' }),
    );
  });
});
