import { Injectable } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import { ApiError } from '../../common/api-error.js';
import type { AccountType } from '../../domain/ledger/account-type.js';
import type { Executor } from '../../infra/db/client.js';
import { accounts, postings } from '../../infra/db/schema.js';

export type AccountRecord = typeof accounts.$inferSelect;
export type PostingRecord = typeof postings.$inferSelect;

@Injectable()
export class AccountsRepository {
  async insertWallet(db: Executor, ownerRef: string, platformRef: string): Promise<AccountRecord> {
    const [row] = await db
      .insert(accounts)
      .values({ type: 'USER_WALLET', ownerRef, platformRef })
      .returning();
    if (!row) throw new Error('Account insert returned no row');
    return row;
  }

  async findById(db: Executor, id: string): Promise<AccountRecord | null> {
    const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
    return row ?? null;
  }

  /** System accounts are created by `npm run seed`; their absence is a deployment error. */
  async requireSystem(db: Executor, type: AccountType): Promise<AccountRecord> {
    const [row] = await db.select().from(accounts).where(eq(accounts.type, type)).limit(1);
    if (!row)
      throw new ApiError(500, 'SYSTEM_ACCOUNT_MISSING', 'System accounts are not initialised');
    return row;
  }

  /** Newest first. Fetches `limit + 1` rows so the caller can tell whether another page exists. */
  async listPostings(
    db: Executor,
    accountId: string,
    cursor: bigint | null,
    limit: number,
  ): Promise<PostingRecord[]> {
    return db
      .select()
      .from(postings)
      .where(
        cursor === null
          ? eq(postings.accountId, accountId)
          : and(eq(postings.accountId, accountId), lt(postings.id, cursor)),
      )
      .orderBy(desc(postings.id))
      .limit(limit + 1);
  }
}
