import { ACCOUNT_POLICIES, type AccountType } from './account-type.js';
import { LedgerError } from './errors.js';
import { add, neg, type Clp } from './money.js';

/**
 * Balance in the account's natural direction: positive means a balance on its
 * normal side. Postings use debit-positive, so credit-normal accounts are negated.
 */
export function computeBalance(type: AccountType, postings: readonly { amount: Clp }[]): Clp {
  const net = postings.reduce<Clp>((sum, p) => add(sum, p.amount), 0n);
  return ACCOUNT_POLICIES[type].normalSide === 'debit' ? net : neg(net);
}

export function assertBalanceAllowed(type: AccountType, balance: Clp): void {
  if (balance < 0n && !ACCOUNT_POLICIES[type].allowsNegative) {
    throw new LedgerError('INSUFFICIENT_FUNDS', `${type} cannot have a negative balance`);
  }
}
