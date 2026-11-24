import { z } from 'zod';

export const createAccountBody = z.object({ ownerRef: z.string().min(1).max(128) });
export type CreateAccountBody = z.output<typeof createAccountBody>;

export const postingsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  // Posting ids are bigserial; the cap keeps the value inside the BIGINT range.
  cursor: z
    .string()
    .regex(/^\d{1,18}$/)
    .optional(),
});
export type PostingsQuery = z.output<typeof postingsQuery>;

export const uuidParam = z.uuid();
