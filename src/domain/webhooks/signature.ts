import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebhookDomainError } from './errors.js';

export const SIGNATURE_TOLERANCE_SEC = 300;

const digest = (secret: string, timestamp: number, rawBody: string): Buffer =>
  createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();

/** Builds the `Austral-Signature` header: `t=<unix>,v1=<hex hmac-sha256(secret, "t.body")>`. */
export function sign(secret: string, timestamp: number, rawBody: string): string {
  return `t=${timestamp},v1=${digest(secret, timestamp, rawBody).toString('hex')}`;
}

interface ParsedHeader {
  readonly timestamp: number;
  readonly signatures: readonly Buffer[];
}

function malformed(): WebhookDomainError {
  return new WebhookDomainError('MALFORMED_SIGNATURE_HEADER', 'Malformed signature header');
}

function parseHeader(header: string): ParsedHeader {
  let timestamp: number | null = null;
  const signatures: Buffer[] = [];
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 0) throw malformed();
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't' && /^\d{1,15}$/.test(value)) timestamp = Number(value);
    else if (key === 'v1' && /^[0-9a-f]{64}$/i.test(value)) {
      signatures.push(Buffer.from(value, 'hex'));
    }
  }
  if (timestamp === null || signatures.length === 0) throw malformed();
  return { timestamp, signatures };
}

/**
 * Throws a WebhookDomainError unless one of the `v1` signatures matches and the
 * timestamp is within `toleranceSec` of `now` (unix seconds). Comparison is constant time.
 */
export function verify(
  header: string,
  secret: string,
  rawBody: string,
  now: number,
  toleranceSec: number = SIGNATURE_TOLERANCE_SEC,
): void {
  const { timestamp, signatures } = parseHeader(header);
  if (Math.abs(now - timestamp) > toleranceSec) {
    throw new WebhookDomainError('TIMESTAMP_OUT_OF_TOLERANCE', 'Timestamp outside tolerance');
  }
  const expected = digest(secret, timestamp, rawBody);
  let matched = false;
  for (const candidate of signatures) {
    if (timingSafeEqual(candidate, expected)) matched = true;
  }
  if (!matched) throw new WebhookDomainError('SIGNATURE_MISMATCH', 'Signature mismatch');
}
