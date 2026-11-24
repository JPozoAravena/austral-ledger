export type LedgerErrorCode =
  | 'INVALID_AMOUNT'
  | 'EMPTY_ENTRY'
  | 'UNBALANCED_ENTRY'
  | 'DUPLICATE_ACCOUNT'
  | 'INSUFFICIENT_FUNDS';

export class LedgerError extends Error {
  constructor(
    readonly code: LedgerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}
