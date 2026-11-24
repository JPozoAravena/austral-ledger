import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../../src/config/env.js';
import { WebhookDomainError } from '../../../src/domain/webhooks/errors.js';
import { isPrivateAddress, parseWebhookUrl } from '../../../src/domain/webhooks/target-url.js';
import { TargetGuard } from '../../../src/modules/webhooks/target-guard.js';

const baseEnv = {
  DATABASE_URL: 'postgresql://u:p@localhost/db',
  REDIS_URL: 'redis://localhost',
  API_KEY_PEPPER: 'p'.repeat(32),
  WEBHOOK_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::a00:1',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe('parseWebhookUrl', () => {
  it('requires https unless insecure targets are allowed', () => {
    expect(parseWebhookUrl('https://example.com/hook', false).hostname).toBe('example.com');
    expect(() => parseWebhookUrl('http://example.com/hook', false)).toThrow(WebhookDomainError);
    expect(parseWebhookUrl('http://localhost:8080/hook', true).port).toBe('8080');
    expect(() => parseWebhookUrl('ftp://example.com', true)).toThrow(WebhookDomainError);
  });

  it('rejects garbage and embedded credentials', () => {
    expect(() => parseWebhookUrl('not a url', false)).toThrow(WebhookDomainError);
    expect(() => parseWebhookUrl('https://user:pw@example.com', false)).toThrow(WebhookDomainError);
  });
});

describe('TargetGuard', () => {
  const guard = new TargetGuard(parseEnv(baseEnv));

  it.each([
    'https://127.0.0.1/hook',
    'https://[::1]/hook',
    'https://10.0.0.5/hook',
    'https://169.254.169.254/latest',
    'https://[::ffff:192.168.0.1]/hook',
  ])('rejects %s', async (url) => {
    await expect(guard.resolve(url)).rejects.toMatchObject({ code: 'PRIVATE_ADDRESS' });
  });

  it('rejects http', async () => {
    await expect(guard.resolve('http://8.8.8.8/hook')).rejects.toMatchObject({
      code: 'INSECURE_URL',
    });
  });

  it('accepts a public literal and, with the dev flag, loopback over http', async () => {
    await expect(guard.resolve('https://8.8.8.8/hook')).resolves.toMatchObject({
      address: '8.8.8.8',
    });
    const dev = new TargetGuard(parseEnv({ ...baseEnv, WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true' }));
    await expect(dev.resolve('http://127.0.0.1:9000/hook')).resolves.toMatchObject({
      address: '127.0.0.1',
    });
  });
});
