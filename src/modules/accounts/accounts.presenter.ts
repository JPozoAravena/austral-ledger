import type { AccountRecord, PostingRecord } from './accounts.repository.js';

// BIGINT values are serialized as strings: JSON numbers lose precision above 2^53.
export const toAccountResponse = (account: AccountRecord) => ({
  id: account.id,
  type: account.type,
  ownerRef: account.ownerRef,
  platformRef: account.platformRef,
  currency: account.currency,
  balance: account.balance.toString(),
  createdAt: account.createdAt.toISOString(),
});

export const toPostingResponse = (posting: PostingRecord) => ({
  id: posting.id.toString(),
  entryId: posting.entryId,
  amount: posting.amount.toString(),
  createdAt: posting.createdAt.toISOString(),
});
