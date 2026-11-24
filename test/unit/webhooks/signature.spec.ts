import { describe, expect, it } from 'vitest';
import { WebhookDomainError, type WebhookErrorCode } from '../../../src/domain/webhooks/errors.js';
import { sign, verify } from '../../../src/domain/webhooks/signature.js';

const SECRET = 'whsec_test';
const BODY = '{"id":"evt_1","amount":"1000"}';
const NOW = 1_700_000_000;

function codeOf(fn: () => void): WebhookErrorCode | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof WebhookDomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe('webhook signature', () => {
  it('signs as t=<unix>,v1=<hex> and verifies', () => {
    const header = sign(SECRET, NOW, BODY);
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(codeOf(() => verify(header, SECRET, BODY, NOW))).toBeUndefined();
  });

  it('rejects a tampered body and another secret', () => {
    const header = sign(SECRET, NOW, BODY);
    expect(codeOf(() => verify(header, SECRET, `${BODY} `, NOW))).toBe('SIGNATURE_MISMATCH');
    expect(codeOf(() => verify(header, 'whsec_other', BODY, NOW))).toBe('SIGNATURE_MISMATCH');
  });

  it('rejects expired and future timestamps but accepts the tolerance edge', () => {
    const header = sign(SECRET, NOW, BODY);
    expect(codeOf(() => verify(header, SECRET, BODY, NOW + 301))).toBe(
      'TIMESTAMP_OUT_OF_TOLERANCE',
    );
    expect(codeOf(() => verify(header, SECRET, BODY, NOW - 301))).toBe(
      'TIMESTAMP_OUT_OF_TOLERANCE',
    );
    expect(codeOf(() => verify(header, SECRET, BODY, NOW + 300))).toBeUndefined();
    expect(codeOf(() => verify(header, SECRET, BODY, NOW + 10, 5))).toBe(
      'TIMESTAMP_OUT_OF_TOLERANCE',
    );
  });

  it.each(['', 'garbage', 't=abc,v1=00', `t=${NOW}`, `v1=${'a'.repeat(64)}`, `t=${NOW},v1=zz`])(
    'rejects malformed header %j',
    (header) => {
      expect(codeOf(() => verify(header, SECRET, BODY, NOW))).toBe('MALFORMED_SIGNATURE_HEADER');
    },
  );

  it('accepts several v1 signatures when one matches (secret rotation)', () => {
    const valid = sign(SECRET, NOW, BODY).split(',v1=')[1] ?? '';
    const stale = 'b'.repeat(64);
    expect(codeOf(() => verify(`t=${NOW},v1=${stale},v1=${valid}`, SECRET, BODY, NOW))).toBe(
      undefined,
    );
    expect(codeOf(() => verify(`t=${NOW},v1=${stale},v1=${stale}`, SECRET, BODY, NOW))).toBe(
      'SIGNATURE_MISMATCH',
    );
  });
});
