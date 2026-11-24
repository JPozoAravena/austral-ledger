import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { WebhookDomainError } from './errors.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

/** Decodes a base64 AES-256 key (exactly 32 bytes). */
export function parseSecretKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) {
    throw new WebhookDomainError('INVALID_SECRET_KEY', 'Secret key must be 32 bytes in base64');
  }
  if (key.every((byte) => byte === 0)) {
    throw new WebhookDomainError('INVALID_SECRET_KEY', 'Secret key must not be all zeros');
  }
  return key;
}

/** AES-256-GCM, serialized as `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url'));
  return [VERSION, ...parts].join('.');
}

export function decryptSecret(blob: string, key: Buffer): string {
  const [version, iv, tag, data, extra] = blob.split('.');
  if (version !== VERSION || !iv || !tag || !data || extra !== undefined) {
    throw new WebhookDomainError('INVALID_CIPHERTEXT', 'Unrecognized secret format');
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new WebhookDomainError('INVALID_CIPHERTEXT', 'Secret could not be decrypted');
  }
}
