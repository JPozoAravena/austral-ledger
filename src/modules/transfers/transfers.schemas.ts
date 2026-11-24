import { z } from 'zod';

/** Positive integer in CLP, as a string because JSON numbers cannot carry a full BIGINT. */
export const amountString = z
  .string()
  .regex(/^[1-9]\d{0,18}$/, 'must be a positive integer string');

export const transferBody = z.object({
  fromAccountId: z.uuid(),
  toAccountId: z.uuid(),
  amount: amountString,
  description: z.string().min(1).max(200).optional(),
});
export type TransferBody = z.output<typeof transferBody>;

export const fundingBody = z.object({
  accountId: z.uuid(),
  amount: amountString,
  description: z.string().min(1).max(200).optional(),
});
export type FundingBody = z.output<typeof fundingBody>;
