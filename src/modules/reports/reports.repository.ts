import { Injectable } from '@nestjs/common';
import { eq, inArray, lte, sql, type SQL } from 'drizzle-orm';
import {
  ACCOUNT_POLICIES,
  ACCOUNT_TYPES,
  type AccountType,
} from '../../domain/ledger/account-type.js';
import { parseClp, type Clp } from '../../domain/ledger/money.js';
import type { AccountTotals } from '../../domain/ledger/trial-balance.js';
import type { Executor } from '../../infra/db/client.js';
import { accounts, postings } from '../../infra/db/schema.js';

export interface ReconciliationMismatch {
  readonly accountId: string;
  readonly type: AccountType;
  readonly recorded: Clp;
  readonly recalculated: Clp;
}

const DEBIT_NORMAL = ACCOUNT_TYPES.filter((type) => ACCOUNT_POLICIES[type].normalSide === 'debit');

@Injectable()
export class ReportsRepository {
  /** One row per account, aggregated in SQL; postings are never loaded individually. */
  async accountTotals(db: Executor, asOf: Date | undefined): Promise<AccountTotals[]> {
    const rows = await db
      .select({
        accountId: accounts.id,
        type: accounts.type,
        debits: sql<string>`COALESCE(SUM(${postings.amount}) FILTER (WHERE ${postings.amount} > 0), 0)::text`,
        credits: sql<string>`COALESCE(-SUM(${postings.amount}) FILTER (WHERE ${postings.amount} < 0), 0)::text`,
      })
      .from(postings)
      .innerJoin(accounts, eq(accounts.id, postings.accountId))
      .where(asOf === undefined ? undefined : lte(postings.createdAt, asOf))
      .groupBy(accounts.id, accounts.type)
      .orderBy(accounts.id);
    return rows.map((row) => ({
      ...row,
      debits: parseClp(row.debits),
      credits: parseClp(row.credits),
    }));
  }

  /** Accounts whose cached balance differs from the one recalculated from postings. */
  async reconciliationMismatches(db: Executor): Promise<ReconciliationMismatch[]> {
    const net = sql`COALESCE(SUM(${postings.amount}), 0)`;
    const recalculated: SQL = sql`CASE WHEN ${inArray(accounts.type, DEBIT_NORMAL)} THEN ${net} ELSE -${net} END`;
    const rows = await db
      .select({
        accountId: accounts.id,
        type: accounts.type,
        recorded: accounts.balance,
        recalculated: sql<string>`(${recalculated})::text`,
      })
      .from(accounts)
      .leftJoin(postings, eq(postings.accountId, accounts.id))
      .groupBy(accounts.id, accounts.type, accounts.balance)
      .having(sql`${accounts.balance} <> ${recalculated}`)
      .orderBy(accounts.id);
    return rows.map((row) => ({ ...row, recalculated: parseClp(row.recalculated) }));
  }
}
