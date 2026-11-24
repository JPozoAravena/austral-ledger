import { z } from 'zod';

export const trialBalanceQuery = z.object({
  // Only entries created at or before this instant are counted.
  asOf: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
});
export type TrialBalanceQuery = z.output<typeof trialBalanceQuery>;
