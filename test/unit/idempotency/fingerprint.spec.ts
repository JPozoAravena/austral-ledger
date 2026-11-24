import { describe, expect, it } from 'vitest';
import { canonicalJson, fingerprint } from '../../../src/modules/idempotency/fingerprint.js';

describe('canonicalJson', () => {
  it('ignores key order at every depth', () => {
    const a = { amount: '10', nested: { x: 1, y: [1, { b: 2, a: 1 }] }, id: 'k' };
    const b = { id: 'k', nested: { y: [1, { a: 1, b: 2 }], x: 1 }, amount: '10' };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('keeps array order and distinguishes values', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson({ a: '1' })).not.toBe(canonicalJson({ a: 1 }));
  });

  it('treats a missing body as null', () => {
    expect(canonicalJson(undefined)).toBe('null');
  });
});

describe('fingerprint', () => {
  it('is stable for reordered bodies and differs by method, path or body', () => {
    const base = fingerprint('POST', '/v1/transfers', { a: 1, b: 2 });
    expect(fingerprint('post', '/v1/transfers', { b: 2, a: 1 })).toBe(base);
    expect(fingerprint('POST', '/v1/fundings', { a: 1, b: 2 })).not.toBe(base);
    expect(fingerprint('POST', '/v1/transfers', { a: 1, b: 3 })).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });
});
