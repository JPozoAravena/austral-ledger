import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  char,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { API_SCOPES } from '../../domain/auth/api-key.js';
import { ACCOUNT_TYPES } from '../../domain/ledger/account-type.js';

export const accountTypeEnum = pgEnum('account_type', ACCOUNT_TYPES);

export const apiScopeEnum = pgEnum('api_scope', API_SCOPES);
export const payoutStatusEnum = pgEnum('payout_status', ['requested', 'paid', 'failed']);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    type: accountTypeEnum().notNull(),
    ownerRef: text('owner_ref'),
    platformRef: text('platform_ref'),
    currency: char({ length: 3 }).notNull().default('CLP'),
    // Cache of the natural balance, updated in the same transaction as the postings.
    balance: bigint({ mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('accounts_currency_clp', sql`${t.currency} = 'CLP'`),
    check('accounts_wallet_non_negative', sql`${t.type} <> 'USER_WALLET' OR ${t.balance} >= 0`),
  ],
);

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().notNull(),
    description: text().notNull(),
    reversalOf: uuid('reversal_of'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('journal_entries_reversal_of_unique').on(t.reversalOf),
    foreignKey({
      name: 'journal_entries_reversal_of_fk',
      columns: [t.reversalOf],
      foreignColumns: [t.id],
    }),
  ],
);

export const postings = pgTable(
  'postings',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => journalEntries.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    amount: bigint({ mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('postings_amount_non_zero', sql`${t.amount} <> 0`),
    index('postings_account_id_idx').on(t.accountId),
    index('postings_entry_id_idx').on(t.entryId),
  ],
);

export const apiKeys = pgTable('api_keys', {
  id: uuid().primaryKey().defaultRandom(),
  prefix: text().notNull().unique(),
  keyHash: text('key_hash').notNull(),
  scope: apiScopeEnum().notNull(),
  subjectRef: text('subject_ref').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payouts = pgTable(
  'payouts',
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    amount: bigint({ mode: 'bigint' }).notNull(),
    status: payoutStatusEnum().notNull().default('requested'),
    // Fictitious masked bank account. Sensitive: never log it.
    destination: text().notNull(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => journalEntries.id),
    settlementEntryId: uuid('settlement_entry_id').references(() => journalEntries.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('payouts_amount_positive', sql`${t.amount} > 0`),
    index('payouts_account_id_idx').on(t.accountId),
  ],
);
