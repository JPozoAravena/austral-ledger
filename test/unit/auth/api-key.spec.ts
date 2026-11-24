import { describe, expect, it } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  parseApiKeyPrefix,
  verifyApiKey,
} from '../../../src/domain/auth/api-key.js';

const pepper = 'p'.repeat(32);

describe('api keys', () => {
  it('generates al_<scope>_<43 base64url chars> keys with a scope-aware prefix', () => {
    const { key, prefix } = generateApiKey('platform');
    expect(key).toMatch(/^al_platform_[A-Za-z0-9_-]{43}$/);
    expect(prefix).toBe(key.slice(0, 'al_platform_'.length + 12));
    expect(parseApiKeyPrefix(key)).toBe(prefix);
  });

  it('generates distinct keys', () => {
    expect(generateApiKey('user').key).not.toBe(generateApiKey('user').key);
  });

  it('rejects malformed keys and unknown scopes', () => {
    expect(parseApiKeyPrefix('nope')).toBeNull();
    expect(parseApiKeyPrefix(`al_root_${'a'.repeat(43)}`)).toBeNull();
    expect(parseApiKeyPrefix(`al_user_${'a'.repeat(42)}`)).toBeNull();
  });

  it('hashes deterministically and depends on the pepper', () => {
    const { key } = generateApiKey('ops');
    expect(hashApiKey(key, pepper)).toBe(hashApiKey(key, pepper));
    expect(hashApiKey(key, pepper)).not.toBe(hashApiKey(key, 'q'.repeat(32)));
    expect(hashApiKey(key, pepper)).not.toContain(key);
  });

  it('verifies only the matching key', () => {
    const a = generateApiKey('user').key;
    const b = generateApiKey('user').key;
    const hash = hashApiKey(a, pepper);
    expect(verifyApiKey(a, pepper, hash)).toBe(true);
    expect(verifyApiKey(b, pepper, hash)).toBe(false);
    expect(verifyApiKey(a, pepper, 'zz')).toBe(false);
  });
});
