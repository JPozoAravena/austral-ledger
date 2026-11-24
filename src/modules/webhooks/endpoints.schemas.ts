import { z } from 'zod';

export const createEndpointBody = z.object({ url: z.string().min(1).max(2048) });
export type CreateEndpointBody = z.output<typeof createEndpointBody>;
