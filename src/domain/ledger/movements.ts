import { createJournalEntry, type JournalEntry } from './journal-entry.js';
import { neg, parsePositiveClp } from './money.js';

export interface Movement {
  readonly id: string;
  readonly description: string;
  readonly amount: bigint | number | string;
}

// Debit is positive, credit negative: `amount` moves from the credited to the debited side.
function movement(
  kind: string,
  debitAccountId: string,
  creditAccountId: string,
  input: Movement,
): JournalEntry {
  const amount = parsePositiveClp(input.amount);
  return createJournalEntry({
    id: input.id,
    kind,
    description: input.description,
    postings: [
      { accountId: debitAccountId, amount },
      { accountId: creditAccountId, amount: neg(amount) },
    ],
  });
}

/** Wallet to wallet: the source wallet is debited, the destination credited. */
export const buildTransfer = (from: string, to: string, input: Movement): JournalEntry =>
  movement('TRANSFER', from, to, input);

/** Funds enter the system: PLATFORM_FUNDING is debited, the wallet credited. */
export const buildFunding = (funding: string, wallet: string, input: Movement): JournalEntry =>
  movement('FUNDING', funding, wallet, input);

/** The wallet is debited into PAYOUT_CLEARING while the payout is in flight. */
export const buildPayoutRequest = (
  wallet: string,
  clearing: string,
  input: Movement,
): JournalEntry => movement('PAYOUT_REQUEST', wallet, clearing, input);

/** Settlement: PAYOUT_CLEARING is debited and the money leaves through PLATFORM_FUNDING. */
export const buildPayoutSettlement = (
  clearing: string,
  funding: string,
  input: Movement,
): JournalEntry => movement('PAYOUT_SETTLEMENT', clearing, funding, input);
