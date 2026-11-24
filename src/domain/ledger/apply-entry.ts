import { ACCOUNT_POLICIES, type AccountType } from './account-type.js';
import { assertBalanceAllowed } from './balance.js';
import { LedgerError } from './errors.js';
import type { JournalEntry } from './journal-entry.js';
import { add, neg, type Clp } from './money.js';

export interface AccountState {
  readonly id: string;
  readonly type: AccountType;
  readonly balance: Clp;
}

export interface BalanceUpdate {
  readonly accountId: string;
  readonly balance: Clp;
}

/**
 * New natural balance of every account touched by the entry. Throws
 * INSUFFICIENT_FUNDS when any account would break its policy, before anything is written.
 */
export function applyEntry(
  entry: JournalEntry,
  accounts: readonly AccountState[],
): BalanceUpdate[] {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return entry.postings.map((posting) => {
    const account = byId.get(posting.accountId);
    if (!account) {
      throw new LedgerError('ACCOUNT_NOT_FOUND', `Account not found: ${posting.accountId}`);
    }
    const delta =
      ACCOUNT_POLICIES[account.type].normalSide === 'debit' ? posting.amount : neg(posting.amount);
    const balance = add(account.balance, delta);
    assertBalanceAllowed(account.type, balance);
    return { accountId: account.id, balance };
  });
}
