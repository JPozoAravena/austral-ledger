export const ACCOUNT_TYPES = [
  'USER_WALLET',
  'PLATFORM_FUNDING',
  'PAYOUT_CLEARING',
  'FEE_REVENUE',
  'SYSTEM_SUSPENSE',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type NormalSide = 'debit' | 'credit';

export interface AccountPolicy {
  readonly normalSide: NormalSide;
  readonly allowsNegative: boolean;
}

export const ACCOUNT_POLICIES: Readonly<Record<AccountType, AccountPolicy>> = {
  USER_WALLET: { normalSide: 'credit', allowsNegative: false },
  PLATFORM_FUNDING: { normalSide: 'debit', allowsNegative: true },
  PAYOUT_CLEARING: { normalSide: 'credit', allowsNegative: true },
  FEE_REVENUE: { normalSide: 'credit', allowsNegative: true },
  SYSTEM_SUSPENSE: { normalSide: 'debit', allowsNegative: true },
};
