import { describe, expect, it } from 'vitest';
import { applyEntry, type AccountState } from '../../../src/domain/ledger/apply-entry.js';
import {
  buildFunding,
  buildPayoutRequest,
  buildPayoutSettlement,
  buildTransfer,
} from '../../../src/domain/ledger/movements.js';

const input = (amount: string) => ({ id: 'e1', description: 'test', amount });
const wallet = (id: string, balance: bigint): AccountState => ({
  id,
  type: 'USER_WALLET',
  balance,
});
const system = (id: string, type: AccountState['type'], balance = 0n): AccountState => ({
  id,
  type,
  balance,
});

describe('movements', () => {
  it('transfer debits the source wallet and credits the destination', () => {
    const entry = buildTransfer('a', 'b', input('30'));
    expect(entry.postings.map((p) => p.amount)).toEqual([30n, -30n]);
    expect(applyEntry(entry, [wallet('a', 100n), wallet('b', 5n)])).toEqual([
      { accountId: 'a', balance: 70n },
      { accountId: 'b', balance: 35n },
    ]);
  });

  it('rejects a transfer that overdraws the source with INSUFFICIENT_FUNDS', () => {
    const entry = buildTransfer('a', 'b', input('101'));
    expect(() => applyEntry(entry, [wallet('a', 100n), wallet('b', 0n)])).toThrowError(
      expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }),
    );
  });

  it('allows spending the exact balance', () => {
    const entry = buildTransfer('a', 'b', input('100'));
    expect(applyEntry(entry, [wallet('a', 100n), wallet('b', 0n)])[0]?.balance).toBe(0n);
  });

  it('rejects zero, negative and non-integer amounts and self transfers', () => {
    for (const bad of ['0', '-5', '1.5', 'abc']) {
      expect(() => buildTransfer('a', 'b', input(bad))).toThrowError(
        expect.objectContaining({ code: 'INVALID_AMOUNT' }),
      );
    }
    expect(() => buildTransfer('a', 'a', input('5'))).toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_ACCOUNT' }),
    );
  });

  it('funding raises the wallet and the debit-normal funding account', () => {
    const entry = buildFunding('f', 'w', input('50'));
    expect(applyEntry(entry, [system('f', 'PLATFORM_FUNDING'), wallet('w', 0n)])).toEqual([
      { accountId: 'f', balance: 50n },
      { accountId: 'w', balance: 50n },
    ]);
  });

  it('payout request moves the wallet balance into clearing, settlement clears it', () => {
    const request = buildPayoutRequest('w', 'c', input('40'));
    const afterRequest = applyEntry(request, [wallet('w', 100n), system('c', 'PAYOUT_CLEARING')]);
    expect(afterRequest).toEqual([
      { accountId: 'w', balance: 60n },
      { accountId: 'c', balance: 40n },
    ]);
    const settlement = buildPayoutSettlement('c', 'f', input('40'));
    expect(
      applyEntry(settlement, [
        system('c', 'PAYOUT_CLEARING', 40n),
        system('f', 'PLATFORM_FUNDING', 100n),
      ]),
    ).toEqual([
      { accountId: 'c', balance: 0n },
      { accountId: 'f', balance: 60n },
    ]);
  });

  it('fails when an account of the entry was not loaded', () => {
    const entry = buildTransfer('a', 'b', input('1'));
    expect(() => applyEntry(entry, [wallet('a', 10n)])).toThrowError(
      expect.objectContaining({ code: 'ACCOUNT_NOT_FOUND' }),
    );
  });
});
