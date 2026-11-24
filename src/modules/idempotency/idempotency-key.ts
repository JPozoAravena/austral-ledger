import { z } from 'zod';
import { ApiError } from '../../common/api-error.js';

export const IDEMPOTENCY_HEADER = 'idempotency-key';

// 1-255 printable ASCII characters; a UUID is recommended.
const idempotencyKey = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[\x20-\x7E]+$/);

export function parseIdempotencyKey(header: unknown): string {
  const result = idempotencyKey.safeParse(header);
  if (!result.success) {
    throw new ApiError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key header is required (1-255 printable characters)',
    );
  }
  return result.data;
}
