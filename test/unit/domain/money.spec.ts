import { describe, expect, it } from 'vitest';
import { add, isZero, neg, parseClp, sub } from '../../../src/domain/ledger/money.js';

describe('money', () => {
  it('parses integers from bigint, number and string', () => {
    expect(parseClp(10n)).toBe(10n);
    expect(parseClp(10)).toBe(10n);
    expect(parseClp(' -25 ')).toBe(-25n);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60])('rejects number %s', (value) => {
    expect(() => parseClp(value)).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
  });

  it.each(['1.5', 'abc', '', '1e3'])('rejects string "%s"', (value) => {
    expect(() => parseClp(value)).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
  });

  it('enforces the BIGINT range', () => {
    expect(parseClp(2n ** 63n - 1n)).toBe(2n ** 63n - 1n);
    expect(() => parseClp(2n ** 63n)).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
    expect(() => parseClp(-(2n ** 63n) - 1n)).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT' }),
    );
  });

  it('adds, subtracts, negates and detects zero', () => {
    expect(add(2n, 3n)).toBe(5n);
    expect(sub(2n, 3n)).toBe(-1n);
    expect(neg(4n)).toBe(-4n);
    expect(isZero(0n)).toBe(true);
    expect(isZero(1n)).toBe(false);
  });

  it('rejects overflowing operations', () => {
    expect(() => add(2n ** 63n - 1n, 1n)).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT' }),
    );
  });
});
