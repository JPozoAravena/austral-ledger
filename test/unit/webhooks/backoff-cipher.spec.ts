import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { backoffDelayMs } from '../../../src/domain/webhooks/backoff.js';
import { WebhookDomainError } from '../../../src/domain/webhooks/errors.js';
import {
  decryptSecret,
  encryptSecret,
  parseSecretKey,
} from '../../../src/domain/webhooks/secret-cipher.js';

describe('backoffDelayMs', () => {
  it('grows exponentially with equal jitter', () => {
    expect(backoffDelayMs(1, 1000, () => 1)).toBe(1000);
    expect(backoffDelayMs(1, 1000, () => 0)).toBe(500);
    expect(backoffDelayMs(4, 1000, () => 1)).toBe(8000);
    expect(backoffDelayMs(4, 1000, () => 0)).toBe(4000);
  });

  it('caps the delay at one hour', () => {
    expect(backoffDelayMs(30, 5000, () => 1)).toBe(3_600_000);
  });
});

describe('secret cipher', () => {
  const key = randomBytes(32);

  it('round-trips and never repeats the ciphertext', () => {
    const first = encryptSecret('whsec_abc', key);
    expect(first).not.toContain('whsec_abc');
    expect(first).not.toBe(encryptSecret('whsec_abc', key));
    expect(decryptSecret(first, key)).toBe('whsec_abc');
  });

  it('rejects a wrong key, tampering and unknown formats', () => {
    const blob = encryptSecret('whsec_abc', key);
    expect(() => decryptSecret(blob, randomBytes(32))).toThrow(WebhookDomainError);
    const parts = blob.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key)).toThrow(WebhookDomainError);
    expect(() => decryptSecret('plain', key)).toThrow(WebhookDomainError);
  });

  it('requires a 32 byte key', () => {
    expect(parseSecretKey(key.toString('base64'))).toEqual(key);
    expect(() => parseSecretKey(randomBytes(16).toString('base64'))).toThrow(WebhookDomainError);
  });
});

describe('parseSecretKey', () => {
  it('rejects an all-zero key', () => {
    expect(() => parseSecretKey(Buffer.alloc(32).toString('base64'))).toThrow(WebhookDomainError);
  });
});
