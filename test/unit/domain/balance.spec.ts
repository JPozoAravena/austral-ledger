import { describe, expect, it } from 'vitest';
import { ACCOUNT_POLICIES, ACCOUNT_TYPES } from '../../../src/domain/ledger/account-type.js';
import { assertBalanceAllowed, computeBalance } from '../../../src/domain/ledger/balance.js';

describe('account policies', () => {
  it('never allows a negative USER_WALLET', () => {
    expect(ACCOUNT_POLICIES.USER_WALLET).toEqual({ normalSide: 'credit', allowsNegative: false });
  });
});

describe('computeBalance', () => {
  it('is positive on the normal side', () => {
    expect(computeBalance('USER_WALLET', [{ amount: -500n }, { amount: 200n }])).toBe(300n);
    expect(computeBalance('PLATFORM_FUNDING', [{ amount: 500n }, { amount: -200n }])).toBe(300n);
  });

  it('is zero without postings', () => {
    expect(computeBalance('FEE_REVENUE', [])).toBe(0n);
  });
});

describe('assertBalanceAllowed', () => {
  it('rejects a negative USER_WALLET balance', () => {
    expect(() => assertBalanceAllowed('USER_WALLET', -1n)).toThrow(
      expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }),
    );
  });

  it('accepts zero and positive balances for every type', () => {
    for (const type of ACCOUNT_TYPES) {
      expect(() => assertBalanceAllowed(type, 0n)).not.toThrow();
      expect(() => assertBalanceAllowed(type, 10n)).not.toThrow();
    }
  });

  it.each(ACCOUNT_TYPES.filter((t) => t !== 'USER_WALLET'))('allows negative for %s', (type) => {
    expect(() => assertBalanceAllowed(type, -1n)).not.toThrow();
  });
});
