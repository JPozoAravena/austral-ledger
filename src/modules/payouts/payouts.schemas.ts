import { z } from 'zod';
import { amountString } from '../transfers/transfers.schemas.js';

export const payoutBody = z.object({
  accountId: z.uuid(),
  amount: amountString,
  // Fictitious masked bank account, e.g. "Banco Austral ****1234". Sensitive: never log it.
  destination: z.string().min(1).max(64),
});
export type PayoutBody = z.output<typeof payoutBody>;

export const failBody = z.object({ reason: z.string().min(1).max(200) });
export type FailBody = z.output<typeof failBody>;
