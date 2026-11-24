import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../src/common/api-error.js';
import { parseIdempotencyKey } from '../../../src/modules/idempotency/idempotency-key.js';

describe('parseIdempotencyKey', () => {
  it('accepts a UUID and 255 printable characters', () => {
    const uuid = '6f1f5b0e-0000-4000-8000-000000000000';
    expect(parseIdempotencyKey(uuid)).toBe(uuid);
    expect(parseIdempotencyKey('a'.repeat(255))).toHaveLength(255);
  });

  it.each([undefined, '', 'a'.repeat(256), 'badékey', ['a', 'b']])(
    'rejects %j with IDEMPOTENCY_KEY_REQUIRED',
    (value) => {
      expect(() => parseIdempotencyKey(value)).toThrow(ApiError);
      expect(() => parseIdempotencyKey(value)).toThrow(/Idempotency-Key/);
    },
  );
});
