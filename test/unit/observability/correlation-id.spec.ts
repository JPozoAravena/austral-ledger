import { describe, expect, it } from 'vitest';
import { resolveRequestId } from '../../../src/modules/observability/correlation-id.js';

describe('resolveRequestId', () => {
  it('keeps a valid incoming id', () => {
    expect(resolveRequestId('req_123-ABC')).toBe('req_123-ABC');
    expect(resolveRequestId('a'.repeat(128))).toHaveLength(128);
  });

  it.each([undefined, '', 'a'.repeat(129), 'has space', 'line\nbreak', ['x']])(
    'generates a UUID for %j',
    (value) => {
      expect(resolveRequestId(value)).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});
