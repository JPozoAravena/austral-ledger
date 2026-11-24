import { createHash } from 'node:crypto';
import { compareStrings } from '../../domain/shared/compare.js';

/** Deterministic JSON: object keys are sorted at every depth, so key order never changes the result. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const members = Object.entries(value)
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`);
    return `{${members.join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

/** sha256 over method, path and canonical body: the same key must always carry the same request. */
export function fingerprint(method: string, path: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method.toUpperCase()}\n${path}\n${canonicalJson(body)}`)
    .digest('hex');
}
