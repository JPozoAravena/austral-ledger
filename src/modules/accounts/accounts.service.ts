import { Injectable } from '@nestjs/common';
import { notFound } from '../../common/api-error.js';
import { DatabaseService } from '../../infra/db/database.module.js';
import { canReadAccount } from '../auth/access-policy.js';
import type { Principal } from '../auth/principal.js';
import {
  AccountsRepository,
  type AccountRecord,
  type PostingRecord,
} from './accounts.repository.js';
import type { PostingsQuery } from './accounts.schemas.js';

export interface PostingsPage {
  readonly items: PostingRecord[];
  readonly nextCursor: string | null;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: AccountsRepository,
  ) {}

  /** The principal is a platform key (enforced by the controller scope). */
  createWallet(principal: Principal, ownerRef: string): Promise<AccountRecord> {
    return this.repository.insertWallet(this.database.db, ownerRef, principal.subjectRef);
  }

  /** Missing and forbidden accounts are indistinguishable on purpose (BOLA). */
  async getReadable(principal: Principal, id: string): Promise<AccountRecord> {
    const account = await this.repository.findById(this.database.db, id);
    if (account === null || !canReadAccount(principal, account)) throw notFound('Account');
    return account;
  }

  async listPostings(
    principal: Principal,
    id: string,
    query: PostingsQuery,
  ): Promise<PostingsPage> {
    await this.getReadable(principal, id);
    const cursor = query.cursor === undefined ? null : BigInt(query.cursor);
    const rows = await this.repository.listPostings(this.database.db, id, cursor, query.limit);
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > query.limit && last ? last.id.toString() : null,
    };
  }
}
