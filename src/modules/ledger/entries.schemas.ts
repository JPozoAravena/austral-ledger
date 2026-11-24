import { z } from 'zod';

export const reverseBody = z.object({ reason: z.string().min(1).max(200) });
export type ReverseBody = z.output<typeof reverseBody>;
