import { LedgerError } from './errors.js';

/** Integer Chilean pesos (no decimals), stored as bigint within PostgreSQL BIGINT range. */
export type Clp = bigint;

const MIN_CLP = -(2n ** 63n);
const MAX_CLP = 2n ** 63n - 1n;
const INTEGER_PATTERN = /^-?\d+$/;

function toBigInt(input: bigint | number | string): bigint {
  if (typeof input === 'bigint') return input;
  if (typeof input === 'number') {
    if (!Number.isSafeInteger(input)) {
      throw new LedgerError('INVALID_AMOUNT', `Amount must be a safe integer: ${input}`);
    }
    return BigInt(input);
  }
  const trimmed = input.trim();
  if (!INTEGER_PATTERN.test(trimmed)) {
    throw new LedgerError('INVALID_AMOUNT', `Amount must be an integer string: "${input}"`);
  }
  return BigInt(trimmed);
}

export function parseClp(input: bigint | number | string): Clp {
  const value = toBigInt(input);
  if (value < MIN_CLP || value > MAX_CLP) {
    throw new LedgerError('INVALID_AMOUNT', 'Amount is outside the BIGINT range');
  }
  return value;
}

export function parsePositiveClp(input: bigint | number | string): Clp {
  const value = parseClp(input);
  if (value <= 0n) throw new LedgerError('INVALID_AMOUNT', 'Amount must be positive');
  return value;
}

export function add(a: Clp, b: Clp): Clp {
  return parseClp(a + b);
}

export function sub(a: Clp, b: Clp): Clp {
  return parseClp(a - b);
}

export function neg(a: Clp): Clp {
  return parseClp(-a);
}

export function isZero(a: Clp): boolean {
  return a === 0n;
}
