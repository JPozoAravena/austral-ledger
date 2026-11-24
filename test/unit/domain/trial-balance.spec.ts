import { describe, expect, it } from 'vitest';
import { buildTrialBalance } from '../../../src/domain/ledger/trial-balance.js';

describe('buildTrialBalance', () => {
  it('computes natural balances and balanced totals', () => {
    const report = buildTrialBalance([
      { accountId: 'funding', type: 'PLATFORM_FUNDING', debits: 1000n, credits: 0n },
      { accountId: 'wallet', type: 'USER_WALLET', debits: 300n, credits: 1000n },
      { accountId: 'clearing', type: 'PAYOUT_CLEARING', debits: 0n, credits: 300n },
    ]);
    expect(report.lines.map((line) => line.balance)).toEqual([1000n, 700n, 300n]);
    expect(report.totalDebits).toBe(1300n);
    expect(report.totalCredits).toBe(1300n);
    expect(report.balanced).toBe(true);
  });

  it('flags unequal debits and credits', () => {
    const report = buildTrialBalance([
      { accountId: 'a', type: 'SYSTEM_SUSPENSE', debits: 10n, credits: 0n },
      { accountId: 'b', type: 'FEE_REVENUE', debits: 0n, credits: 9n },
    ]);
    expect(report.balanced).toBe(false);
  });

  it('is balanced when there are no accounts', () => {
    expect(buildTrialBalance([])).toMatchObject({ totalDebits: 0n, balanced: true });
  });
});
