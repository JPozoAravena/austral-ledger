import { isIP } from 'node:net';
import { WebhookDomainError } from './errors.js';

/** Blocked IPv4 ranges as [base, prefix length]: private, loopback, link-local, CGNAT, multicast, reserved. */
const BLOCKED_V4: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const v4ToInt = (ip: string): number =>
  ip.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0);

function isBlockedV4(ip: string): boolean {
  const value = v4ToInt(ip);
  return BLOCKED_V4.some(([base, prefix]) => {
    const size = 2 ** (32 - prefix);
    return Math.floor(value / size) === Math.floor(v4ToInt(base) / size);
  });
}

/** Expands an IPv6 literal into its 8 16-bit groups. */
function expandV6(ip: string): number[] {
  let text = (ip.toLowerCase().split('%')[0] ?? '').trim();
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted?.[1] !== undefined) {
    const v4 = v4ToInt(dotted[1]);
    const groups = `${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
    text = text.slice(0, -dotted[1].length) + groups;
  }
  const [head = '', tail] = text.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const zeros = tail === undefined ? [] : Array<string>(8 - left.length - right.length).fill('0');
  return [...left, ...zeros, ...right].map((group) => parseInt(group, 16));
}

function isBlockedV6(ip: string): boolean {
  const g = expandV6(ip);
  const [first = 0, second = 0, , , , sixth = 0, high = 0, low = 0] = g;
  const embeddedV4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  if (g.slice(0, 7).every((group) => group === 0) && low <= 1) return true; // :: and ::1
  if (g.slice(0, 5).every((group) => group === 0) && sixth === 0xffff) {
    return isBlockedV4(embeddedV4); // IPv4-mapped
  }
  if (first === 0x64 && second === 0xff9b && g.slice(2, 6).every((group) => group === 0)) {
    return isBlockedV4(embeddedV4); // NAT64
  }
  return (first & 0xffc0) === 0xfe80 || (first & 0xfe00) === 0xfc00 || (first & 0xff00) === 0xff00;
}

/** True for addresses a webhook must never target. Unparseable input counts as blocked. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedV4(ip);
  if (version === 6) return isBlockedV6(ip);
  return true;
}

/** Hostname without the brackets that URL keeps around IPv6 literals. */
export const hostnameOf = (url: URL): string => url.hostname.replace(/^\[|\]$/g, '');

/** Syntactic checks only; resolving the host is the caller's job. HTTPS is mandatory unless `allowInsecure`. */
export function parseWebhookUrl(raw: string, allowInsecure: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookDomainError('INVALID_URL', 'Invalid URL');
  }
  if (url.username !== '' || url.password !== '' || url.hostname === '') {
    throw new WebhookDomainError('INVALID_URL', 'URL must not embed credentials');
  }
  const allowed = url.protocol === 'https:' || (allowInsecure && url.protocol === 'http:');
  if (!allowed) throw new WebhookDomainError('INSECURE_URL', 'URL must use https');
  return url;
}
