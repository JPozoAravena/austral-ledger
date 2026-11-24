import type { Principal } from './principal.js';

export interface AccountOwnership {
  readonly ownerRef: string | null;
  readonly platformRef: string | null;
}

/** BOLA policy. Callers must answer 404 (not 403) when this returns false. */
export function canReadAccount(principal: Principal, account: AccountOwnership): boolean {
  switch (principal.scope) {
    case 'ops':
    case 'auditor':
      return true;
    case 'platform':
      return account.platformRef === principal.subjectRef;
    case 'user':
      return account.ownerRef === principal.subjectRef;
  }
}

/** Same as read access, except the auditor is read-only. */
export function canWriteAccount(principal: Principal, account: AccountOwnership): boolean {
  return principal.scope !== 'auditor' && canReadAccount(principal, account);
}
