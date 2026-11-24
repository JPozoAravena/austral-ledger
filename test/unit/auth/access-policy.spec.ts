import { describe, expect, it } from 'vitest';
import type { ApiScope } from '../../../src/domain/auth/api-key.js';
import { canReadAccount, canWriteAccount } from '../../../src/modules/auth/access-policy.js';
import type { Principal } from '../../../src/modules/auth/principal.js';

const principal = (scope: ApiScope, subjectRef: string): Principal => ({
  keyId: 'k',
  scope,
  subjectRef,
});
const account = { ownerRef: 'user-1', platformRef: 'plat-1' };

describe('access policy', () => {
  it('ops reads and writes everything', () => {
    expect(canReadAccount(principal('ops', 'ops'), account)).toBe(true);
    expect(canWriteAccount(principal('ops', 'ops'), account)).toBe(true);
  });

  it('auditor reads everything but never writes', () => {
    expect(canReadAccount(principal('auditor', 'a'), account)).toBe(true);
    expect(canWriteAccount(principal('auditor', 'a'), account)).toBe(false);
  });

  it('platform only reaches accounts of its own platform', () => {
    expect(canReadAccount(principal('platform', 'plat-1'), account)).toBe(true);
    expect(canReadAccount(principal('platform', 'plat-2'), account)).toBe(false);
    expect(
      canReadAccount(principal('platform', 'plat-1'), { ownerRef: null, platformRef: null }),
    ).toBe(false);
  });

  it('user only reaches accounts it owns', () => {
    expect(canWriteAccount(principal('user', 'user-1'), account)).toBe(true);
    expect(canReadAccount(principal('user', 'user-2'), account)).toBe(false);
    expect(
      canReadAccount(principal('user', 'user-1'), { ownerRef: null, platformRef: 'plat-1' }),
    ).toBe(false);
  });
});
