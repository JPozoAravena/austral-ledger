import { ACCOUNT_POLICIES, type AccountType } from './account-type.js';
import { add, neg, sub, type Clp } from './money.js';

/** Per-account sums as aggregated by the database. */
export interface AccountTotals {
  readonly accountId: string;
  readonly type: AccountType;
  readonly debits: Clp;
  readonly credits: Clp;
}

export interface TrialBalanceLine extends AccountTotals {
  /** Natural balance: positive on the account's normal side. */
  readonly balance: Clp;
}

export interface TrialBalance {
  readonly lines: readonly TrialBalanceLine[];
  readonly totalDebits: Clp;
  readonly totalCredits: Clp;
  readonly balanced: boolean;
}

export function buildTrialBalance(rows: readonly AccountTotals[]): TrialBalance {
  let totalDebits: Clp = 0n;
  let totalCredits: Clp = 0n;
  const lines = rows.map((row): TrialBalanceLine => {
    totalDebits = add(totalDebits, row.debits);
    totalCredits = add(totalCredits, row.credits);
    const net = sub(row.debits, row.credits);
    const balance = ACCOUNT_POLICIES[row.type].normalSide === 'debit' ? net : neg(net);
    return { ...row, balance };
  });
  return { lines, totalDebits, totalCredits, balanced: totalDebits === totalCredits };
}
