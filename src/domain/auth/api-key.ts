import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const API_SCOPES = ['platform', 'user', 'ops', 'auditor'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

const KEY_PATTERN = /^al_([a-z]+)_([A-Za-z0-9_-]{43})$/;
const PREFIX_RANDOM_CHARS = 12;

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

function prefixOf(scope: ApiScope, random: string): string {
  return `al_${scope}_${random.slice(0, PREFIX_RANDOM_CHARS)}`;
}

export interface GeneratedApiKey {
  readonly key: string;
  readonly prefix: string;
}

/** Format: al_<scope>_<32 random bytes as base64url>. The prefix (scope + 12 random chars) is the lookup handle. */
export function generateApiKey(scope: ApiScope): GeneratedApiKey {
  const random = randomBytes(32).toString('base64url');
  return { key: `al_${scope}_${random}`, prefix: prefixOf(scope, random) };
}

/** Returns the lookup prefix, or null when the key is malformed. */
export function parseApiKeyPrefix(key: string): string | null {
  const match = KEY_PATTERN.exec(key);
  const scope = match?.[1];
  const random = match?.[2];
  if (scope === undefined || random === undefined || !isApiScope(scope)) return null;
  return prefixOf(scope, random);
}

// HMAC (not argon2): keys carry 256 bits of entropy, so a slow hash adds nothing and lookup stays O(1).
export function hashApiKey(key: string, pepper: string): string {
  return createHmac('sha256', pepper).update(key).digest('hex');
}

export function verifyApiKey(key: string, pepper: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashApiKey(key, pepper), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
