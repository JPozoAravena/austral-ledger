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
import { ACCOUNT_TYPES } from '../../domain/ledger/account-type.js';

export const accountTypeEnum = pgEnum('account_type', ACCOUNT_TYPES);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    type: accountTypeEnum().notNull(),
    ownerRef: text('owner_ref'),
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
